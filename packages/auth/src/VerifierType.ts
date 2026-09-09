/**
 * How an `AuthMethod` entry's credentials are actually verified.
 *
 * The `type` field of a verifier's configuration, and the discriminant of
 * `VerifierSchema`. One member today, and the axis exists so a second mechanism
 * is a new member plus a new `ITokenVerifier` — not a change to any controller,
 * because controllers name an `AuthMethod` and never a type.
 *
 * The mirror of `AuthStrategy` in `http-provider`, which does the same job for
 * outbound calls.
 */
export enum VerifierType {
    /**
     * An RFC 7519 JWT presented as an RFC 6750 bearer token, verified against
     * the entry's trusted issuers.
     *
     * The transport is in the name because it is a real distinction and not a
     * hypothetical one: `AuthGuard` reads the `Authorization` header, and this
     * repository already has a route that cannot use it — the QR image is loaded
     * by an `<img src>`, which sends no headers. A JWT arriving somewhere else in
     * the request is a different extraction and therefore a different type, not
     * a wider version of this one.
     *
     * Says nothing about where keys come from: an inline HS256 secret and a
     * remote JWKS are both this type, chosen per issuer by `key.source`.
     */
    BearerJwt = 'bearer-jwt'
}
