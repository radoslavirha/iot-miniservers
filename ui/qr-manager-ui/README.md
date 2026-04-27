# qr-manager-ui

Admin UI for the [qr-manager-api](../../apis/qr-manager-api/README.md). Lists / creates / edits / deactivates QR records and downloads the rendered images.

## Quick start

```bash
# 1. Start the API on http://localhost:4011 (see apis/qr-manager-api/DEVELOPMENT.md).
# 2. From repo root:
set -a && . ./.env && set +a
pnpm install

# 3. Start the dev server:
cd ui/qr-manager-ui
pnpm dev
# → http://localhost:5173/admin
```

`public/config.json` is checked in with the dev API base URL (`http://localhost:4011`). Edit it (or rebuild with a different `apiBaseURL`) to point at a remote API.

## Runtime config

The UI does not bake its API URL into the bundle. At page load, the browser fetches `/config.json` before any React code runs and the resolved object is provided to the app via context:

```jsonc
{ "apiBaseURL": "https://api.server.home/qr" }
```

Replace `/config.json` at deploy time:

| Environment | Source |
| --- | --- |
| Local dev | `public/config.json` (checked in) |
| Production | Kubernetes `ConfigMap` mounted to `/usr/share/nginx/html/config.json` |

`nginx.conf` serves `/config.json` with `Cache-Control: no-store` so a ConfigMap rollover takes effect on the next page reload.

## Build and serve

```bash
pnpm build        # vite build → dist/
pnpm preview      # serve the production bundle on :4173
```

Set `VITE_BASE_PATH=/qr/` at build time to mount the bundle under a sub-path behind a reverse proxy.

## Tests

```bash
pnpm test         # vitest run with coverage
pnpm test:watch
```

Components, runtime config and the API client are covered by unit tests. Page wiring is covered by `App.spec.tsx` which mounts the full router with a mocked `fetch`.

## Docker

```bash
DOCKER_BUILDKIT=1 docker build \
  --target qr-manager-ui \
  --secret id=npmrc,src=$HOME/.npmrc \
  -t qr-manager-ui:dev .
docker run --rm -p 8080:80 qr-manager-ui:dev
```

The image is `nginx:1.29-alpine` serving the static bundle. SPA fallback to `index.html` is configured for client-side routing.
