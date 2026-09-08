import { describe, expect, it } from 'vitest';
import { credentialSourceOf } from './CredentialSource.js';
import { VerifierType } from './VerifierType.js';
import { Authenticator, AuthConfigurationError, buildVerifiers, statusForReason } from './Authenticator.js';
import { AuthConfigSchema } from './schemas/auth.schema.js';
import { FakeTokenVerifier, TEST_METHOD, failureOutcome, successOutcome, verifiersFor } from './test/FakeTokenVerifier.js';
import { TEST_SECRET, mintTestToken } from './test/mintTestToken.js';
import { VerificationReason } from './VerificationOutcome.js';

/** A source carrying `Authorization: Bearer <token>`, the shape JwtVerifier reads. */
const bearer = (token: string) => credentialSourceOf({ authorization: `Bearer ${token}` });
/** A source carrying nothing at all — the anonymous caller. */
const nothing = () => credentialSourceOf({});

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

        const decision = await authenticatorWith(verifier).authenticate(bearer('t'), [TEST_METHOD]);

        expect(decision).toMatchObject({ allowed: true, reason: 'ok' });
        expect(decision).toHaveProperty('principal.subject', 'radoslav');
    });

    it('refuses an invalid credential with 401', async () => {
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.Invalid, 'bad signature'));

        const decision = await authenticatorWith(verifier).authenticate(bearer('t'), [TEST_METHOD]);

        expect(decision).toEqual({ allowed: false, reason: 'invalid', status: 401, detail: 'bad signature' });
    });

    it('refuses a missing credential with 401', async () => {
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.Missing));

        const decision = await authenticatorWith(verifier).authenticate(nothing(), [TEST_METHOD]);

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

        expect(await authenticatorWith(verifier).authenticate(bearer('t'), [TEST_METHOD])).toMatchObject({
            allowed: false,
            reason: 'indeterminate',
            status: 503
        });
    });

    it('carries no principal when verification failed', async () => {
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.Invalid));

        expect(await authenticatorWith(verifier).authenticate(bearer('t'), [TEST_METHOD])).not.toHaveProperty('principal');
    });

    it('has no path that allows an unverified request', async () => {
        // There is no observe-only mode and no disable flag, deliberately: every
        // such state is one where a forgotten config key leaves a service up,
        // healthy and unauthenticated. A route is guarded or it is @Anonymous().
        for (const reason of [VerificationReason.Missing, VerificationReason.Invalid, VerificationReason.UnknownIssuer]) {
            const decision = await authenticatorWith(new FakeTokenVerifier(failureOutcome(reason)))
                .authenticate(nothing(), [TEST_METHOD]);

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

        await expect(authenticator.authenticate(bearer('t'), ['DEVICES'])).rejects.toBeInstanceOf(
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

        expect(await authenticator.authenticate(bearer('t'), [TEST_METHOD]))
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
            bearer(await mintTestToken({ issuer: 'dev', audience: 'my-api', subject: 'a-service' })),
            [TEST_METHOD]
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

describe('Authenticator — a route admitting several methods', () => {
    const IDP = 'IDP';
    const KEY = 'API_KEY';

    const chain = (idp: FakeTokenVerifier, key: FakeTokenVerifier) =>
        new Authenticator({} as never, new Map([[IDP, idp], [KEY, key.readsHeader('x-api-key')]]));

    const idpOnly = () => credentialSourceOf({ authorization: 'Bearer t' });
    const keyOnly = () => credentialSourceOf({ 'x-api-key': 'k' });

    it('accepts the caller the first method recognises', async () => {
        const decision = await chain(
            new FakeTokenVerifier(successOutcome({ subject: 'person' })),
            new FakeTokenVerifier(failureOutcome(VerificationReason.Missing))
        ).authenticate(idpOnly(), [IDP, KEY]);

        expect(decision).toMatchObject({ allowed: true, principal: { subject: 'person' } });
    });

    it('falls through to the second when the first finds no credential of its own', async () => {
        // The reason `extract` belongs to the verifier: "no bearer token here"
        // must not refuse a caller who sent an API key instead.
        const decision = await chain(
            new FakeTokenVerifier(failureOutcome(VerificationReason.Missing)),
            new FakeTokenVerifier(successOutcome({ subject: 'device', kind: 'device' }))
        ).authenticate(keyOnly(), [IDP, KEY]);

        expect(decision).toMatchObject({ allowed: true, principal: { subject: 'device' } });
    });

    it('stops at the first success without consulting later methods', async () => {
        const key = new FakeTokenVerifier(successOutcome());
        const decision = await chain(new FakeTokenVerifier(successOutcome({ subject: 'person' })), key)
            .authenticate(idpOnly(), [IDP, KEY]);

        expect(decision).toMatchObject({ allowed: true });
        expect(key.seen).toHaveLength(0);
    });

    it('tries them in the order the route listed, not the order they were configured', async () => {
        const idp = new FakeTokenVerifier(successOutcome({ subject: 'person' }));
        const key = new FakeTokenVerifier(successOutcome({ subject: 'device' }));
        const both = credentialSourceOf({ authorization: 'Bearer t', 'x-api-key': 'k' });

        const decision = await chain(idp, key).authenticate(both, [KEY, IDP]);

        expect(decision).toMatchObject({ allowed: true, principal: { subject: 'device' } });
    });

    describe('when every method fails, the reason is folded by severity', () => {
        it('lets 503 survive a later 401', async () => {
            // The defect a naive chain has. A JWKS timeout followed by
            // "no API key present" must not answer 401: the caller's token was
            // fine and the fault is ours, so they would retry forever against an
            // outage they cannot see.
            const decision = await chain(
                new FakeTokenVerifier(failureOutcome(VerificationReason.Indeterminate, 'jwks timeout')),
                new FakeTokenVerifier(failureOutcome(VerificationReason.Missing))
            ).authenticate(idpOnly(), [IDP, KEY]);

            expect(decision).toMatchObject({ allowed: false, status: 503, reason: VerificationReason.Indeterminate });
        });

        it('lets 503 survive whichever order it arrives in', async () => {
            const decision = await chain(
                new FakeTokenVerifier(failureOutcome(VerificationReason.Missing)),
                new FakeTokenVerifier(failureOutcome(VerificationReason.Indeterminate))
            ).authenticate(keyOnly(), [IDP, KEY]);

            expect(decision).toMatchObject({ status: 503 });
        });

        it('prefers a rejected credential over one that was never sent', async () => {
            // `invalid` is what the operator needs in the log. Reporting
            // `missing` would send them looking for a header nobody meant to
            // send.
            const decision = await chain(
                new FakeTokenVerifier(failureOutcome(VerificationReason.Invalid, 'bad signature')),
                new FakeTokenVerifier(failureOutcome(VerificationReason.Missing))
            ).authenticate(idpOnly(), [IDP, KEY]);

            expect(decision).toMatchObject({ status: 401, reason: VerificationReason.Invalid, detail: 'bad signature' });
        });

        it('reports missing only when nothing was presented at all', async () => {
            const decision = await chain(
                new FakeTokenVerifier(failureOutcome(VerificationReason.Missing)),
                new FakeTokenVerifier(failureOutcome(VerificationReason.Missing))
            ).authenticate(credentialSourceOf({}), [IDP, KEY]);

            expect(decision).toMatchObject({ status: 401, reason: VerificationReason.Missing });
        });
    });

    it('refuses to run on an endpoint that named no method', async () => {
        const authenticator = chain(new FakeTokenVerifier(), new FakeTokenVerifier());

        await expect(authenticator.authenticate(idpOnly(), [])).rejects.toBeInstanceOf(AuthConfigurationError);
    });

    it('is loud about an unconfigured method even when an earlier one would have succeeded', async () => {
        // Every method is resolved before any runs, so a typo cannot hide behind
        // a working first method and surface months later as an unplaceable 500.
        const authenticator = chain(new FakeTokenVerifier(successOutcome()), new FakeTokenVerifier());

        await expect(authenticator.authenticate(idpOnly(), [IDP, 'NOPE'])).rejects.toBeInstanceOf(AuthConfigurationError);
    });
});
