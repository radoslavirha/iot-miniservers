/**
 * Trust domains this service accepts callers from. Each value must have a
 * matching entry under `auth` in the configuration.
 *
 * The inbound counterpart of `ExternalApi`, and declared here for the same
 * reason: which callers a service admits is its own business, not a shared
 * package's. `@radoslavirha/auth` takes these names as plain strings.
 *
 * **One value, and that is the point.** An entry holds a *list* of trusted
 * issuers, so admitting another signing authority — the LaskaKit map's own
 * Authentik application, a second cluster, a second IdP — is a row in
 * configuration and no code at all. From this API's side a device doing an
 * `client_credentials` login against the same IdP is not a different kind of
 * authentication; it is the same bearer JWT from a neighbouring issuer.
 *
 * A second entry would only be warranted if some route had to admit one issuer
 * while refusing another. There was one, briefly — `DEVICE`, so the map's route
 * could refuse a person's token — and it was the wrong tool: what a caller may
 * do is `roles` on the `Principal`, checked with `@RequireRoles`, never the
 * trust domain. `Principal.kind` records what vouched for a caller, for audit
 * and telemetry, and gates nothing.
 */
export enum AuthMethod {
    /** Anyone the identity provider vouches for — a person, a device, or another service. */
    Idp = 'IDP'
}
