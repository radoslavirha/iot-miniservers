import { AuthConfigurationError, VerificationReason } from '@radoslavirha/auth';
import { CommonUtils, StringUtils } from '@radoslavirha/utils';
import type { Principal } from '@radoslavirha/auth';
import { inject } from '@tsed/di';
import { ServiceUnavailable, Unauthorized } from '@tsed/exceptions';
import { Middleware } from '@tsed/platform-middlewares';
import { Context } from '@tsed/platform-params';
import type { PlatformContext } from '@tsed/platform-http';
import { AuthenticationService } from './AuthenticationService.js';

/**
 * Where the resolved principal is parked on the request context.
 *
 * A single well-known key rather than a property on the request object: Ts.ED
 * owns the context, and squatting on `request.user` would collide with any
 * other library that assumes the same field is theirs.
 */
export const PRINCIPAL_CONTEXT_KEY = 'auth:principal';

/**
 * Options `UseAuth` merges onto the endpoint. Read back with
 * `ctx.endpoint.store.get(AuthGuard)`.
 */
export interface AuthGuardOptions {
    /**
     * Skip authentication for this endpoint entirely.
     *
     * Set by `@Anonymous()`. It is deliberately a per-endpoint opt-**out** of a
     * guard that is otherwise applied to the whole controller: a route added
     * tomorrow inherits protection by default, where an opt-in scheme would
     * leave it open and silent.
     */
    readonly anonymous?: boolean;
    /**
     * Which named set of callers this endpoint admits.
     *
     * Carried per endpoint rather than per service, so one API can admit its
     * people on admin routes and a device fleet elsewhere without either
     * learning about the other. Required, and set by `@Authenticate(method)` — a
     * default would silently pick one for a route that meant to ask for another.
     *
     * A `string`, because the names belong to the service: it declares its own
     * enum and uses it here and in `createAuthConfigSchema`, so the two cannot
     * disagree.
     */
    readonly method?: string;
}

/**
 * Turns the framework-agnostic decision into an HTTP outcome.
 *
 * All the policy lives in `Authenticator`; this class only knows how to read a
 * header, throw the right exception, and park the principal. That is why every
 * outcome is testable without a server.
 */
@Middleware()
export class AuthGuard {
    /**
     * Resolved per call rather than injected as a field.
     *
     * Ts.ED gives a `@Middleware()` neither constructor injection nor a working
     * `@Inject()` property here: the constructor argument arrives `undefined`,
     * and the property form resolves the token but yields `undefined` at call
     * time. Both produce a 500 where a 401 belongs, on the very first guarded
     * request. `inject()` resolves from the active container when the request is
     * actually being handled, which is the one form that works.
     *
     * Hand-built unit tests cannot see any of this, because they supply the
     * dependency themselves. It took an integration test through the real
     * container to surface it — twice.
     */
    protected authenticator(): AuthenticationService {
        return inject(AuthenticationService);
    }

    async use(@Context() ctx: PlatformContext): Promise<void> {
        const options = ctx.endpoint?.store.get(AuthGuard) as AuthGuardOptions | undefined;

        // The allowlist. Explicit, per endpoint, and visible in the source next
        // to the route it opens.
        if (options?.anonymous === true) {
            return;
        }

        if (CommonUtils.isUndefined(options?.method)) {
            // The guard ran on a route that never said what it wanted verified,
            // which means it was wired up by hand rather than by `@Authenticate`.
            // Loud, because the alternative is a route silently open.
            throw new AuthConfigurationError(
                'AuthGuard ran on an endpoint with no auth method; use @Authenticate(method) or @Anonymous().'
            );
        }

        const decision = await this.authenticator().authenticate(
            bearerFrom(ctx.request.get('authorization')),
            options.method
        );

        if (!decision.allowed) {
            throw exceptionFor(decision.reason);
        }

        ctx.set(PRINCIPAL_CONTEXT_KEY, decision.principal);
    }
}

/**
 * Extracts the credential from an `Authorization` header.
 *
 * Returns `undefined` rather than the raw header for anything that is not a
 * bearer token, so `Basic …` reads as "no credential" instead of reaching the
 * JWT verifier as garbage and being counted as `invalid`.
 *
 * The scheme is matched case-insensitively: RFC 7235 says it is
 * case-insensitive, and clients do send `bearer`.
 */
export const bearerFrom = (header: string | undefined): string | undefined => {
    if (!StringUtils.isNotEmpty(header)) {
        return undefined;
    }

    const [scheme, ...rest] = header.trim().split(/\s+/);
    if (scheme?.toLowerCase() !== 'bearer' || rest.length === 0) {
        return undefined;
    }

    return rest.join(' ');
};

/**
 * `indeterminate` is a `503`; everything else is a `401`.
 *
 * **The verifier's `detail` is deliberately not passed in.** That text exists
 * for operators — a JOSE error, the rejected `iss`, the audience that did not
 * match — and telling the caller which part of their forgery to fix next is a
 * gift. It is not enough to leave it out of the message: Ts.ED's exceptions
 * append an inner exception's message to their own, so passing the detail as
 * `innerException` puts it straight back on the wire. A test pins that.
 *
 * The detail stays on the `AuthDecision` for whoever wants to log it.
 */
const exceptionFor = (reason: VerificationReason): Error =>
    reason === VerificationReason.Indeterminate
        ? new ServiceUnavailable('Authentication is temporarily unavailable.')
        : new Unauthorized('Authentication required.');

/** Reads the principal a successful guard run parked on the context. */
export const principalOf = (ctx: PlatformContext): Principal | undefined =>
    ctx.get<Principal>(PRINCIPAL_CONTEXT_KEY);
