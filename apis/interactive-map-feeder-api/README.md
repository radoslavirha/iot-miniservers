# interactive-map-feeder-api

Fetches precipitation radar data from ČHMÚ (Czech Hydrometeorological Institute), composites multiple image layers (radar, surface, city markers, borders), and returns per-city RGB LED values for the [LaskaKit Interactive Map of Czech Republic](https://www.laskakit.cz/laskakit-interaktivni-mapa-cr-ws2812b/).

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
