import type { Principal } from './Principal.js';

/**
 * Why a verification succeeded or failed.
 *
 * **These strings are load-bearing in three places at once**: they are P1.3's
 * metric label values, the vocabulary the logs use, and what the HTTP status
 * mapping switches on. Three units inventing three spellings for the same
 * condition is the likely failure, so they are defined here, once, and used
 * verbatim.
 *
 * They are deliberately about *the credential*, never about the caller. There
 * is no `forbidden` — authorization is a separate decision made after a
 * `Principal` exists.
 *
 * A frozen object plus a union type rather than a TypeScript `enum`, because
 * here **the string is the contract**, not a name for it: these values leave the
 * process as metric label values and log fields. A union of literals lets a
 * test, a switch or a label map use `'wrong-audience'` directly and still
 * typecheck, where a string enum would force an import to name a value that is
 * already a string. See `AuthMode` for the same call.
 */
export const VerificationReason = {
    /** Verified. A `Principal` is available. */
    Ok: 'ok',
    /** No credential was presented at all. */
    Missing: 'missing',
    /** Malformed, badly signed, expired, or otherwise not trustworthy. */
    Invalid: 'invalid',
    /** Well-formed and correctly signed, but minted for somebody else. */
    WrongAudience: 'wrong-audience',
    /** Well-formed, but no configured trust source claims the issuer. */
    UnknownIssuer: 'unknown-issuer',
    /**
     * Verification could not be attempted — a JWKS fetch timed out, DNS failed,
     * the key source was unreachable.
     *
     * This is the member that keeps the type honest. A transport failure is not
     * a verification failure: the credential may well be perfectly good, and we
     * simply cannot say. Collapsing it into `invalid` would report an outage as
     * a wave of bad tokens, and would make `enforced` mode indistinguishable
     * from a broken IdP. It is also what lets an introspection-based or API-key
     * verifier be added later without changing this type.
     */
    Indeterminate: 'indeterminate'
} as const;

export type VerificationReason = (typeof VerificationReason)[keyof typeof VerificationReason];

/**
 * The result of asking a verifier about some credential material.
 *
 * A discriminated union rather than `{ principal?, reason }`, so that "verified"
 * and "has a principal" cannot drift apart: there is no way to express a
 * successful outcome with no principal, or a failure that carries one.
 */
export type VerificationOutcome = VerifiedOutcome | RefusedOutcome;

export type VerifiedOutcome = { readonly reason: typeof VerificationReason.Ok; readonly principal: Principal };

/**
 * Every outcome that is not a pass, named so a chain of verifiers can collect
 * them without the union widening back to "might carry a principal".
 */
export type RefusedOutcome = {
    readonly reason: Exclude<VerificationReason, typeof VerificationReason.Ok>;
    /**
     * Operator-facing detail — a JOSE error, the rejected `iss`, the timeout
     * that fired. Never rendered to the caller: a verification failure tells the
     * client nothing beyond the status code.
     */
    readonly detail?: string;
};
