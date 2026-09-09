import { describe, expect, it, vi } from 'vitest';
import {
    AuthConfigSchema,
    AuthConfigurationError,
    FakeTokenVerifier,
    VerificationReason,
    failureOutcome,
    successOutcome,
    verifiersFor,
    VerifierType,
    TEST_METHOD
} from '@radoslavirha/auth';
import type { Principal } from '@radoslavirha/auth';
import { Forbidden, ServiceUnavailable, Unauthorized } from '@tsed/exceptions';
import type { PlatformContext } from '@tsed/platform-http';
import { AuthGuard, PRINCIPAL_CONTEXT_KEY, encodeMethods, principalOf } from './AuthGuard.js';
import { AuthenticationService } from './AuthenticationService.js';

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

/** The store `@Authenticate(TEST_METHOD)` writes onto every endpoint. */
const GUARDED = { methods: encodeMethods([TEST_METHOD]) };

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
        // Answers any header, because a verifier — not the guard — decides which
        // one it reads. Only `authorization` is populated here, since the real
        // verifier under test is the bearer one.
        request: { get: (name: string) => (name.toLowerCase() === 'authorization' ? header : undefined) },
        endpoint: { store: { get: (key: unknown) => store.get(key) } },
        set: (key: string, value: unknown) => values.set(key, value),
        get: <T>(key: string) => values.get(key) as T
    } as unknown as PlatformContext;
};

const guardWith = (service: AuthenticationService): AuthGuard => {
    const guard = new AuthGuard();
    // Stands in for the container: the guard resolves its service per call.
    Object.defineProperty(guard, 'authenticator', { value: () => service, configurable: true });
    return guard;
};

describe('AuthGuard', () => {
    it('parks the principal on the context when verification succeeds', async () => {
        const principal: Partial<Principal> = { subject: 'radoslav' };
        const service = new AuthenticationService(config, verifiersFor(new FakeTokenVerifier(successOutcome(principal))));
        const ctx = contextOf('Bearer a-token', GUARDED);

        await guardWith(service).use(ctx);

        expect(principalOf(ctx)).toMatchObject({ subject: 'radoslav' });
    });

    it('hands the extracted token to the verifier, not the whole header', async () => {
        const verifier = new FakeTokenVerifier(successOutcome());
        const service = new AuthenticationService(config, verifiersFor(verifier));

        await guardWith(service).use(contextOf('Bearer a-token', GUARDED));

        expect(verifier.seen).toEqual(['a-token']);
    });

    it('throws Unauthorized when the credential is refused', async () => {
        const service = new AuthenticationService(config, verifiersFor(new FakeTokenVerifier(failureOutcome(VerificationReason.Invalid, 'bad signature'))));

        await expect(guardWith(service).use(contextOf('Bearer nope', GUARDED))).rejects.toBeInstanceOf(Unauthorized);
    });

    it('throws ServiceUnavailable when verification could not be attempted', async () => {
        // Our problem, not the caller's. A 401 here would blame a token that was
        // never at fault, and is not retriable.
        const service = new AuthenticationService(config, verifiersFor(new FakeTokenVerifier(failureOutcome(VerificationReason.Indeterminate, 'JWKS timeout'))));

        await expect(guardWith(service).use(contextOf('Bearer t', GUARDED))).rejects.toBeInstanceOf(ServiceUnavailable);
    });

    it('does not leak the operator-facing detail to the caller', async () => {
        const service = new AuthenticationService(config, verifiersFor(new FakeTokenVerifier(failureOutcome(VerificationReason.WrongAudience, 'aud was other-api'))));

        const error = await guardWith(service)
            .use(contextOf('Bearer t', GUARDED))
            .then(() => undefined, (e: unknown) => e as Error);

        // Telling an attacker which part of the forgery to fix is a gift.
        expect(error).toBeInstanceOf(Error);
        expect(error?.message).not.toContain('other-api');
        expect(error?.message).toBe('Authentication required.');
    });

    it('skips everything for an endpoint marked anonymous', async () => {
        const verifier = new FakeTokenVerifier(failureOutcome(VerificationReason.Missing));
        const service = new AuthenticationService(config, verifiersFor(verifier));
        const ctx = contextOf(undefined, { anonymous: true });

        await expect(guardWith(service).use(ctx)).resolves.toBeUndefined();
        expect(verifier.seen).toEqual([]);
        expect(principalOf(ctx)).toBeUndefined();
    });

    it('protects an endpoint that carries other options but not anonymous', async () => {
        const service = new AuthenticationService(config, verifiersFor(new FakeTokenVerifier(failureOutcome(VerificationReason.Missing))));

        await expect(guardWith(service).use(contextOf(undefined, { ...GUARDED, role: 'admin' })))
            .rejects.toBeInstanceOf(Unauthorized);
    });

    it('parks no principal when the credential is refused', async () => {
        const service = new AuthenticationService(config, verifiersFor(new FakeTokenVerifier(failureOutcome(VerificationReason.Missing))));
        const ctx = contextOf(undefined, GUARDED);

        await expect(guardWith(service).use(ctx)).rejects.toBeInstanceOf(Unauthorized);
        // No placeholder principal is invented — a fabricated subject in an
        // audit column is worse than an empty one.
        expect(principalOf(ctx)).toBeUndefined();
    });

    it('refuses rather than allowing when nothing is configured to verify with', async () => {
        // The state a disable flag or an observe-only mode used to make
        // survivable. It is now a loud error, so a values file that dropped the
        // auth block cannot leave a guarded route open.
        const service = new AuthenticationService(AuthConfigSchema.parse({}));

        await expect(guardWith(service).use(contextOf('Bearer t', GUARDED)))
            .rejects.toBeInstanceOf(AuthConfigurationError);
    });

    it('fails loudly on an endpoint that named no method, rather than letting it through', async () => {
        // Only reachable by wiring the middleware by hand instead of using
        // @Authenticate. Allowing it would be a silently public route.
        const service = new AuthenticationService(config, verifiersFor(new FakeTokenVerifier(successOutcome())));
        const ctx = {
            request: { get: () => 'Bearer t' },
            endpoint: undefined,
            set: vi.fn(),
            get: vi.fn()
        } as unknown as PlatformContext;

        await expect(guardWith(service).use(ctx)).rejects.toBeInstanceOf(AuthConfigurationError);
    });
});

