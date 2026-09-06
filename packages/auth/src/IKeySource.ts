import type { KeyInput } from 'jose';

/**
 * Supplies the key a signature is checked against.
 *
 * This is the seam between P1.1 (JWT verification with inline static keys) and
 * P1.2 (keys fetched from a remote JWKS). `JwtVerifier` is written once against
 * this interface and never learns whether the key came from a config file or an
 * HTTP round trip — which is what lets P1.1 be built and tested with no
 * infrastructure at all, and P1.2 be swapped in behind it.
 *
 * It is also where the Kubernetes-agnostic claim is cashed in: a ServiceAccount
 * token is verified by a `RemoteJwksSource` whose fetch happens to carry a
 * bearer token. That is transport configuration on one implementation, not a
 * branch in the verifier.
 */
export interface IKeySource {
    /**
     * Resolves the verification key for one signature.
     *
     * `kid` is optional because a JWS header may omit it — a static single-key
     * deployment has nothing to select between. An implementation holding more
     * than one key and given no `kid` should reject rather than guess.
     *
     * **Rejects rather than returning undefined when the key cannot be
     * resolved.** The caller has to tell "no such key" (the credential is
     * invalid) apart from "could not reach the key source" (indeterminate), and
     * a thrown transport error carries that distinction where a bare `undefined`
     * would erase it.
     */
    getKey(params: KeyLookup): Promise<VerificationKey>;
}

export interface KeyLookup {
    /** `iss` of the credential being verified — which trust source to ask. */
    readonly issuer: string;
    /** `kid` from the JWS header, when the header carried one. */
    readonly kid?: string;
    /** `alg` from the JWS header, so a source can refuse an unexpected algorithm. */
    readonly algorithm?: string;
}

/**
 * Whatever `jose` will accept as a verification key — `CryptoKey`, a Node
 * `KeyObject`, a raw `JWK`, or the bytes of a symmetric secret.
 *
 * An alias of `jose`'s own `KeyInput` rather than a hand-written union, so it
 * cannot drift from what the library actually accepts. Naming it here keeps the
 * `jose` import in one file and gives implementations and tests one word for
 * the concept.
 */
export type VerificationKey = KeyInput;
