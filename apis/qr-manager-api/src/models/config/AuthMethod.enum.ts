/**
 * Trust domains this service accepts callers from. Each value must have a
 * matching entry under `auth` in the configuration.
 *
 * The inbound counterpart of `ExternalApi`, and declared here for the same
 * reason: which callers a service admits is its own business, not a shared
 * package's. `@radoslavirha/auth` takes these names as plain strings.
 *
 * **A name, not a mechanism** — how an entry's credentials are verified is its
 * `type` in the configuration. The two coincide today, since there is one entry
 * and it is `bearer-jwt`; they stop coinciding the moment a second trust domain
 * uses the same mechanism, which is the case the design doc already plans for:
 * a cluster's ServiceAccount tokens are also bearer JWTs, from a different
 * issuer with a different JWKS, and a route admitting `IDP` must refuse them.
 *
 * Named for the *source* of trust rather than the kind of caller. People and
 * devices holding a personal access token both arrive vouched for by the same
 * identity provider — telling those two apart is authorization, and belongs to
 * roles on the `Principal`, not here.
 */
export enum AuthMethod {
    /** Anyone the identity provider vouches for — a signed-in person, or a device holding a PAT. */
    Idp = 'IDP'
}
