import { CommonUtils } from '@radoslavirha/utils';
import { VerifierType } from './VerifierType.js';
import { recordVerification } from './authTelemetry.js';
import { createKeySource } from './keys/createKeySource.js';
import { JwtVerifier } from './verifiers/JwtVerifier.js';
import type { CredentialSource } from './CredentialSource.js';
import type { ITokenVerifier } from './ITokenVerifier.js';
import type { Principal } from './Principal.js';
import type { AuthConfig, VerifierConfig } from './schemas/auth.schema.js';
import { VerificationReason, type RefusedOutcome, type VerificationOutcome } from './VerificationOutcome.js';

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
     * Tries each method the route admits, in the order the route listed them,
     * and stops at the first that verifies.
     *
     * The chain is the point: a route can admit a person's IdP token *or* a
     * device's API key, and neither verifier learns about the other. Each is
     * asked to find its own credential — a verifier that finds nothing steps
     * aside rather than failing the request, so "no API key present" does not
     * refuse a caller who sent a perfectly good bearer token.
     *
     * **When every method fails, the reason is folded by severity, not taken
     * from the last one tried.** That ordering is the whole difference between
     * this and a naive chain:
     *
     * 1. `indeterminate` wins outright. A JWKS fetch that timed out is our
     *    problem, and it maps to `503` — retriable. Letting a later
     *    "no credential for me" overwrite it would answer `401`, telling a
     *    caller with a valid token to go and fix it while the real fault is an
     *    outage they cannot see.
     * 2. Then any reason other than `missing` — a credential *was* offered and
     *    rejected, and `invalid` or `wrong-audience` is what the operator needs
     *    in the log.
     * 3. `missing` last, because it only means nobody presented anything.
     *
     * `methods` is required and never defaulted: the route says which callers it
     * admits, and a default here would silently pick one for a route that asked
     * for something else. The names are the service's own — this package defines
     * no vocabulary of them.
     */
    async authenticate(source: CredentialSource, methods: readonly string[]): Promise<AuthDecision> {
        if (methods.length === 0) {
            throw new AuthConfigurationError('A guarded endpoint named no auth method.');
        }

        // Every named method is resolved before any of them runs. Doing it inside
        // the loop would let a typo in the second method hide behind the first
        // one succeeding — the route would work until the day the first method
        // stopped matching, and then fail as a 500 nobody could place.
        // `createAuthConfigSchema` catches this at boot; this catches the rest.
        const chain = methods.map((method) => {
            const verifier = this.#verifiers.get(method);
            if (CommonUtils.isUndefined(verifier)) {
                // Programmer or deployment error, not a caller's — so it is loud
                // rather than a 401 that would send someone hunting for a token
                // that was never the problem.
                throw new AuthConfigurationError(`No verifier is configured for auth method '${method}'.`);
            }

            return verifier;
        });

        const failures: RefusedOutcome[] = [];

        for (const verifier of chain) {
            const credential = verifier.extract(source);
            const outcome = await verifier.verify(credential ?? '');
            recordVerification(outcome.reason, issuerOf(outcome));

            if (outcome.reason === VerificationReason.Ok) {
                return { allowed: true, principal: outcome.principal, reason: outcome.reason };
            }

            failures.push(outcome);
        }

        const worst = mostTelling(failures);

        return {
            allowed: false,
            reason: worst.reason,
            status: statusForReason(worst.reason),
            detail: worst.detail
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

/**
 * The failure worth reporting, out of everything the chain tried.
 *
 * Severity, not recency. See `authenticate` for why each rung is where it is —
 * the short version is that a `503` must survive a later `401`, or an outage
 * gets reported as a bad credential.
 */
const mostTelling = (failures: readonly RefusedOutcome[]): RefusedOutcome =>
    failures.find((f) => f.reason === VerificationReason.Indeterminate)
    ?? failures.find((f) => f.reason !== VerificationReason.Missing)
    ?? failures[0]!;

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
