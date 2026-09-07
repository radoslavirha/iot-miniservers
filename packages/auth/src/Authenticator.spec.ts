import { describe, expect, it } from 'vitest';
import { VerifierType } from './VerifierType.js';
import { Authenticator, AuthConfigurationError, buildVerifiers, statusForReason } from './Authenticator.js';
import { AuthConfigSchema } from './schemas/auth.schema.js';
import { FakeTokenVerifier, TEST_METHOD, failureOutcome, successOutcome, verifiersFor } from './test/FakeTokenVerifier.js';
import { TEST_SECRET, mintTestToken } from './test/mintTestToken.js';
import { VerificationReason } from './VerificationOutcome.js';

const config = AuthConfigSchema.parse({
    [TEST_METHOD]: {
        type: VerifierType.BearerJwt,
        trustedIssuers: [{
            name: 'dev-local',
            issuer: 'dev',
            audience: 'my-api',
            key: { source: 'value', algorithm: 'HS256', value: 'secret' }
        }]
    }
});

const authenticatorWith = (verifier: FakeTokenVerifier) => new Authenticator(config, verifiersFor(verifier));

describe('Authenticator', () => {
    it('allows a verified request and carries the principal', async () => {
        const verifier = new FakeTokenVerifier(successOutcome({ subject: 'radoslav' }));

        const decision = await authenticatorWith(verifier).authenticate('t', TEST_METHOD);

        expect(decision).toMatchObject({ allowed: true, reason: 'ok' });
        expect(decision).toHaveProperty('principal.subject', 'radoslav');
    });

    it('refuses an invalid credential with 401', async () => {
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.Invalid, 'bad signature'));

        const decision = await authenticatorWith(verifier).authenticate('t', TEST_METHOD);

        expect(decision).toEqual({ allowed: false, reason: 'invalid', status: 401, detail: 'bad signature' });
    });

    it('refuses a missing credential with 401', async () => {
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.Missing));

        const decision = await authenticatorWith(verifier).authenticate(undefined, TEST_METHOD);

        expect(decision).toMatchObject({ allowed: false, reason: 'missing', status: 401 });
        // An absent credential reaches the verifier as an empty string, which is
        // what makes `missing` the verifier's answer rather than a special case.
        expect(verifier.seen).toEqual(['']);
    });

    it('answers 503, not 401, when verification could not be attempted', async () => {
        // Our JWKS fetch failed. Telling the caller 401 blames a token that was
        // never the problem, and is not retriable — a client backing off
        // correctly on 503 would instead give up.
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.Indeterminate, 'JWKS timeout'));

        expect(await authenticatorWith(verifier).authenticate('t', TEST_METHOD)).toMatchObject({
            allowed: false,
            reason: 'indeterminate',
            status: 503
        });
    });

    it('carries no principal when verification failed', async () => {
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.Invalid));

        expect(await authenticatorWith(verifier).authenticate('t', TEST_METHOD)).not.toHaveProperty('principal');
    });

    it('has no path that allows an unverified request', async () => {
        // There is no observe-only mode and no disable flag, deliberately: every
        // such state is one where a forgotten config key leaves a service up,
        // healthy and unauthenticated. A route is guarded or it is @Anonymous().
        for (const reason of [VerificationReason.Missing, VerificationReason.Invalid, VerificationReason.UnknownIssuer]) {
            const decision = await authenticatorWith(new FakeTokenVerifier(failureOutcome(reason)))
                .authenticate(undefined, TEST_METHOD);

            expect(decision.allowed).toBe(false);
        }
    });

    it('reports the methods it can verify, for the boot log', () => {
        expect(authenticatorWith(new FakeTokenVerifier()).methods).toEqual([TEST_METHOD]);
    });
});

describe('Authenticator — the method registry', () => {
    it('fails loudly when a route asks for a method nothing is configured for', async () => {
        // A deployment or programmer error, not a caller's. A 401 here would
        // send somebody hunting for a bad token that was never the problem.
        const authenticator = authenticatorWith(new FakeTokenVerifier());

        await expect(authenticator.authenticate('t', 'DEVICES')).rejects.toBeInstanceOf(
            AuthConfigurationError
        );
    });

    it('routes to the verifier registered under the name asked for', async () => {
        // Two entries, same mechanism, different callers — the arrangement the
        // old shape could not express, where one `jwt` key meant a cluster token
        // was accepted anywhere a human's was.
        const people = new FakeTokenVerifier(successOutcome({ subject: 'a-person' }));
        const cluster = new FakeTokenVerifier(successOutcome({ subject: 'a-pod' }));
        const authenticator = new Authenticator(config, new Map([
            [TEST_METHOD, people],
            ['CLUSTER', cluster]
        ]));

        expect(await authenticator.authenticate('t', TEST_METHOD))
            .toHaveProperty('principal.subject', 'a-person');
        expect(people.seen).toEqual(['t']);
        expect(cluster.seen).toEqual([]);
    });
});

describe('buildVerifiers', () => {
    it('builds a working verifier from configuration alone', async () => {
        // The end-to-end wiring, and the reason `config/localhost.json` is an
        // issuer row rather than a bypass: a real token, really signed, really
        // verified, with nothing running.
        const parsed = AuthConfigSchema.parse({
            [TEST_METHOD]: {
                type: VerifierType.BearerJwt,
                trustedIssuers: [{
                    name: 'dev-local',
                    issuer: 'dev',
                    audience: 'my-api',
                    subjectKind: 'service',
                    key: { source: 'value', algorithm: 'HS256', value: TEST_SECRET }
                }]
            }
        });

        const decision = await new Authenticator(parsed).authenticate(
            await mintTestToken({ issuer: 'dev', audience: 'my-api', subject: 'a-service' }),
            TEST_METHOD
        );

        expect(decision).toMatchObject({ allowed: true, reason: 'ok' });
        expect(decision).toHaveProperty('principal.kind', 'service');
    });

    it('builds nothing when nothing is configured', () => {
        expect([...buildVerifiers(AuthConfigSchema.parse({})).keys()]).toEqual([]);
    });
});

describe('statusForReason', () => {
    it('maps every reason, and only indeterminate is a server error', () => {
        expect(statusForReason(VerificationReason.Ok)).toBe(200);
        expect(statusForReason(VerificationReason.Missing)).toBe(401);
        expect(statusForReason(VerificationReason.Invalid)).toBe(401);
        expect(statusForReason(VerificationReason.WrongAudience)).toBe(401);
        expect(statusForReason(VerificationReason.UnknownIssuer)).toBe(401);
        expect(statusForReason(VerificationReason.Indeterminate)).toBe(503);
    });
});
