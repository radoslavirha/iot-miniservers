# interactive-map-feeder-api

Fetches precipitation radar data from ČHMÚ (Czech Hydrometeorological Institute), composites multiple image layers (radar, surface, city markers, borders), and returns per-city RGB LED values for the [LaskaKit Interactive Map of Czech Republic](https://www.laskakit.cz/laskakit-interaktivni-mapa-cr-ws2812b/).

## Consumed By

- LaskaKit hardware: polls `GET /data-sources/radar/cities/iot` on its own interval

## External Dependencies

| System | Protocol | Purpose |
|--------|----------|---------|
| ČHMÚ (`www.chmi.cz`) | HTTPS GET | Surface map, cities overlay, borders overlay, radar PNG |

## REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/data-sources/list` | Available data sources |
| GET | `/data-sources/:dataSource/cities` | Cities with RGB color from data source. `radius` query param (km, default 2.5) |
| GET | `/data-sources/:dataSource/cities/iot` | Same as above, reduced response (IoT-optimized payload) |
| GET | `/data-sources/:dataSource/image` | Composited PNG image with city markers |

`dataSource` enum: `radar` (only currently implemented source).

## Data Flow

```
ČHMÚ (4 separate image fetches: surface, cities overlay, borders, radar)
  → composite via sharp (resize + overlay)
  → for each city: sample radar pixel intensity within `radius` km around city coords
  → map intensity → RGB
  → return [{ id, name, lat, lng, r, g, b }]
```
