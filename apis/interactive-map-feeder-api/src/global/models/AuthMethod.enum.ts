/**
 * Trust domains this service accepts callers from. Each value must have a
 * matching entry under `auth` in the configuration.
 *
 * The inbound counterpart of `ExternalApi`, and declared here for the same
 * reason: which callers a service admits is its own business, not a shared
 * package's. `@radoslavirha/auth` takes these names as plain strings.
 *
 * **Two entries, because there are genuinely two kinds of caller and they are
 * not interchangeable.** Both arrive as bearer JWTs from the same identity
 * provider, which is exactly why the mechanism cannot be the name: the entry's
 * `type` says how a credential is checked, this says whose it is.
 *
 * The separation earns its keep the first time a route must admit one without
 * the other. Today every route is a read of public ČHMÚ data, so the split
 * costs an enum value and buys the ability to revoke the map's credential
 * without touching a person's — and to keep a device that holds a long-lived
 * secret in flash, on a cleartext LAN hop, out of anything added later.
 */
export enum AuthMethod {
    /** A person, through a browser or an API client, holding a token from the identity provider. */
    Idp = 'IDP',
    /**
     * A device on the LAN holding a client-credentials token of its own.
     *
     * The LaskaKit map (ESP32 / ESPHome) is the only member today. It polls one
     * route on its own interval and can do nothing else.
     */
    Device = 'DEVICE'
}
