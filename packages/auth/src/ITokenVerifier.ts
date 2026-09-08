import type { CredentialSource } from './CredentialSource.js';
import type { VerificationOutcome } from './VerificationOutcome.js';

/**
 * Credential material as it arrived, before anybody has decided what it is.
 *
 * A string, not a parsed JWT, and deliberately not named `token`. The whole
 * point of this seam is that a verifier is free to be something other than a
 * JWT verifier — an API key check, an introspection call — without this
 * interface changing. Naming the parameter after one mechanism is how that
 * freedom gets lost.
 *
 * Extracting this from a request (the `Authorization` header, a query
 * parameter, an MQTT connect packet) is `extract`'s job, driven by a
 * `CredentialSource` so no transport is named here either.
 */
export type Credential = string;

/**
 * Turns credential material into a verification outcome.
 *
 * **Async, always**, even for implementations that need no I/O. `StaticKeySource`
 * verification is pure computation and `RemoteJwksSource` is a network call; if
 * the signature were sync, adding the second would change every caller.
 *
 * **Never throws for a bad credential.** A rejected credential is an ordinary
 * outcome and is returned as one — throwing would make the common case an
 * exception path and would lose the reason, which is exactly what P1.3 needs to
 * count. Implementations may still throw for programmer error (misconfiguration
 * at construction), which is not a verification result.
 */
export interface ITokenVerifier {
    /**
     * Finds this verifier's credential, or `undefined` if the caller sent none.
     *
     * **A verifier owns where its credential lives**, which is the whole reason
     * a second mechanism can be added without touching a transport: a JWT comes
     * from `Authorization: Bearer`, an API key from its own header, and neither
     * the guard nor the `Authenticator` has to learn the difference. Before this
     * existed the guard extracted bearer tokens itself, which quietly made every
     * future verifier bearer-shaped.
     *
     * Returning `undefined` means "not for me" and is an ordinary result: when a
     * route admits several methods, the ones that find nothing step aside so the
     * one that matches can answer.
     *
     * Sync, because extraction is a lookup. Anything needing I/O to decide
     * belongs in `verify`.
     */
    extract(source: CredentialSource): Credential | undefined;

    verify(credential: Credential): Promise<VerificationOutcome>;
}
