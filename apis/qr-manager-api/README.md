# qr-manager-api

Generic QR code redirect manager. Allocates 4-char slugs (nanoid), stores slug→URL mappings in MongoDB, resolves slugs via HTTP 302 redirect, and renders QR images.

Use case: print a QR code once; change the target URL at any time without reprinting.

## Consumed By

- `qr-manager-ui`: admin CRUD operations, with a bearer token from Authentik
- Phone / scanner: `GET /r/:slug` → 302 redirect to `targetURL`. Anonymous. Printed labels read `http://qr.home/<slug>`; the `/r` is added by a Traefik `addPrefix` middleware on the `qr.home` HTTPRoute in `homelab`
- Other services (e.g. future IoT management API): `POST /qr-codes` to allocate a slug, store it, embed `qrURL` in printed labels. **Needs its own credential** — a service calling this is a trust domain these routes do not yet admit, so onboarding one means a second `auth` entry, not sharing a human's token

## External Dependencies

| System | Protocol | Purpose |
|--------|----------|---------|
| MongoDB | TCP | Slug→URL record storage |

## REST API

`Auth` marks routes that require a bearer token — see [Authentication](#authentication).

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/r/:slug` | — | Resolve slug → `302 Location: targetURL`. `404` if unknown or inactive, `400` if not 4-char alphanumeric |
| POST | `/qr-codes` | **Yes** | Allocate slug, persist record |
| GET | `/qr-codes` | **Yes** | List records. Query: `type`, `active` |
| GET | `/qr-codes/:id` | **Yes** | Get record by MongoDB id |
| PUT | `/qr-codes/:id` | **Yes** | Update `targetURL`, `label`, `type`, `active` |
| DELETE | `/qr-codes/:id` | **Yes** | Delete record |
| GET | `/qr-codes/:id/image` | — | Render QR image. Query: `format=svg\|png`, `size` (px, PNG only), `ecLevel=L\|M\|Q\|H` |

## Authentication

Guarded routes answer `401` without a valid bearer token, and `503` when the token could not be
verified — a JWKS fetch that timed out is our problem, not the caller's, and unlike `401` it is
retriable. Neither response says why; the operator-facing detail stays in the logs, because telling a
caller which part of a forgery to fix next is a gift.

Tokens come from Authentik. `config/localhost.json` points at the sandbox provider's live JWKS, so
local development runs the same code path production does. Get a token by signing in through
`qr-manager-ui` (`pnpm --filter=qr-manager-ui dev`) and copying it from devtools.

| Open route | Why |
|------------|-----|
| `GET /r/:slug` | The printed-QR redirect. A scanner is an anonymous phone camera |
| `GET /qr-codes/:id/image` | The admin UI renders it with `<img src>`, which cannot send a header. Protecting it would break every QR image in the app. It exposes a rendered code for a known id and nothing else — no target URL, no label |
| `/health*` | Kubernetes probes |

`@Authenticate` sits on the controller class, not on each method, so a route added later is protected
the moment it is written rather than the moment somebody remembers a decorator. `@Anonymous()` is the
per-route opt-out, and it sits next to the route it opens.

Configured under `auth`, keyed by [`AuthMethod`](./src/models/config/AuthMethod.enum.ts) — the trust
domains this service accepts. `IDP` is the identity provider, so a device holding a personal access
token from it is the same entry; a cluster's ServiceAccount tokens would be a separate one that these
routes do not admit. See [`@radoslavirha/tsed-auth`](../../packages/tsed-auth/README.md).

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
