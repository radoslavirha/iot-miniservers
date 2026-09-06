import { describe, expect, it, vi } from 'vitest';
import { AuthConfigSchema, FakeTokenVerifier, VerificationReason, failureOutcome, successOutcome } from '@radoslavirha/auth';
import type { Principal } from '@radoslavirha/auth';
import { ServiceUnavailable, Unauthorized } from '@tsed/exceptions';
import type { PlatformContext } from '@tsed/platform-http';
import { AuthGuard, PRINCIPAL_CONTEXT_KEY, bearerFrom, principalOf } from './AuthGuard.js';
import { AuthenticationService } from './AuthenticationService.js';

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

/**
 * A stand-in for the bits of `PlatformContext` the guard touches. Booting a
 * platform to assert on a header read would test Ts.ED, not this.
 */
const contextOf = (header?: string, endpointOptions?: unknown) => {
    const store = new Map<unknown, unknown>();
    const values = new Map<string, unknown>();
    if (endpointOptions !== undefined) {
        store.set(AuthGuard, endpointOptions);
    }

    return {
        request: { get: (name: string) => (name === 'authorization' ? header : undefined) },
        endpoint: { store: { get: (key: unknown) => store.get(key) } },
        set: (key: string, value: unknown) => values.set(key, value),
        get: <T>(key: string) => values.get(key) as T
    } as unknown as PlatformContext;
};

const guardWith = (service: AuthenticationService): AuthGuard => new AuthGuard(service);

describe('bearerFrom', () => {
    it('extracts the token from a bearer header', () => {
        expect(bearerFrom('Bearer abc.def.ghi')).toBe('abc.def.ghi');
    });

    it('matches the scheme case-insensitively, because clients send lowercase', () => {
        expect(bearerFrom('bearer abc')).toBe('abc');
        expect(bearerFrom('BEARER abc')).toBe('abc');
    });

    it('tolerates surrounding and repeated whitespace', () => {
        expect(bearerFrom('  Bearer   abc  ')).toBe('abc');
    });

    it('ignores a non-bearer scheme rather than passing it on as garbage', () => {
        // Reaching the JWT verifier, `Basic …` would be counted as `invalid`,
        // which reads as an attack rather than a client using the wrong scheme.
        expect(bearerFrom('Basic dXNlcjpwYXNz')).toBeUndefined();
    });

    it('ignores a bearer scheme with no token', () => {
        expect(bearerFrom('Bearer')).toBeUndefined();
        expect(bearerFrom('Bearer   ')).toBeUndefined();
    });

    it('returns undefined when there is no header at all', () => {
        expect(bearerFrom(undefined)).toBeUndefined();
    });
});

describe('AuthGuard', () => {
    it('parks the principal on the context when verification succeeds', async () => {
        const principal: Partial<Principal> = { subject: 'radoslav' };
        const service = new AuthenticationService(config('enforced'), new FakeTokenVerifier(successOutcome(principal)));
        const ctx = contextOf('Bearer a-token');

        await guardWith(service).use(ctx);

        expect(principalOf(ctx)).toMatchObject({ subject: 'radoslav' });
    });

    it('hands the extracted token to the verifier, not the whole header', async () => {
        const verifier = new FakeTokenVerifier(successOutcome());
        const service = new AuthenticationService(config('enforced'), verifier);

        await guardWith(service).use(contextOf('Bearer a-token'));

        expect(verifier.seen).toEqual(['a-token']);
    });

    it('throws Unauthorized when the credential is refused', async () => {
        const service = new AuthenticationService(
            config('enforced'),
            new FakeTokenVerifier(failureOutcome(VerificationReason.Invalid, 'bad signature'))
        );

        await expect(guardWith(service).use(contextOf('Bearer nope'))).rejects.toBeInstanceOf(Unauthorized);
    });

    it('throws ServiceUnavailable when verification could not be attempted', async () => {
        // Our problem, not the caller's. A 401 here would blame a token that was
        // never at fault, and is not retriable.
        const service = new AuthenticationService(
            config('enforced'),
            new FakeTokenVerifier(failureOutcome(VerificationReason.Indeterminate, 'JWKS timeout'))
        );

        await expect(guardWith(service).use(contextOf('Bearer t'))).rejects.toBeInstanceOf(ServiceUnavailable);
    });

    it('does not leak the operator-facing detail to the caller', async () => {
        const service = new AuthenticationService(
            config('enforced'),
            new FakeTokenVerifier(failureOutcome(VerificationReason.WrongAudience, 'aud was other-api'))
        );

        const error = await guardWith(service)
            .use(contextOf('Bearer t'))
            .then(() => undefined, (e: unknown) => e as Error);

        // Telling an attacker which part of the forgery to fix is a gift.
        expect(error).toBeInstanceOf(Error);
        expect(error?.message).not.toContain('other-api');
        expect(error?.message).toBe('Authentication required.');
    });

    it('skips everything for an endpoint marked anonymous', async () => {
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.Missing));
        const service = new AuthenticationService(config('enforced'), verifier);
        const ctx = contextOf(undefined, { anonymous: true });

        await expect(guardWith(service).use(ctx)).resolves.toBeUndefined();
        expect(verifier.seen).toEqual([]);
        expect(principalOf(ctx)).toBeUndefined();
    });

    it('protects an endpoint that carries other options but not anonymous', async () => {
        const service = new AuthenticationService(
            config('enforced'),
            new FakeTokenVerifier(failureOutcome(VerificationReason.Missing))
        );

        await expect(guardWith(service).use(contextOf(undefined, { role: 'admin' })))
            .rejects.toBeInstanceOf(Unauthorized);
    });

    it('allows and parks nobody in permissive when the credential fails', async () => {
        const service = new AuthenticationService(
            config('permissive'),
            new FakeTokenVerifier(failureOutcome(VerificationReason.Missing))
        );
        const ctx = contextOf(undefined);

        await expect(guardWith(service).use(ctx)).resolves.toBeUndefined();
        // No placeholder principal is invented.
        expect(principalOf(ctx)).toBeUndefined();
    });

    it('allows without verifying at all when disabled', async () => {
        const verifier = new FakeTokenVerifier();
        const service = new AuthenticationService(AuthConfigSchema.parse({}), verifier);
        const ctx = contextOf('Bearer t');

        await expect(guardWith(service).use(ctx)).resolves.toBeUndefined();
        expect(verifier.seen).toEqual([]);
        expect(principalOf(ctx)).toBeUndefined();
    });

    it('survives an endpoint with no store, which is how a non-endpoint context arrives', async () => {
        const service = new AuthenticationService(config('permissive'), new FakeTokenVerifier(successOutcome()));
        const ctx = {
            request: { get: () => 'Bearer t' },
            endpoint: undefined,
            set: vi.fn(),
            get: vi.fn()
        } as unknown as PlatformContext;

        await expect(guardWith(service).use(ctx)).resolves.toBeUndefined();
    });
});

describe('PRINCIPAL_CONTEXT_KEY', () => {
    it('is namespaced, so nothing else on the context can collide with it', () => {
        expect(PRINCIPAL_CONTEXT_KEY).toBe('auth:principal');
    });
});
