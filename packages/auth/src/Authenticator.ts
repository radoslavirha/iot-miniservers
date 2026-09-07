import { CommonUtils } from '@radoslavirha/utils';
import { VerifierType } from './VerifierType.js';
import { recordVerification } from './authTelemetry.js';
import { createKeySource } from './keys/createKeySource.js';
import { JwtVerifier } from './verifiers/JwtVerifier.js';
import type { ITokenVerifier } from './ITokenVerifier.js';
import type { Principal } from './Principal.js';
import type { AuthConfig, VerifierConfig } from './schemas/auth.schema.js';
import { VerificationReason, type VerificationOutcome } from './VerificationOutcome.js';

/**
 * What the caller should do with a request, once the credential has been
 * considered.
 *
 * `allowed` and `principal` are separate because a refusal has nobody to
 * attribute. No synthetic "local-dev" principal is ever fabricated — a fake
 * subject in an audit column is worse than an empty one, because it is
 * indistinguishable from a real one later.
 */
export type AuthDecision =
    | { readonly allowed: true; readonly principal: Principal; readonly reason: typeof VerificationReason.Ok }
    | {
        readonly allowed: false;
        readonly reason: Exclude<VerificationReason, typeof VerificationReason.Ok>;
        /** What the transport should answer with. See `statusForReason`. */
        readonly status: number;
        readonly detail?: string;
    };

/**
 * Runs a credential past the verifier the route asked for.
 *
 * Framework-agnostic on purpose: this decides, and something else — the Ts.ED
 * guard, an MQTT hook, a test — applies the decision. That split is what keeps
 * every outcome testable without a server.
 *
 * There is no "allow anyway" path. A credential verifies or the request is
 * refused; whether a route is guarded at all is decided at the route, by
 * `@Authenticate()` or `@Anonymous()`, where it is visible in the source.
 */
export class Authenticator {
    readonly #verifiers: AuthVerifiers;

    /**
     * `verifiers` is a parameter so a test can inject fakes and drive outcomes a
     * real verifier can barely be made to produce — `indeterminate` in
     * particular. Left out, one is built per configured method.
     */
    constructor(config: AuthConfig, verifiers: AuthVerifiers = buildVerifiers(config)) {
        this.#verifiers = verifiers;
    }

    /** Which named methods this service can actually verify. Used by the boot log. */
    get methods(): readonly string[] {
        return [...this.#verifiers.keys()];
    }

    /**
     * `credential` is whatever the transport extracted, or `undefined` when it
     * found nothing. Extraction is the transport's job; this never sees a
     * request.
     *
     * `method` is required rather than defaulted: the route says which set of
     * callers it admits, and a default here would silently pick one for a route
     * that asked for something else. It is the service's own name — this package
     * defines no vocabulary of them, because which callers a deployment admits is
     * not a shared concern.
     */
    async authenticate(credential: string | undefined, method: string): Promise<AuthDecision> {
        const verifier = this.#verifiers.get(method);
        if (CommonUtils.isUndefined(verifier)) {
            // A route asked for a method this service was not configured for.
            // Programmer or deployment error, not a caller's — so it is loud
            // rather than a 401 that would send someone hunting for a bad token.
            // Configuring with `createAuthConfigSchema` moves this to boot time.
            throw new AuthConfigurationError(
                `No verifier is configured for auth method '${method}'.`
            );
        }

        const outcome = await verifier.verify(credential ?? '');
        recordVerification(outcome.reason, issuerOf(outcome));

        if (outcome.reason === VerificationReason.Ok) {
            return { allowed: true, principal: outcome.principal, reason: outcome.reason };
        }

        return {
            allowed: false,
            reason: outcome.reason,
            status: statusForReason(outcome.reason),
            detail: outcome.detail
        };
    }
}

/**
 * One verifier per configured entry, filed under the entry's name.
 *
 * The name is what a route asks for; the entry's `type` is what decides which
 * verifier is built. Two entries may share a type — the IdP's tokens and a
 * cluster's — and each gets its own verifier over its own trusted issuers, which
 * is the whole reason the two are separate.
 *
 * The `switch` is exhaustive over `VerifierType`, so adding a member makes this
 * fail to compile until its verifier exists.
 */
export const buildVerifiers = (config: AuthConfig): AuthVerifiers => {
    const built = new Map<string, ITokenVerifier>();

    for (const [method, entry] of Object.entries(config) as [string, VerifierConfig | undefined][]) {
        if (CommonUtils.isUndefined(entry)) {
            continue;
        }

        switch (entry.type) {
            case VerifierType.BearerJwt:
                built.set(method, new JwtVerifier(entry.trustedIssuers, createKeySource(entry.trustedIssuers)));
                break;
        }
    }

    return built;
};

/**
 * HTTP status for a refusal.
 *
 * **`indeterminate` is a `503`, not a `401`.** Every other reason is a
 * statement about the credential; that one is a statement about us. Answering
 * `401` when our own JWKS fetch timed out tells the caller to fix a token that
 * was never the problem, and — worse — it is not retriable, so a client backing
 * off correctly on a `503` would instead give up.
 */
export const statusForReason = (reason: VerificationReason): number => {
    switch (reason) {
        case VerificationReason.Ok:
            return 200;
        case VerificationReason.Indeterminate:
            return 503;
        default:
            return 401;
    }
};

/** The verifiers a service has, addressed by the name a route asks for. */
export type AuthVerifiers = ReadonlyMap<string, ITokenVerifier>;

export class AuthConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthConfigurationError';
    }
}

const issuerOf = (outcome: VerificationOutcome): string | undefined =>
    outcome.reason === VerificationReason.Ok ? outcome.principal.issuer : undefined;
