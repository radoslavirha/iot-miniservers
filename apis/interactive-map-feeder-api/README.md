# interactive-map-feeder-api

Fetches precipitation radar data from ČHMÚ (Czech Hydrometeorological Institute), composites multiple image layers (radar, surface, city markers, borders), and returns per-city RGB LED values for the [LaskaKit Interactive Map of Czech Republic](https://www.laskakit.cz/laskakit-interaktivni-mapa-cr-ws2812b/).

## Authentication

**Every route requires a bearer token.** Two trust domains, and they are not interchangeable:

| Routes | Method | Caller |
|--------|--------|--------|
| `/list`, `/:dataSource/cities`, `/:dataSource/image` | `IDP` | A person, via browser or API client |
| `/:dataSource/cities/iot` | `DEVICE` | The LaskaKit map, and nothing else |

`@Authenticate` sits on the controller class; the IoT route carries its own, and a method-level
`@Authenticate` **replaces** the class-level one rather than adding to it. So a person's token is
refused on the map's route and the map's token is refused everywhere else — asserted in
`DataSourcesController.integration.spec.ts`, because if that ever inverted the map would fail in the
field with the tests still green.

Nothing here is protecting a secret: every route is a read of public ČHMÚ data. What the split
protects is the other direction. The map holds a long-lived credential in flash and reaches exactly
one endpoint, so a leaked device credential cannot walk the rest of the surface — including whatever
is added later.

`/health*` stays open for the Kubernetes probes.

### Giving a device its credential

The device's token carries `aud` and `iss` of **its own** client, not this API's. This API trusts that
pair explicitly in `auth.DEVICE.trustedIssuers` — option 1 of *Devices* in `homelab` →
`docs/superpowers/specs/2026-09-04-authentik-tenancy-topology.md`, which is the authority for the
reasoning below. No custom Authentik scope mapping is needed, and no role claim is read: `iss` + `aud`
carry the whole decision.

**In Authentik** (`homelab`; the client secret must come from OpenBao, never the blueprint values —
that constraint is stated at the top of `authentik-blueprints.yaml`):

1. An Application + OAuth2 provider named `interactive-map-device`, with `client_type: confidential`,
   `grant_types: [client_credentials]`, **no redirect URIs**, and `issuer_mode: per_provider` like
   every other provider here.
2. A **service account** user for it, bound to the Application's group. Authentik gates
   `client_credentials` on the same policy binding as a human login — without the membership the token
   request fails with `invalid_grant`, which reads like a wrong secret and is not.
3. A long `access_token_validity` on this provider. It is per provider, so device tokens can be
   long-lived while the SPA providers stay at 30 minutes.

**In `iot-esphome/interactive-map.yaml`, in the same change — not as a follow-up:**

4. **Move the request to HTTPS.** It is plain HTTP today. Over cleartext the `client_secret` crosses
   the LAN on every refresh, and anyone who captures one refresh can mint tokens indefinitely, so a
   short token lifetime buys nothing. `http_request` on `esp-idf` does TLS; this cluster's private CA
   needs `verify_ssl: false`, which stops passive sniffing but not an active MITM. The real limit is
   heap during the handshake, so the test is "does it stay up", not "does it compile".
5. A token-fetch script: `http_request.post` to `https://auth.irha.cz/application/o/token/` with
   `grant_type=client_credentials`, `client_id` and `client_secret`; parse `access_token` out of the
   response into a global; refresh on an `interval` inside the token's lifetime.
6. `Authorization: Bearer` as a `!lambda` request header on the existing fetch.

All four capabilities are already used in that file, so this is more YAML rather than a new capability.

**Then here:** point `auth.DEVICE.trustedIssuers[0]` at the new client — `issuer`, `audience` and the
JWKS URI all derive from its `client_id`.

## Consumed By

- LaskaKit hardware: polls `GET /data-sources/radar/cities/iot` on its own interval

## External Dependencies

| System | Protocol | Purpose |
|--------|----------|---------|
| ČHMÚ Portal (`intranet.chmi.cz`) | HTTPS GET | Surface map, cities overlay, borders overlay |
| ČHMÚ OpenData (`opendata.chmi.cz`) | HTTPS GET | Radar PNG |

## Configuration (externalApis)

The API reads ČHMÚ hosts from `externalApis` (no hardcoded base URLs in services/endpoints).
Update the ConfigMap first, then roll image updates.

```json
{
  "externalApis": {
    "CHMI_PORTAL": {
      "baseURL": "https://intranet.chmi.cz",
      "resilience": {
        "timeout": { "ms": 10000 },
        "retry": { "count": 2, "backoffMs": 500 },
        "circuitBreaker": {}
      },
      "logging": {
        "enabled": true,
        "stack": false
      },
      "retriableStatusCodes": [500, 502, 503, 504, 429, 408]
    },
    "CHMI_OPENDATA": {
      "baseURL": "https://opendata.chmi.cz",
      "resilience": {
        "timeout": { "ms": 10000 },
        "retry": { "count": 2, "backoffMs": 500 },
        "circuitBreaker": {}
      },
      "logging": {
        "enabled": true,
        "stack": false
      },
      "retriableStatusCodes": [500, 502, 503, 504, 429, 408]
    }
  }
}
```

## REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/data-sources/list` | Available data sources |
| GET | `/data-sources/:dataSource/cities` | Cities with RGB color from data source. `radius` query param (km, default 2.5) |
| GET | `/data-sources/:dataSource/cities/iot` | Same as above, reduced response (IoT-optimized payload) |
| GET | `/data-sources/:dataSource/image` | Composited PNG image with city markers |

`dataSource` enum: `radar` (only currently implemented source).

## Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health/live` | Liveness. Always `200` — no dependency I/O, by design |
| GET | `/health/ready` | Readiness. `503` when a critical dependency is down or the pod is draining |
| GET | `/health` | Full report: `{ status, checks }`. `200` for `pass` and `warn`, `503` for `fail` |

Checks: `upstream-apis` (**non-critical**). Readiness deliberately does not depend on the
third-party ČHMÚ APIs — failing it during an outage nobody here can fix would remove
this pod from Endpoints for no benefit. State is read passively from the circuit breakers
already guarding real traffic, so `/health` degrades to `warn` while `/health/ready`
stays `200`.

Hidden from Swagger, excluded from traces and request logs. See
[`@radoslavirha/tsed-health`](../../packages/tsed-health/README.md).

## Data Flow

```
ČHMÚ (4 separate image fetches: surface, cities overlay, borders, radar)
  → composite via sharp (resize + overlay)
  → for each city: sample radar pixel intensity within `radius` km around city coords
  → map intensity → RGB
  → return [{ id, name, lat, lng, r, g, b }]
```
