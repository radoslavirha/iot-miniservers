---
"@radoslavirha/http-provider": minor
"@radoslavirha/tsed-http-provider": minor
"interactive-map-feeder-api": patch
"miot-bridge-api": patch
---

Route every outbound HTTP call through configured, logged clients.

**`@radoslavirha/http-provider`**

`factory.get(key)` now returns an `HttpClient` — this package's own transport-neutral contract —
instead of an `AxiosInstance`. **This changes the public return type.** Axios is an
implementation detail: auth, resilience and configuration are already this package's concerns, so
exposing a third-party client's API as ours tied every consumer to it and made the transport
impossible to change. A single internal adapter is now the only place that speaks axios.

Client methods resolve to the **response body**, options are transport-neutral (`headers`,
`params`, `signal`, `responseType: 'json' | 'text' | 'binary'`), and `raw` remains as an escape
hatch for integrations and tests.

The package stays framework-agnostic and gains **no** logging. Instead it exposes an
`onInstanceCreated(instance, key, role)` hook, called for each new client *before* auth and
resilience interceptors attach. Ordering is the point: axios runs response interceptors in
registration order, so anything registered through the hook observes a raw failure before the
401 auth handler recovers it. The token-exchange auth call now runs through the provider's
resilience policy instead of bare axios, and is surfaced through the hook with `role: 'auth'`.

**`@radoslavirha/tsed-http-provider`** (new package)

Injectable `HttpProviderService` that builds clients from `externalApis` configuration and adds
what the framework-agnostic core leaves out:

- **Logging** — one line per outbound exchange, scoped per API (`HTTP_CLIENT:<key>`), attached
  through the hook. Redaction is delegated to `@radoslavirha/redaction`, sharing the
  `{ enabled, redactPaths }` vocabulary with `tsed-logger`'s inbound `requests` section;
  redactors compile once per API, never per request. Auth headers are redacted by default and
  non-textual responses log as `[[ BINARY ]]`.
- **Failure translation** — a response interceptor maps transport failures onto Ts.ED
  exceptions: circuit open to `ServiceUnavailable`, timeout or cancellation to `GatewayTimeout`,
  upstream error or unreachable host to `BadGateway`, keeping the original as `origin`. It is
  attached *after* the auth interceptor, so a 401 still reaches the auth retry untranslated.
  Previously an external outage surfaced as a raw axios stack in a 500.
- **Client resolution** — an `@InjectHttpClient(key)` property decorator, built on Ts.ED's
  `@Inject(token, transform)`.

`Logger` is resolved from the DI container, so subclasses pass only configuration. Endpoint
services therefore need no base class, no constructor and no try/catch, and never name an HTTP
library. Deserialization stays a separate concern — endpoints call `Serializer` from
`@radoslavirha/tsed-common` directly.

**APIs**

- `interactive-map-feeder-api`: ČHMÚ base URLs moved from hardcoded strings into `externalApis`
  (`chmi-portal`, `chmi-opendata` — two distinct hosts). `CHMIService` is now an injectable
  service composed into `RadarService`/`RadarImageService` rather than an abstract base class,
  and the radar fetch moved out of `RadarService` into its own `CHMIRadarService` endpoint so
  business logic no longer makes HTTP calls directly.
- `miot-bridge-api`: `MiotSpecV2Endpoint` reads its base URL from `externalApis.miot-spec`;
  `specUrl()` still returns an absolute URL, now composed from the client's configured `baseURL`.
  The pre-existing `http` config section keeps its original meaning (notification settings) and
  is untouched.

Deployment note: `interactive-map-feeder-api` and `miot-bridge-api` need the new `externalApis`
block added to their ConfigMaps before rollout.
