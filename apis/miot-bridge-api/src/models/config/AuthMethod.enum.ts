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
 * uses the same mechanism.
 *
 * **This covers the REST surface only.** The bridge takes commands over three
 * transports — HTTP, MQTT and UDP — and a decorator reaches exactly one of
 * them. MQTT identity is the broker's (per-client credentials and topic ACLs,
 * configured in `homelab`), and the UDP listener has no identity at all. So an
 * entry here is not a statement about who may actuate a device; it is a
 * statement about who may use the HTTP API, which is a human surface and a
 * possible future UI.
 */
export enum AuthMethod {
    /** Anyone the identity provider vouches for — a signed-in person, or a device holding a PAT. */
    Idp = 'IDP'
}