describe('AuthGuard — several methods on one route', () => {
    it('passes every named method through, in order', async () => {
        const idp = new FakeTokenVerifier(failureOutcome(VerificationReason.Missing));
        const key = new FakeTokenVerifier(successOutcome({ subject: 'device' })).readsHeader('x-api-key');
        const service = new AuthenticationService(config, new Map([['IDP', idp], ['API_KEY', key]]));
        const ctx = contextOf(undefined, { methods: encodeMethods(['IDP', 'API_KEY']) });

        await expect(guardWith(service).use(ctx)).resolves.toBeUndefined();
        expect(principalOf(ctx)).toMatchObject({ subject: 'device' });
    });

    it('refuses an endpoint whose store carries an unreadable method list', async () => {
        // Rather than treating a corrupt store as "no requirement", which would
        // leave the route open. Loud beats silent here in every case.
        const service = new AuthenticationService(config, verifiersFor(new FakeTokenVerifier(successOutcome())));
        const ctx = contextOf('Bearer t', { methods: 'not json' });

        await expect(guardWith(service).use(ctx)).rejects.toBeInstanceOf(AuthConfigurationError);
    });
});

describe('AuthGuard role checks', () => {
    const withRoles = (...requirements: string[][]) => ({ ...GUARDED, roles: requirements });
    const holder = (roles: string[]) =>
        new AuthenticationService(config, verifiersFor(new FakeTokenVerifier(successOutcome({ subject: 'radoslav', roles }))));

    it('admits a caller holding the required role', async () => {
        const ctx = contextOf('Bearer t', withRoles(['qr-manager.admin']));

        await expect(guardWith(holder(['qr-manager.admin'])).use(ctx)).resolves.toBeUndefined();
        expect(principalOf(ctx)).toMatchObject({ subject: 'radoslav' });
    });

    it('admits a caller holding any one of several', async () => {
        // "a or b", not "a and b". A route names the set it admits.
        const ctx = contextOf('Bearer t', withRoles(['qr-manager.admin', 'qr-manager.editor']));

        await expect(guardWith(holder(['qr-manager.editor'])).use(ctx)).resolves.toBeUndefined();
    });

    it('refuses with 403, not 401, when the role is missing', async () => {
        // The credential is good; signing in again cannot fix it, and a 401
        // would send the frontend round a login loop with no exit.
        const ctx = contextOf('Bearer t', withRoles(['qr-manager.admin']));

        await expect(guardWith(holder(['qr-manager.reader'])).use(ctx)).rejects.toBeInstanceOf(Forbidden);
    });

    it('refuses a caller with no roles at all', async () => {
        const ctx = contextOf('Bearer t', withRoles(['qr-manager.admin']));

        await expect(guardWith(holder([])).use(ctx)).rejects.toBeInstanceOf(Forbidden);
    });

    it('names no role in the refusal', async () => {
        // Naming it enumerates the permission model to anyone holding any valid
        // token, and the caller cannot act on it either way.
        const ctx = contextOf('Bearer t', withRoles(['qr-manager.admin']));
        const error = await guardWith(holder([])).use(ctx).then(() => undefined, (e: Error) => e);

        expect(error?.message).not.toContain('qr-manager.admin');
    });

    it('does not check roles when none are required', async () => {
        // Every route that existed before this feature. Authentication alone.
        const ctx = contextOf('Bearer t', GUARDED);

        await expect(guardWith(holder([])).use(ctx)).resolves.toBeUndefined();
    });

    it('treats an empty role list as no requirement rather than an impossible one', async () => {
        // `@RequireRoles()` with no argument is a mistake, but failing closed on
        // it would refuse every caller with a 403 that no role can satisfy —
        // indistinguishable from a policy bug. Authentication still applies.
        const ctx = contextOf('Bearer t', withRoles([]));

        await expect(guardWith(holder([])).use(ctx)).resolves.toBeUndefined();
    });

    it('requires BOTH when a class-level and a method-level decorator apply', async () => {
        // The case that motivated the nesting. A flat list would have merged
        // these into one "any of" set and let a reader through the admin route.
        const ctx = contextOf('Bearer t', withRoles(['qr-manager.reader'], ['qr-manager.admin']));

        await expect(guardWith(holder(['qr-manager.reader'])).use(ctx)).rejects.toBeInstanceOf(Forbidden);
    });

    it('admits the caller who satisfies every requirement', async () => {
        const ctx = contextOf('Bearer t', withRoles(['qr-manager.reader'], ['qr-manager.admin']));

        await expect(guardWith(holder(['qr-manager.reader', 'qr-manager.admin'])).use(ctx)).resolves.toBeUndefined();
    });

    it('refuses someone holding only the narrower role, since the floor still applies', async () => {
        // Fail-closed, and the argument for issuing roles hierarchically: an
        // admin-only token satisfies the admin entry and not the reader one.
        // Authentik group parentage is what makes that token carry both.
        const ctx = contextOf('Bearer t', withRoles(['qr-manager.reader'], ['qr-manager.admin']));

        await expect(guardWith(holder(['qr-manager.admin'])).use(ctx)).rejects.toBeInstanceOf(Forbidden);
    });

    it('refuses an unauthenticated caller with 401 before ever reaching the role check', async () => {
        // Ordering, asserted rather than assumed: no credential must read as
        // "sign in", not "you lack a role".
        const service = new AuthenticationService(config, verifiersFor(new FakeTokenVerifier(failureOutcome(VerificationReason.Missing))));
        const ctx = contextOf(undefined, withRoles(['qr-manager.admin']));

        await expect(guardWith(service).use(ctx)).rejects.toBeInstanceOf(Unauthorized);
    });
});

describe('PRINCIPAL_CONTEXT_KEY', () => {
    it('is namespaced, so nothing else on the context can collide with it', () => {
        expect(PRINCIPAL_CONTEXT_KEY).toBe('auth:principal');
    });
});
