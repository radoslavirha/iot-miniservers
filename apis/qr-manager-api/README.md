# qr-manager-api

Generic QR code redirect manager. Allocates 4-char slugs (nanoid), stores slug→URL mappings in MongoDB, resolves slugs via HTTP 302 redirect, and renders QR images.

Use case: print a QR code once; change the target URL at any time without reprinting.

## Consumed By

- `qr-manager-ui`: admin CRUD operations
- Phone / scanner: `GET /r/:slug` → 302 redirect to `targetURL`. Printed labels read `http://qr.home/<slug>`; the `/r` is added by a Traefik `addPrefix` middleware on the `qr.home` HTTPRoute in `homelab`
- Other services (e.g. future IoT management API): `POST /qr-codes` to allocate a slug, store it, embed `qrURL` in printed labels

## External Dependencies

| System | Protocol | Purpose |
|--------|----------|---------|
| MongoDB | TCP | Slug→URL record storage |

## REST API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/r/:slug` | Resolve slug → `302 Location: targetURL`. `404` if unknown or inactive, `400` if not 4-char alphanumeric |
| POST | `/qr-codes` | Allocate slug, persist record |
| GET | `/qr-codes` | List records. Query: `type`, `active` |
| GET | `/qr-codes/:id` | Get record by MongoDB id |
| PUT | `/qr-codes/:id` | Update `targetURL`, `label`, `type`, `active` |
| DELETE | `/qr-codes/:id` | Delete record |
| GET | `/qr-codes/:id/image` | Render QR image. Query: `format=svg\|png`, `size` (px, PNG only), `ecLevel=L\|M\|Q\|H` |

## Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health/live` | Liveness. Always `200` — no dependency I/O, by design |
| GET | `/health/ready` | Readiness. `503` when a critical dependency is down or the pod is draining |
| GET | `/health` | Full report: `{ status, checks }`. `200` for `pass` and `warn`, `503` for `fail` |

Checks: `mongodb` (**critical** — every route reads or writes Mongo). Shared, from
`@radoslavirha/tsed-health/mongoose`, and verified there against a real database. Reports
`pass` when Mongo is not configured.

Hidden from Swagger, excluded from traces and request logs. See
[`@radoslavirha/tsed-health`](../../packages/tsed-health/README.md).

## Record Shape

```json
{
  "id": "mongo-objectid",
  "slug": "x7k2",
  "targetURL": "https://...",
  "label": "human readable name",
  "type": "iot-device | plant | other",
  "active": true,
  "qrURL": "{redirect.baseURL}/x7k2",
  "imageURL": "{baseURL}/qr-codes/{id}/image"
}
```

`qrURL` is what gets encoded into the printed QR. `targetURL` is what the scanner is redirected to.
