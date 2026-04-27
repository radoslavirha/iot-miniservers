# Instructions

- Stick to root [AGENTS.md](../../AGENTS.md) instructions.
- This is the **first** UI app in the monorepo. Patterns set here are expected to be reused by future UIs (one folder per app under `ui/`).
- End-user documentation lives in [README.md](./README.md). Architecture / dev notes live in [DEVELOPMENT.md](./DEVELOPMENT.md).

## Source structure

```text
src/
├── api/
│   ├── client.ts? — none currently; lives in qrCodes.ts
│   ├── qrCodes.ts            # createQrCodesClient(apiBaseURL) → typed CRUD client
│   └── types.ts              # QrCode, QR_TYPES, request/response/filter types
├── components/
│   ├── Filters.tsx           # type + active filter selects
│   └── QrImage.tsx           # SVG preview + PNG download link
├── pages/
│   ├── QrCodeListPage.tsx
│   ├── QrCodeCreatePage.tsx
│   └── QrCodeDetailPage.tsx
├── runtime/
│   ├── RuntimeConfig.ts          # loadRuntimeConfig() + validation
│   └── RuntimeConfigContext.tsx  # React context provider + hook
├── App.tsx                       # router + nav + <RuntimeConfigProvider>
├── main.tsx                      # awaits config then mounts <App />
├── styles.css
├── test-setup.ts                 # jest-dom matchers
└── vite-env.d.ts
```

## Runtime config pattern

`index.html` runs an inline script before the bundle that fetches `config.json` and stashes the promise on `window.__APP_CONFIG_PROMISE__`. `main.tsx` awaits it and only mounts React once it resolves. The shape is validated by `validateRuntimeConfig` so a malformed ConfigMap breaks loudly rather than crashing later.

In Kubernetes the file at `/usr/share/nginx/html/config.json` is replaced by a mounted ConfigMap; nginx serves it with `Cache-Control: no-store` so a config rollover is picked up on the next page load.

## Routing

- `/` redirects to `/admin`.
- `/admin` is the list page.
- `/admin/new` is the create form.
- `/admin/:id` is the detail/edit page.

`<App basename={import.meta.env.BASE_URL} />` in `main.tsx` honours `vite build`'s `base` option, so the same image can be served at `/` (own host) or under `/qr/` behind a reverse proxy that strips `/qr` (set `VITE_BASE_PATH=/qr/` at build time).

## Conventions

- React 19 + Vite. TypeScript with `verbatimModuleSyntax: false` to keep imports ergonomic with `react-router-dom`.
- ESM imports use explicit `.js` extensions for parity with the API packages.
- API calls go through `createQrCodesClient(apiBaseURL)` — never hard-code a base URL in components.
- Tests use Vitest + Testing Library. Page components are not unit-tested directly; their behaviour is exercised by `App.spec.tsx` (full router + fetch mock).
