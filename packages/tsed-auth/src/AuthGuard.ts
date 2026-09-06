import { VerificationReason } from '@radoslavirha/auth';
import type { Principal } from '@radoslavirha/auth';
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
}

/**
 * Turns the framework-agnostic decision into an HTTP outcome.
 *
 * All the policy lives in `Authenticator`; this class only knows how to read a
 * header, throw the right exception, and park the principal. That is why the
 * three modes are testable without a server.
 */
@Middleware()
export class AuthGuard {
    /**
     * Constructor injection rather than `@Inject()` on a property: the property
     * decorator installs a getter-only accessor, so a test cannot substitute a
     * verifier without going through the DI container. Ts.ED resolves this from
     * `design:paramtypes` exactly the same way.
     */
    public constructor(protected readonly authenticator: AuthenticationService) {}

    async use(@Context() ctx: PlatformContext): Promise<void> {
        const options = ctx.endpoint?.store.get(AuthGuard) as AuthGuardOptions | undefined;

        // The allowlist. Explicit, per endpoint, and visible in the source next
        // to the route it opens.
        if (options?.anonymous === true) {
            return;
        }

        const decision = await this.authenticator.authenticate(bearerFrom(ctx.request.get('authorization')));

        if (!decision.allowed) {
            throw exceptionFor(decision.reason);
        }

        // Absent in `disabled`, and in `permissive` when nothing verified. The
        // context simply has no principal then — no placeholder is invented,
        // because a fabricated subject in an audit column is worse than an empty
        // one.
        if (decision.principal !== undefined) {
            ctx.set(PRINCIPAL_CONTEXT_KEY, decision.principal);
        }
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
    if (header === undefined) {
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
