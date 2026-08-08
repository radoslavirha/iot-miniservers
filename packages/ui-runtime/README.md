# @radoslavirha/ui-runtime

Headless runtime primitives for the browser apps: loading and validating
`config.json`, and modelling whether the backend is reachable. **No JSX** — the
visual layer is `@radoslavirha/ui-kit`, which keeps the dependency arrow
one-way and lets a non-React consumer use the status model.

Spec: `docs/superpowers/specs/2026-08-06-iot-app-health-checks-frontend.md`.

## Runtime config

One Zod schema per app, used in two places from the same source file:

```ts
// src/runtime/RuntimeConfig.ts
export const RuntimeConfigSchema = z.object({
    apiBaseURL: httpUrl().transform(stripTrailingSlash),
    basePath: absolutePath().default('/')
});
export type RuntimeConfig = z.infer<typeof RuntimeConfigSchema>;
```

1. **Browser** — `loadRuntimeConfig({ schema })` fetches, parses and validates.
2. **Pod start** — `runConfigValidatorCli(schema, process.argv[2])`, bundled by
   esbuild into an `<app>-config-validator` image, run as an initContainer by the
   `iot-applications` chart before the app container starts.

Two build outputs, one source of truth. Nothing restates the rules in shell, jq
or JSON Schema.

### Use `httpUrl()`, not `z.url()`

`z.url()` accepts `"localhost:4002"` — `new URL("localhost:4002")` parses as
protocol `localhost:` with pathname `4002`. That is precisely the typo worth
catching, so `httpUrl()` constrains the protocol to `http`/`https`.

### Error messages must not leak values

`homelab-dashboard-ui`'s config carries `unifi.apiKey`, and validator output goes
to pod logs and on to Loki. Zod's `prettifyError` reports paths and expected
types, never received values — `validateConfigFile.spec.ts` pins this with a
sentinel fixture. Keep it that way if you add custom messages.

## API status

Failure state is derived from **real requests**, not from polling a health
endpoint — see decision 3 in the spec for why. The app's API client classifies
each outcome and reports it:

```ts
const { status, report } = useApiStatus();
// in the client, after every request:
report(classifyResponse(response));   // or classifyError() if fetch rejected
```

A `4xx` maps to `ok`: the backend answered, the request was wrong. Only `5xx`
degrades, and only a failed fetch is `unreachable`.

`recoveryProbe` is opt-in and runs **only while status is not ok**, with
exponential backoff, stopping on the first success and pausing while the tab is
hidden. It is for unattended screens (`homelab-dashboard-ui`); a hands-on admin
UI should leave it unset and let the user reload.
