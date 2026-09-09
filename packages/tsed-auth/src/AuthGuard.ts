import { AuthConfigurationError, VerificationReason } from '@radoslavirha/auth';
import { ArrayUtils, StringUtils } from '@radoslavirha/utils';
import type { Principal } from '@radoslavirha/auth';
import { inject } from '@tsed/di';
import { Forbidden, ServiceUnavailable, Unauthorized } from '@tsed/exceptions';
import { Middleware } from '@tsed/platform-middlewares';
import { Context } from '@tsed/platform-params';
import type { PlatformContext } from '@tsed/platform-http';
import type { CredentialSource } from '@radoslavirha/auth';
import { AuthenticationService } from './AuthenticationService.js';

/**
 * Adapts a Ts.ED request into the transport-neutral shape verifiers read.
 *
 * The whole of this package's knowledge about where credentials live, and it is
 * deliberately nothing: it can answer "what is header X", and every verifier
 * decides which X it wants.
 */
const sourceOf = (ctx: PlatformContext): CredentialSource => ({
    header: (name: string) => ctx.request.get(name)
});

/**
 * The methods a route admits, from the encoded store value.
 *
 * Tolerant on the way out: a store written by hand, or by an older build, must
 * not become a 500. An unreadable value is treated as "no methods", which the
 * caller turns into the same loud configuration error as an endpoint that named
 * none — the one outcome that cannot leave a route quietly open.
 */
export const decodeMethods = (encoded: string | undefined): string[] => {
    if (!StringUtils.isNotEmpty(encoded)) {
        return [];
    }

    try {
        const parsed: unknown = JSON.parse(encoded);
        return ArrayUtils.isArray(parsed) ? parsed.filter((m): m is string => StringUtils.isNotEmpty(m)) : [];
    } catch {
        return [];
    }
};

/** The inverse, used by `@Authenticate` and by tests that build a store by hand. */
export const encodeMethods = (methods: readonly string[]): string => JSON.stringify(methods);

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
    /**
     * The methods a route admits, JSON-encoded.
     *
     * A **string**, and that is not an accident. Ts.ED merges endpoint options
     * by concatenating arrays and replacing scalars — measured — so a plain
     * `string[]` here would make a class-level `@Authenticate(Idp)` and a
     * method-level `@Authenticate(ApiKey)` collapse into `['IDP', 'API_KEY']`,
     * indistinguishable from a route that deliberately admits either. The route
     * that meant to *swap* its trust domain would silently *widen* to accept
     * both. Encoding keeps replace semantics, so a method-level decorator
     * overrides its class rather than adding to it — which is exactly the
     * behaviour `interactive-map-feeder-api` depends on to keep a person's token
     * out of the device route.
     *
     * (Roles do the opposite on purpose: there, concatenation *narrows*, so
     * stacking is safe and desirable. Same merge, opposite requirement.)
     *
     * Widening is therefore always explicit and local: a route accepting two
     * methods names both, on the route.
     */
    readonly methods?: string;
    /**
     * Role requirements, one entry per `@RequireRoles(...)` that applied.
     *
     * **A list of lists, and that shape is the whole design.** The caller must
     * satisfy *every* entry, and *any one* role inside an entry satisfies it —
     * "and" between decorators, "or" within one.
     *
     * It is nested because Ts.ED **concatenates** arrays when it merges endpoint
     * options. Measured, not assumed: with a flat `string[]`, a class-level
     * `@RequireRoles('qr.reader')` and a method-level `@RequireRoles('qr.admin')`
     * produce `['qr.reader', 'qr.admin']` — and under "any one is enough" the
     * method that meant to be *stricter* would instead admit readers to an
     * admin-only route. Nesting turns that same concatenation into
     * `[['qr.reader'], ['qr.admin']]`, where adding a decorator can only ever
     * narrow. Fail-closed by construction rather than by remembering.
     *
     * (The neighbouring `method` is a string, and strings *replace* on merge —
     * which is why a method-level `@Authenticate` overrides the class's. Same
     * merge, opposite outcome, purely because of the value's type.)
     *
     * Carried in the same store entry as `method` rather than by a second
     * middleware, so there is no question of which guard runs first: a role
     * check that ran before authentication would refuse every request with a
     * `403` and read like a policy bug.
     *
     * Absent means authentication alone is the whole check.
     */
    readonly roles?: readonly (readonly string[])[];
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

        const methods = decodeMethods(options?.methods);
        if (methods.length === 0) {
            // The guard ran on a route that never said what it wanted verified,
            // which means it was wired up by hand rather than by `@Authenticate`.
            // Loud, because the alternative is a route silently open.
            throw new AuthConfigurationError(
                'AuthGuard ran on an endpoint with no auth method; use @Authenticate(method) or @Anonymous().'
            );
        }

        // The guard hands over a way to *look* for credentials rather than a
        // credential it already extracted. Which header a method reads is the
        // verifier's business — this is what lets an API-key method be added
        // without the transport learning a second shape.
        const decision = await this.authenticator().authenticate(sourceOf(ctx), methods);

        if (!decision.allowed) {
            throw exceptionFor(decision.reason);
        }

        ctx.set(PRINCIPAL_CONTEXT_KEY, decision.principal);

        // Authorization, and deliberately after the principal is parked: a
        // handler that later reads `@CurrentPrincipal()` sees the same caller
        // whether or not the role check passed, and the 403 path is not a
        // special case that skips it.
        if (ArrayUtils.isArray(options?.roles) && !satisfies(decision.principal, options.roles)) {
            // 403, not 401. The credential is good and re-authenticating will
            // not help — telling the caller to sign in again would send them
            // round a loop that cannot terminate.
            //
            // Nothing about which role was wanted: the caller cannot act on it,
            // and naming the role enumerates the permission model to anyone
            // holding any valid token. The operator-facing detail is the log.
            throw new Forbidden('Insufficient permissions.');
        }
    }
}

/**
 * Whether a principal satisfies every role requirement on the endpoint.
 *
 * "And" across the entries, "or" within one. An empty entry — `@RequireRoles()`
 * with no argument — is satisfied by anyone: it is a mistake, but refusing every
 * caller with a `403` no role could ever satisfy would be indistinguishable from
 * a policy bug, and authentication still applies either way.
 *
 * An exact string match, with no hierarchy and no wildcard. Whether `admin`
 * implies `reader` is a question for whoever issues the roles — in this
 * deployment Authentik answers it with group parentage, so the token lists every
 * role the caller effectively holds and this stays a set-membership test.
 * Building the implication here instead would mean the token no longer describes
 * what its holder can do, and every consumer would need the same ordering table
 * to agree.
 */
const satisfies = (principal: Principal, requirements: readonly (readonly string[])[]): boolean =>
    requirements.every(
        (anyOf) => anyOf.length === 0 || anyOf.some((role) => principal.roles.includes(role))
    );

const exceptionFor = (reason: VerificationReason): Error =>
    reason === VerificationReason.Indeterminate
        ? new ServiceUnavailable('Authentication is temporarily unavailable.')
        : new Unauthorized('Authentication required.');

/** Reads the principal a successful guard run parked on the context. */
export const principalOf = (ctx: PlatformContext): Principal | undefined =>
    ctx.get<Principal>(PRINCIPAL_CONTEXT_KEY);
