# qr-manager-ui — DEVELOPMENT

## Stack

- React 19 + Vite 8 + TypeScript
- `react-router-dom` 7 for routing
- Vitest + Testing Library + jsdom for tests
- Plain `fetch` for API calls (no react-query yet — keep deps minimal)
- nginx 1.29 alpine as production server

## Architecture

```text
index.html ── inline script fetches /config.json ──► window.__APP_CONFIG_PROMISE__
                                                         │
main.tsx awaits ────────────────────────────────────────┘
       │
       ▼
<RuntimeConfigProvider value={config}>
  <BrowserRouter basename={import.meta.env.BASE_URL}>
    <App />        # nav, routes
       │
       ▼
    <QrCodeListPage>  uses createQrCodesClient(config.apiBaseURL)
    <QrCodeCreatePage>
    <QrCodeDetailPage>
```

## Why runtime config (not env-baked)

A Vite build embeds `import.meta.env.*` at build time. We want one container image deployable to many environments (sandbox / production / a future per-tenant deploy) without rebuilding. Fetching `/config.json` at boot keeps the bundle environment-agnostic. In Kubernetes the file is mounted from a ConfigMap; locally it's the file under `public/config.json`.

The fetch happens in `index.html` *before* the bundle script tag so React mounts only after a valid config exists. Validation lives in `runtime/RuntimeConfig.ts` — bad config crashes loudly on first paint.

## Why not react-query / Redux

The data model is a single CRUD list with no caching needs. `useEffect + useState` keeps the surface area small and easy to test. If we add multiple cross-page caches (e.g. user profiles, dashboards), revisit then.

## Testing

```bash
pnpm test
```

Coverage thresholds (70%) are enforced over `src/**` excluding pages, `main.tsx`, and the test setup. Pages are exercised by `src/App.spec.tsx` which boots the full router with a mocked `fetch`. If you add page-level logic that's hard to test that way, prefer pulling it into a hook in `runtime/` or a helper in `api/` so it can be unit-tested directly.

## Adding a new admin route

1. Create `src/pages/MyNewPage.tsx`. Inject the API client via `useRuntimeConfig()`.
2. Add a `<Route>` in `src/App.tsx`.
3. Update the nav links if the page should be reachable from the global header.
4. Add component / hook tests to `*.spec.tsx`.

## Build and run the production image

```bash
DOCKER_BUILDKIT=1 docker build \
  --target qr-manager-ui \
  --secret id=npmrc,src=$HOME/.npmrc \
  -t qr-manager-ui:dev \
  .
docker run --rm -p 8080:80 qr-manager-ui:dev
```

To verify the runtime config flow:

```bash
curl -s http://localhost:8080/config.json
curl -s -I http://localhost:8080/admin   # nginx fallback returns 200 with index.html
```
