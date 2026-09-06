import { AuthMode } from './AuthMode.js';
import { recordVerification } from './authTelemetry.js';
import type { ITokenVerifier } from './ITokenVerifier.js';
import type { Principal } from './Principal.js';
import type { AuthConfig } from './schemas/auth.schema.js';
import { VerificationReason, type VerificationOutcome } from './VerificationOutcome.js';

/**
 * What the caller should do with a request, once the credential has been
 * considered.
 *
 * `allowed` and `principal` are separate because they genuinely come apart: in
 * `disabled`, and in `permissive` with no credential, the request proceeds and
 * there is nobody to attribute it to. No synthetic "local-dev" principal is
 * ever fabricated — a fake subject in an audit column is worse than an empty
 * one, because it is indistinguishable from a real one later.
 */
export type AuthDecision =
    | { readonly allowed: true; readonly principal?: Principal; readonly reason: VerificationReason }
    | {
        readonly allowed: false;
        readonly reason: Exclude<VerificationReason, typeof VerificationReason.Ok>;
        /** What the transport should answer with. See `statusForReason`. */
        readonly status: number;
        readonly detail?: string;
    };

/**
 * Runs the configured mode over a credential.
 *
 * Framework-agnostic on purpose: this decides, and something else — P1.5's
 * Ts.ED guard, an MQTT hook, a test — applies the decision. That split is what
 * keeps the three modes testable without a server.
 */
export class Authenticator {
    readonly #mode: AuthMode;
    readonly #verifier: ITokenVerifier;

    constructor(config: AuthConfig, verifier: ITokenVerifier) {
        assertUsableConfig(config);
        this.#mode = config.mode;
        this.#verifier = verifier;
    }

    get mode(): AuthMode {
        return this.#mode;
    }

    /**
     * `credential` is whatever the transport extracted, or `undefined` when it
     * found nothing. Extraction is the transport's job; this never sees a
     * request.
     */
    async authenticate(credential: string | undefined): Promise<AuthDecision> {
        // Not merely "allow": `disabled` does not verify at all. Verifying and
        // discarding the answer would put a JWKS fetch on the request path of a
        // service that has explicitly opted out.
        if (this.#mode === AuthMode.Disabled) {
            return { allowed: true, reason: VerificationReason.Ok };
        }

        const outcome = await this.#verifier.verify(credential ?? '');
        recordVerification(outcome.reason, issuerOf(outcome));

        if (outcome.reason === VerificationReason.Ok) {
            return { allowed: true, principal: outcome.principal, reason: outcome.reason };
        }

        // The point of `permissive`: the outcome is counted, and the request is
        // let through anyway. It answers "how many callers would this break"
        // with real traffic instead of a guess, which is what removes the
        // big-bang cutover.
        if (this.#mode === AuthMode.Permissive) {
            return { allowed: true, reason: outcome.reason };
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

/**
 * Refuses a configuration that cannot do what it claims.
 *
 * `enforced` with no trusted issuers verifies nothing and therefore rejects
 * every request. Failing at boot turns that into one loud startup error instead
 * of a service that is up, healthy, and refusing all traffic — which reads as a
 * network fault and gets debugged for an hour.
 */
export const assertUsableConfig = (config: AuthConfig): void => {
    if (config.mode !== AuthMode.Disabled && config.trustedIssuers.length === 0) {
        throw new AuthConfigurationError(
            `auth.mode is '${config.mode}' but no trustedIssuers are configured; nothing could ever be verified.`
        );
    }
};

export class AuthConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'AuthConfigurationError';
    }
}

const issuerOf = (outcome: VerificationOutcome): string | undefined =>
    outcome.reason === VerificationReason.Ok ? outcome.principal.issuer : undefined;
