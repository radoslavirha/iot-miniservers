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
 * parameter, an MQTT connect packet) belongs to the transport layer, not here.
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
    verify(credential: Credential): Promise<VerificationOutcome>;
}
