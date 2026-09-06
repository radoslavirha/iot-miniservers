import { describe, expect, it } from 'vitest';
import { Authenticator, AuthConfigurationError, assertUsableConfig, statusForReason } from './Authenticator.js';
import { AuthConfigSchema } from './schemas/auth.schema.js';
import { FakeTokenVerifier, failureOutcome, successOutcome } from './test/FakeTokenVerifier.js';
import { VerificationReason } from './VerificationOutcome.js';

const config = (mode: string) =>
    AuthConfigSchema.parse({
        mode,
        trustedIssuers: [{
            name: 'dev-local',
            issuer: 'dev',
            audience: 'my-api',
            key: { source: 'value', algorithm: 'HS256', value: 'secret' }
        }]
    });

describe('Authenticator — disabled', () => {
    it('allows without a principal and never calls the verifier', async () => {
        const verifier = new FakeTokenVerifier();
        const decision = await new Authenticator(AuthConfigSchema.parse({}), verifier).authenticate('a-token');

        expect(decision).toEqual({ allowed: true, reason: 'ok' });
        // Not merely allowed — not verified. Verifying and discarding the answer
        // would put a JWKS fetch on the path of a service that opted out.
        expect(verifier.seen).toEqual([]);
    });
});

describe('Authenticator — permissive', () => {
    it('allows a verified request and carries the principal', async () => {
        const verifier = new FakeTokenVerifier(successOutcome({ subject: 'radoslav' }));

        const decision = await new Authenticator(config('permissive'), verifier).authenticate('t');

        expect(decision).toMatchObject({ allowed: true, reason: 'ok' });
        expect(decision).toHaveProperty('principal.subject', 'radoslav');
    });

    it('allows an unverified request, but reports the real reason', async () => {
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.Invalid, 'bad signature'));

        const decision = await new Authenticator(config('permissive'), verifier).authenticate('t');

        expect(decision).toEqual({ allowed: true, reason: 'invalid' });
    });

    it('allows a request with no credential at all, and calls it missing', async () => {
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.Missing));

        const decision = await new Authenticator(config('permissive'), verifier).authenticate(undefined);

        expect(decision).toEqual({ allowed: true, reason: 'missing' });
        // An absent credential reaches the verifier as an empty string, which is
        // what makes `missing` the verifier's answer rather than a special case.
        expect(verifier.seen).toEqual(['']);
    });

    it('carries no principal when verification failed', async () => {
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.Invalid));

        const decision = await new Authenticator(config('permissive'), verifier).authenticate('t');

        expect(decision).not.toHaveProperty('principal');
    });
});

describe('Authenticator — enforced', () => {
    it('allows a verified request', async () => {
        const verifier = new FakeTokenVerifier(successOutcome({ subject: 'radoslav' }));

        const decision = await new Authenticator(config('enforced'), verifier).authenticate('t');

        expect(decision).toMatchObject({ allowed: true });
    });

    it('refuses an invalid credential with 401', async () => {
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.Invalid, 'bad signature'));

        const decision = await new Authenticator(config('enforced'), verifier).authenticate('t');

        expect(decision).toEqual({ allowed: false, reason: 'invalid', status: 401, detail: 'bad signature' });
    });

    it('refuses a missing credential with 401', async () => {
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.Missing));

        expect(await new Authenticator(config('enforced'), verifier).authenticate(undefined)).toMatchObject({
            allowed: false,
            reason: 'missing',
            status: 401
        });
    });

    it('answers 503, not 401, when verification could not be attempted', async () => {
        // Our JWKS fetch failed. Telling the caller 401 blames a token that was
        // never the problem, and is not retriable — a client backing off
        // correctly on 503 would instead give up.
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.Indeterminate, 'JWKS timeout'));

        expect(await new Authenticator(config('enforced'), verifier).authenticate('t')).toMatchObject({
            allowed: false,
            reason: 'indeterminate',
            status: 503
        });
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

describe('assertUsableConfig', () => {
    it('refuses enforced with no trusted issuers', () => {
        const empty = AuthConfigSchema.parse({ mode: 'enforced' });

        expect(() => assertUsableConfig(empty)).toThrow(AuthConfigurationError);
        // The point is to fail loudly at boot rather than run healthy and refuse
        // every request, which reads as a network fault.
        expect(() => assertUsableConfig(empty)).toThrow(/nothing could ever be verified/);
    });

    it('refuses permissive with no trusted issuers', () => {
        expect(() => assertUsableConfig(AuthConfigSchema.parse({ mode: 'permissive' }))).toThrow(
            AuthConfigurationError
        );
    });

    it('accepts disabled with no issuers, which is the untouched default', () => {
        expect(() => assertUsableConfig(AuthConfigSchema.parse({}))).not.toThrow();
    });

    it('is enforced by the constructor, not left to the caller', () => {
        expect(() => new Authenticator(AuthConfigSchema.parse({ mode: 'enforced' }), new FakeTokenVerifier()))
            .toThrow(AuthConfigurationError);
    });
});

describe('Authenticator', () => {
    it('exposes the mode it is running in', () => {
        expect(new Authenticator(config('enforced'), new FakeTokenVerifier()).mode).toBe('enforced');
    });
});
