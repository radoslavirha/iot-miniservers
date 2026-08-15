# interactive-map-feeder

## 0.11.4

### Patch Changes

- [`6c82bdb`](https://github.com/radoslavirha/iot-miniservers/commit/6c82bdb4db625aaec873d51b4343d23b508e84bb) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix root documentation page

## 0.11.3

### Patch Changes

- Updated dependencies [[`d1d7337`](https://github.com/radoslavirha/iot-miniservers/commit/d1d73375fdbfe1a4df0407c63a6ba910944e3c4e)]:
  - @radoslavirha/tsed-http-provider@0.2.2

## 0.11.2

### Patch Changes

- Updated dependencies [[`a97c558`](https://github.com/radoslavirha/iot-miniservers/commit/a97c558d31f8ae3095b1d1553626f9fd2e625896)]:
  - @radoslavirha/tsed-http-provider@0.2.1

## 0.11.1

### Patch Changes

- [#61](https://github.com/radoslavirha/iot-miniservers/pull/61) [`9bec12c`](https://github.com/radoslavirha/iot-miniservers/commit/9bec12c6b3fc8cdb9cc910c155647ef0d48862d3) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Flush OTEL on shutdown.

  `onStopped: () => openTelemetry.shutdown()` runs after the platform stops, so the drain's
  spans, logs and metrics reach the collector instead of dying with the process. The
  `uncaughtException` / `unhandledRejection` path flushes too — the crash's own telemetry is
  the trace most worth having and the one that was always lost.

- Updated dependencies [[`9bec12c`](https://github.com/radoslavirha/iot-miniservers/commit/9bec12c6b3fc8cdb9cc910c155647ef0d48862d3), [`9bec12c`](https://github.com/radoslavirha/iot-miniservers/commit/9bec12c6b3fc8cdb9cc910c155647ef0d48862d3)]:
  - @radoslavirha/otel@0.4.0
  - @radoslavirha/tsed-health@0.2.0

## 0.11.0

### Minor Changes

- [`8616300`](https://github.com/radoslavirha/iot-miniservers/commit/86163000f67cbfd7388aa1a39e4fd1cf24d6cf9b) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Add Kubernetes health endpoints: `/health/live`, `/health/ready` and `/health`, mounted at
  the root rather than under `/v1` so the probe path matches every other app.

  Readiness deliberately does **not** depend on the upstream ČHMÚ APIs. Failing readiness on
  a third-party outage would remove this pod from the Service's Endpoints during an incident
  nobody here can fix, turning someone else's outage into ours for no benefit. Instead the
  upstreams are reported as a non-critical check: `/health` degrades to `warn` while
  `/health/ready` keeps answering 200. Alert on the `warn`; do not act on it in the cluster.

  The signal is passive — it reads the circuit breakers already guarding real traffic, so no
  synthetic request is issued and an idle upstream cannot raise a false alarm.

  SIGTERM now drains before shutting down: readiness starts failing immediately, in-flight
  requests are given time to finish, and `platform.stop()` is awaited. Previously it was
  neither awaited nor guarded against a second signal, and `beforeExit` could trigger a
  shutdown that was never requested.

## 0.10.2

### Patch Changes

- [#54](https://github.com/radoslavirha/iot-miniservers/pull/54) [`830cac2`](https://github.com/radoslavirha/iot-miniservers/commit/830cac2c4aac6a671b4ad9b4c80046e2d07b1d0d) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Route every outbound HTTP call through configured, logged clients.

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
  `onInstanceCreated(instance, key, role)` hook, called for each new client _before_ auth and
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
    attached _after_ the auth interceptor, so a 401 still reaches the auth retry untranslated.
    Previously an external outage surfaced as a raw axios stack in a 500.
  - **Client resolution** — an `@InjectHttpClient(key)` property decorator, built on Ts.ED's
    `@Inject(token, transform)`.

  `externalApis` parsing requires listed enum keys and intentionally tolerates unknown extra keys
  at runtime for rolling-deployment compatibility (extra keys are stripped after parsing).

  `Logger` is resolved from the DI container, so subclasses pass only configuration. Endpoint
  services therefore need no base class, no constructor and no try/catch, and never name an HTTP
  library. Deserialization stays a separate concern — endpoints call `Serializer` from
  `@radoslavirha/tsed-common` directly.

  **APIs**

  - `interactive-map-feeder-api`: ČHMÚ base URLs moved from hardcoded strings into `externalApis`
    (`CHMI_PORTAL`, `CHMI_OPENDATA` — two distinct hosts). Transport wrappers now live under
    `src/v1/endpoints/chmi` as `ChmiPortalEndpoint` and `ChmiRadarEndpoint`, and
    `RadarService`/`RadarImageService` depend on those endpoint wrappers instead of transport-owning
    services.
  - `miot-bridge-api`: `MiotSpecV2Endpoint` reads its base URL from `externalApis.MIOT_SPEC`;
    `specUrl()` still returns an absolute URL, now composed from the client's configured `baseURL`.
    The pre-existing `http` config section keeps its original meaning (notification settings) and
    is untouched.

  Deployment note: `interactive-map-feeder-api` and `miot-bridge-api` need the new `externalApis`
  block added to their ConfigMaps before rollout. Logging defaults are metadata-only (`enabled: true`
  with payload sections disabled unless explicitly enabled).

- Updated dependencies [[`830cac2`](https://github.com/radoslavirha/iot-miniservers/commit/830cac2c4aac6a671b4ad9b4c80046e2d07b1d0d)]:
  - @radoslavirha/tsed-http-provider@0.2.0

## 0.10.1

### Patch Changes

- [`4a34a89`](https://github.com/radoslavirha/iot-miniservers/commit/4a34a892fa02d4d44307e756a9cab77c1e68256a) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

- Updated dependencies [[`4a34a89`](https://github.com/radoslavirha/iot-miniservers/commit/4a34a892fa02d4d44307e756a9cab77c1e68256a)]:
  - @radoslavirha/otel@0.3.2

## 0.10.0

### Minor Changes

- [`066fff7`](https://github.com/radoslavirha/iot-miniservers/commit/066fff712957dd5d0ae36fe98cb2cdfcd218804c) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix sharp imports

### Patch Changes

- [`422cfcf`](https://github.com/radoslavirha/iot-miniservers/commit/422cfcf17880bbd18b824b20592cac85e007ec88) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

- Updated dependencies [[`422cfcf`](https://github.com/radoslavirha/iot-miniservers/commit/422cfcf17880bbd18b824b20592cac85e007ec88)]:
  - @radoslavirha/otel@0.3.1

## 0.9.0

### Minor Changes

- [`26233ea`](https://github.com/radoslavirha/iot-miniservers/commit/26233ea6e6ae6792dc7dd863bf788aa64d00d4e9) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update chmi URLs

## 0.8.1

### Patch Changes

- [`065250c`](https://github.com/radoslavirha/iot-miniservers/commit/065250c3c2a1f91797e1f8bb6e6db318a88ff93f) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Startup script fix

## 0.8.0

### Minor Changes

- [`aeff188`](https://github.com/radoslavirha/iot-miniservers/commit/aeff188f97952da65227e41d36e7fec2626f8cb2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update dependencies

### Patch Changes

- Updated dependencies [[`aeff188`](https://github.com/radoslavirha/iot-miniservers/commit/aeff188f97952da65227e41d36e7fec2626f8cb2), [`ccd9628`](https://github.com/radoslavirha/iot-miniservers/commit/ccd9628a9d80104c53779572a720546229720e19)]:
  - @radoslavirha/otel@0.3.0

## 0.7.2

### Patch Changes

- [`8bb6799`](https://github.com/radoslavirha/iot-miniservers/commit/8bb679916e23e64df4dd97643f1494e01ef710c2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

- Updated dependencies [[`8bb6799`](https://github.com/radoslavirha/iot-miniservers/commit/8bb679916e23e64df4dd97643f1494e01ef710c2)]:
  - @radoslavirha/otel@0.2.2

## 0.7.1

### Patch Changes

- [`6a21d27`](https://github.com/radoslavirha/iot-miniservers/commit/6a21d27ec7dae43558bb78e832e0c92dcfc3c2cc) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Test deploy

- Updated dependencies [[`6a21d27`](https://github.com/radoslavirha/iot-miniservers/commit/6a21d27ec7dae43558bb78e832e0c92dcfc3c2cc)]:
  - @radoslavirha/otel@0.2.1

## 0.7.0

### Minor Changes

- [`e77d857`](https://github.com/radoslavirha/iot-miniservers/commit/e77d8576a2b70d8f06fd357c74fe436fc4676b74) Thanks [@radoslavirha](https://github.com/radoslavirha)! - test relase

- [`f820b31`](https://github.com/radoslavirha/iot-miniservers/commit/f820b31645a39d9e68adddefca68bd0127fe6dcb) Thanks [@radoslavirha](https://github.com/radoslavirha)! - OTEL updates

### Patch Changes

- Updated dependencies [[`e77d857`](https://github.com/radoslavirha/iot-miniservers/commit/e77d8576a2b70d8f06fd357c74fe436fc4676b74)]:
  - @radoslavirha/otel@0.2.0

## 0.6.0

### Minor Changes

- [`025b7db`](https://github.com/radoslavirha/iot-miniservers/commit/025b7db8f242024cc17c0406b63ef9c344159860) Thanks [@radoslavirha](https://github.com/radoslavirha)! - OTEL

## 0.5.0

### Minor Changes

- [`5c4f307`](https://github.com/radoslavirha/iot-miniservers/commit/5c4f30794812819a3350341cc7e0d8fcfb533edb) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Implement logger

## 0.4.4

### Patch Changes

- [`e585962`](https://github.com/radoslavirha/iot-miniservers/commit/e58596279df17e882007d2dbdb7967e7ae9b9fe5) Thanks [@radoslavirha](https://github.com/radoslavirha)! - CI bugs

## 0.4.3

### Patch Changes

- [`94f9770`](https://github.com/radoslavirha/iot-miniservers/commit/94f9770ac9a3de6e6decbc121c3b247d18b9dd57) Thanks [@radoslavirha](https://github.com/radoslavirha)! - CI bugs

## 0.4.2

### Patch Changes

- [`f3e45e5`](https://github.com/radoslavirha/iot-miniservers/commit/f3e45e5cbe74996468ea7d1894cb0049209a37d8) Thanks [@radoslavirha](https://github.com/radoslavirha)! - CI fixing

## 0.4.1

### Patch Changes

- [`f8c44dc`](https://github.com/radoslavirha/iot-miniservers/commit/f8c44dcfaa3b7dd865fea0cd9d67cc690cde7161) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Separate miot logic

## 0.4.0

### Minor Changes

- [`54e2c78`](https://github.com/radoslavirha/iot-miniservers/commit/54e2c787e0fc0b13a3fab8fcc593f9be96f1f87e) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Spring vibe coding cleanup

## 0.3.0

### Minor Changes

- [`7a7df98`](https://github.com/radoslavirha/iot-miniservers/commit/7a7df98b39c395711b5187e96da906ce6e59e77e) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update toolkit-hub

## 0.2.6

### Patch Changes

- [`91cbbea`](https://github.com/radoslavirha/iot-miniservers/commit/91cbbea93b784e02bc3d98a0dc9510a287c8c194) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Test release

## 0.2.5

### Patch Changes

- [`10c964e`](https://github.com/radoslavirha/iot-miniservers/commit/10c964e49a8bbdd9856f70395b3eefdda85985d6) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Build issues

## 0.2.4

### Patch Changes

- [`0d504b7`](https://github.com/radoslavirha/iot-miniservers/commit/0d504b7e0fcf1b28ad59e8bb1b01844777e75073) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix docs build in CI

## 0.2.3

### Patch Changes

- [`7d56cb7`](https://github.com/radoslavirha/iot-miniservers/commit/7d56cb7e7467f7b06a848522a60d10aefec9dd78) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix build issues

## 0.2.2

### Patch Changes

- [`acb47f7`](https://github.com/radoslavirha/iot-miniservers/commit/acb47f7fdd3a9b332bc5bda009b3e9ff3c8953b0) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Improve docs build

## 0.2.1

### Patch Changes

- [`2d0434e`](https://github.com/radoslavirha/iot-miniservers/commit/2d0434ef7643841284d2c96368ed53adef02434c) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fixed build after changes in toolkit-hub packages

## 0.2.0

### Minor Changes

- [`0d94528`](https://github.com/radoslavirha/iot-miniservers/commit/0d94528330e54d0f57a6fd436ec81e7d1c889f5f) Thanks [@radoslavirha](https://github.com/radoslavirha)! - General improvements

## 0.1.2

### Patch Changes

- [`65c1fe5`](https://github.com/radoslavirha/iot-miniservers/commit/65c1fe562d00df566d0e725d66719ef6b235b212) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix uppercase filename

## 0.1.1

### Patch Changes

- [`4946c10`](https://github.com/radoslavirha/iot-miniservers/commit/4946c10b61b1897fbb8180ddb973b8cdd297eeb4) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Exclude config files in .dockerignore

- [`7cf8461`](https://github.com/radoslavirha/iot-miniservers/commit/7cf8461fad895a2d5d5206c3ce79fc6f9e8ff9b1) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Include test.json file for tests

## 0.1.0

### Minor Changes

- [`57e9acd`](https://github.com/radoslavirha/iot-miniservers/commit/57e9acde2e4620a8cc603af6a710ddd7bbffd449) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Updated API to include data sources
