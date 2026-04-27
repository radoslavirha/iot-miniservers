# qr-manager-api — DEVELOPMENT

## Run locally

```bash
# 1. From repo root, install workspace deps. Requires NODE_AUTH_TOKEN in .env.
set -a && . ./.env && set +a
pnpm install

# 2. Spin up MongoDB (any local instance works; defaults match config/localhost.json).
docker run -d --name qr-mongo -p 27017:27017 mongo:7

# 3. Start the API. Loads config/localhost.json (NODE_ENV=localhost).
cd apis/qr-manager-api
pnpm start
```

Swagger UI is served at <http://localhost:4011/>. The redirect endpoint is `GET /:slug`.

## Smoke test

```bash
# Create a QR mapping
curl -s -X POST http://localhost:4011/qr-codes \
  -H 'Content-Type: application/json' \
  -d '{"targetURL":"https://example.com","label":"Demo","type":"other"}' | jq

# List
curl -s http://localhost:4011/qr-codes | jq

# Resolve via the printed URL (replace <slug>)
curl -i http://localhost:4011/<slug>

# Download the SVG image
curl -s 'http://localhost:4011/qr-codes/<id>/image?format=svg' > qr.svg
```

## Test

```bash
pnpm test            # vitest run with coverage
pnpm test:watch      # interactive
```

Coverage is enforced at 95% across `services/`, `handlers/` and `mappers/`. Storage repositories, controllers, models and OTel bootstrap are excluded — they are validated by the integration test that boots the Ts.ED platform and by manual smoke tests against a real MongoDB.

## Build

```bash
pnpm build           # tsc --noEmit + swc emit to dist/
```

## Layered architecture

```text
Controller   ─► Handler   ─► Service   ─► Repository (DTO)   ─► Mongoose
                                          ↑
                                          Mapper (DTO ↔ Model)
                              ↑
                              ResponseMapper (Model → public response)
```

- **Controllers** are thin — only schema decorators and a delegating call to a handler.
- **Handlers** orchestrate one use case. They never touch Mongoose directly.
- **Services** hold reusable logic (slug allocation with retry, image rendering, repo orchestration).
- **Repositories** speak DTOs only. Domain model construction is the mapper's job.
- **Mappers** are bi-directional and pure. They do not call services.

## Slug allocator

`ShortIdService` returns a 4-char `[a-z0-9]` slug via nanoid. The Mongo collection has a unique index on `slug`; `QrCodeMongoService.create` retries up to 5× on `E11000` against that index before throwing `Conflict`. With only hundreds of expected records the collision rate is well below 1%, so the retry loop very rarely fires more than once.

## Config

Loaded by `@radoslavirha/tsed-configuration` from `config/<NODE_ENV>.json`. Schema is in [src/models/config/ConfigModel.ts](./src/models/config/ConfigModel.ts):

| Key | Type | Required | Description |
| --- | --- | --- | --- |
| `server.httpPort` | number | yes | HTTP port. |
| `mongodb.enabled` | boolean | yes | Set to `true` in production. |
| `mongodb.url` | string | when enabled | Mongo connection string. |
| `mongodb.connectionOptions.{user,pass}` | string | when enabled | Mongo credentials. |
| `redirect.baseURL` | string | yes | Public host where this API serves `GET /:slug`. Combined with the generated slug to compose the URL encoded into the printed QR image (e.g. `https://qr.home/x7k2`). Distinct from per-record `targetURL` (free-form, stored in DB — can point to google, an internal app, anything). Trailing slashes are stripped. |
| `logger.level` | string | no | Log level (default `info`). |
| `otel.*` | object | no | OpenTelemetry exporter URLs. |
