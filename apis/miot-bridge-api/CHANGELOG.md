# miot-bridge

## 0.19.2

### Patch Changes

- Updated dependencies [[`a97c558`](https://github.com/radoslavirha/iot-miniservers/commit/a97c558d31f8ae3095b1d1553626f9fd2e625896)]:
  - @radoslavirha/tsed-http-provider@0.2.1

## 0.19.1

### Patch Changes

- [#61](https://github.com/radoslavirha/iot-miniservers/pull/61) [`9bec12c`](https://github.com/radoslavirha/iot-miniservers/commit/9bec12c6b3fc8cdb9cc910c155647ef0d48862d3) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Flush OTEL on shutdown.

  `onStopped: () => openTelemetry.shutdown()` runs after the platform stops, so the drain's
  spans, logs and metrics reach the collector instead of dying with the process. The
  `uncaughtException` / `unhandledRejection` path flushes too — the crash's own telemetry is
  the trace most worth having and the one that was always lost.

- Updated dependencies [[`9bec12c`](https://github.com/radoslavirha/iot-miniservers/commit/9bec12c6b3fc8cdb9cc910c155647ef0d48862d3), [`9bec12c`](https://github.com/radoslavirha/iot-miniservers/commit/9bec12c6b3fc8cdb9cc910c155647ef0d48862d3)]:
  - @radoslavirha/otel@0.4.0
  - @radoslavirha/tsed-health@0.2.0

## 0.19.0

### Minor Changes

- [`8616300`](https://github.com/radoslavirha/iot-miniservers/commit/86163000f67cbfd7388aa1a39e4fd1cf24d6cf9b) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Add Kubernetes health endpoints: `/health/live`, `/health/ready` and `/health`.

  `/health/live` is shallow by design — it performs no I/O and stays 200 with both MongoDB
  and the MQTT broker down, so a dependency blip can never restart every replica at once.
  `/health/ready` reports 503 when either is unreachable, which removes the pod from the
  Service's Endpoints without restarting it.

  The MQTT check is the only signal a mid-life broker outage produces: `MqttClientProvider`
  rejects only during startup, so reconnects afterwards are silent while the process keeps
  looking healthy. Either dependency disabled by configuration reports `pass`, so a
  cache-backed or HTTP-only deployment is not left permanently NotReady.

  SIGTERM now drains before shutting down: readiness starts failing immediately, in-flight
  requests are given time to finish, and `platform.stop()` is awaited. Previously it was
  neither awaited nor guarded against a second signal, and `beforeExit` could trigger a
  shutdown that was never requested.

## 0.18.4

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

## 0.18.3

### Patch Changes

- [`4a34a89`](https://github.com/radoslavirha/iot-miniservers/commit/4a34a892fa02d4d44307e756a9cab77c1e68256a) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

- Updated dependencies [[`4a34a89`](https://github.com/radoslavirha/iot-miniservers/commit/4a34a892fa02d4d44307e756a9cab77c1e68256a)]:
  - @radoslavirha/otel@0.3.2
  - @radoslavirha/miot-device@0.4.4

## 0.18.2

### Patch Changes

- [`422cfcf`](https://github.com/radoslavirha/iot-miniservers/commit/422cfcf17880bbd18b824b20592cac85e007ec88) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

- Updated dependencies [[`422cfcf`](https://github.com/radoslavirha/iot-miniservers/commit/422cfcf17880bbd18b824b20592cac85e007ec88)]:
  - @radoslavirha/miot-device@0.4.3
  - @radoslavirha/otel@0.3.1

## 0.18.1

### Patch Changes

- [`065250c`](https://github.com/radoslavirha/iot-miniservers/commit/065250c3c2a1f91797e1f8bb6e6db318a88ff93f) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Startup script fix

## 0.18.0

### Minor Changes

- [`aeff188`](https://github.com/radoslavirha/iot-miniservers/commit/aeff188f97952da65227e41d36e7fec2626f8cb2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update dependencies

### Patch Changes

- Updated dependencies [[`aeff188`](https://github.com/radoslavirha/iot-miniservers/commit/aeff188f97952da65227e41d36e7fec2626f8cb2), [`ccd9628`](https://github.com/radoslavirha/iot-miniservers/commit/ccd9628a9d80104c53779572a720546229720e19)]:
  - @radoslavirha/otel@0.3.0

## 0.17.2

### Patch Changes

- [`8bb6799`](https://github.com/radoslavirha/iot-miniservers/commit/8bb679916e23e64df4dd97643f1494e01ef710c2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

- Updated dependencies [[`8bb6799`](https://github.com/radoslavirha/iot-miniservers/commit/8bb679916e23e64df4dd97643f1494e01ef710c2)]:
  - @radoslavirha/miot-device@0.4.2
  - @radoslavirha/otel@0.2.2

## 0.17.1

### Patch Changes

- [`6a21d27`](https://github.com/radoslavirha/iot-miniservers/commit/6a21d27ec7dae43558bb78e832e0c92dcfc3c2cc) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Test deploy

- Updated dependencies [[`6a21d27`](https://github.com/radoslavirha/iot-miniservers/commit/6a21d27ec7dae43558bb78e832e0c92dcfc3c2cc)]:
  - @radoslavirha/miot-device@0.4.1
  - @radoslavirha/otel@0.2.1

## 0.17.0

### Minor Changes

- [`e77d857`](https://github.com/radoslavirha/iot-miniservers/commit/e77d8576a2b70d8f06fd357c74fe436fc4676b74) Thanks [@radoslavirha](https://github.com/radoslavirha)! - test relase

- [`f820b31`](https://github.com/radoslavirha/iot-miniservers/commit/f820b31645a39d9e68adddefca68bd0127fe6dcb) Thanks [@radoslavirha](https://github.com/radoslavirha)! - OTEL updates

### Patch Changes

- Updated dependencies [[`e77d857`](https://github.com/radoslavirha/iot-miniservers/commit/e77d8576a2b70d8f06fd357c74fe436fc4676b74)]:
  - @radoslavirha/miot-device@0.4.0
  - @radoslavirha/otel@0.2.0

## 0.16.0

### Minor Changes

- [`d5c0b1f`](https://github.com/radoslavirha/iot-miniservers/commit/d5c0b1f321e9be86b2270d6435c9a5fcfff2a677) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update MQTT topics

## 0.15.0

### Minor Changes

- [`025b7db`](https://github.com/radoslavirha/iot-miniservers/commit/025b7db8f242024cc17c0406b63ef9c344159860) Thanks [@radoslavirha](https://github.com/radoslavirha)! - OTEL

## 0.14.0

### Minor Changes

- [`5c4f307`](https://github.com/radoslavirha/iot-miniservers/commit/5c4f30794812819a3350341cc7e0d8fcfb533edb) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Implement logger

### Patch Changes

- Updated dependencies [[`5c4f307`](https://github.com/radoslavirha/iot-miniservers/commit/5c4f30794812819a3350341cc7e0d8fcfb533edb)]:
  - @radoslavirha/miot-device@0.3.0

## 0.13.0

### Minor Changes

- [`3e839ad`](https://github.com/radoslavirha/iot-miniservers/commit/3e839adecbe9b83082886dbfc929aacd0f987250) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Change miot logic

### Patch Changes

- Updated dependencies [[`3e839ad`](https://github.com/radoslavirha/iot-miniservers/commit/3e839adecbe9b83082886dbfc929aacd0f987250)]:
  - @radoslavirha/miot-device@0.2.0

## 0.12.5

### Patch Changes

- [`e585962`](https://github.com/radoslavirha/iot-miniservers/commit/e58596279df17e882007d2dbdb7967e7ae9b9fe5) Thanks [@radoslavirha](https://github.com/radoslavirha)! - CI bugs

- Updated dependencies [[`e585962`](https://github.com/radoslavirha/iot-miniservers/commit/e58596279df17e882007d2dbdb7967e7ae9b9fe5)]:
  - @radoslavirha/miot-device@0.1.4

## 0.12.4

### Patch Changes

- [`94f9770`](https://github.com/radoslavirha/iot-miniservers/commit/94f9770ac9a3de6e6decbc121c3b247d18b9dd57) Thanks [@radoslavirha](https://github.com/radoslavirha)! - CI bugs

- Updated dependencies [[`94f9770`](https://github.com/radoslavirha/iot-miniservers/commit/94f9770ac9a3de6e6decbc121c3b247d18b9dd57)]:
  - @radoslavirha/miot-device@0.1.3

## 0.12.3

### Patch Changes

- [`f3e45e5`](https://github.com/radoslavirha/iot-miniservers/commit/f3e45e5cbe74996468ea7d1894cb0049209a37d8) Thanks [@radoslavirha](https://github.com/radoslavirha)! - CI fixing

- Updated dependencies [[`f3e45e5`](https://github.com/radoslavirha/iot-miniservers/commit/f3e45e5cbe74996468ea7d1894cb0049209a37d8)]:
  - @radoslavirha/miot-device@0.1.2

## 0.12.2

### Patch Changes

- [`f8c44dc`](https://github.com/radoslavirha/iot-miniservers/commit/f8c44dcfaa3b7dd865fea0cd9d67cc690cde7161) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Separate miot logic

- Updated dependencies [[`f8c44dc`](https://github.com/radoslavirha/iot-miniservers/commit/f8c44dcfaa3b7dd865fea0cd9d67cc690cde7161)]:
  - @radoslavirha/miot-device@0.1.1

## 0.12.1

### Patch Changes

- [`17b91f8`](https://github.com/radoslavirha/iot-miniservers/commit/17b91f8c6bc21dedf1ff14aec452e0bc5db6cda2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix unhandled rejection

## 0.12.0

### Minor Changes

- [`b65fc72`](https://github.com/radoslavirha/iot-miniservers/commit/b65fc72770dbe0e9f93851e94dd957bdf8905489) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix overrides in notification registry

## 0.11.0

### Minor Changes

- [`41bcfce`](https://github.com/radoslavirha/iot-miniservers/commit/41bcfce9673d235e7c7fc4ed9dc20df7def594fd) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Property overrides

## 0.10.0

### Minor Changes

- [`2fe0574`](https://github.com/radoslavirha/iot-miniservers/commit/2fe0574c08f19a047116b8bcf3f780c25ace3620) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Raw commands

## 0.9.0

### Minor Changes

- [`5ac3a67`](https://github.com/radoslavirha/iot-miniservers/commit/5ac3a67dbb0f2956fab8cc6b7df1aba9a794ba89) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Changed responses in all transports

## 0.8.1

### Patch Changes

- [`f8215a3`](https://github.com/radoslavirha/iot-miniservers/commit/f8215a33d43cb9b566274b2734888fcdccf2fdba) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix handling empty mqtt messages

## 0.8.0

### Minor Changes

- [`54e2c78`](https://github.com/radoslavirha/iot-miniservers/commit/54e2c787e0fc0b13a3fab8fcc593f9be96f1f87e) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Spring vibe coding cleanup

## 0.7.0

### Minor Changes

- [`cdf137b`](https://github.com/radoslavirha/iot-miniservers/commit/cdf137b75a9f51445be1247be68775de20f4736f) Thanks [@radoslavirha](https://github.com/radoslavirha)! - MongoDB support

## 0.6.0

### Minor Changes

- [`c8b9b54`](https://github.com/radoslavirha/iot-miniservers/commit/c8b9b54b5fd4a25850420a5ea67b00d2beca7b2b) Thanks [@radoslavirha](https://github.com/radoslavirha)! - MongoDB connection

## 0.5.0

### Minor Changes

- [`7a7df98`](https://github.com/radoslavirha/iot-miniservers/commit/7a7df98b39c395711b5187e96da906ce6e59e77e) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update toolkit-hub

## 0.4.0

### Minor Changes

- [`ebdfa57`](https://github.com/radoslavirha/iot-miniservers/commit/ebdfa57944736c9cd2bd61fd4750aff5f9331c15) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Remove API versioning, not needed

## 0.3.1

### Patch Changes

- [`a2c282c`](https://github.com/radoslavirha/iot-miniservers/commit/a2c282cca72175b94673d0bb5e45dc9f04bd0724) Thanks [@radoslavirha](https://github.com/radoslavirha)! - configurable MQTT topic prefix

## 0.3.0

### Minor Changes

- [`f4fb286`](https://github.com/radoslavirha/iot-miniservers/commit/f4fb286b8839736d00a14cc3c5bacd23d5d166d0) Thanks [@radoslavirha](https://github.com/radoslavirha)! - MQTT fully working

## 0.2.7

### Patch Changes

- [`c751da4`](https://github.com/radoslavirha/iot-miniservers/commit/c751da4c5c50c9e4e5468134cf066ad1ea914873) Thanks [@radoslavirha](https://github.com/radoslavirha)! - MQTT client

## 0.2.6

### Patch Changes

- [`efd4d94`](https://github.com/radoslavirha/iot-miniservers/commit/efd4d9454164b7214247100f54f4b2882f07abfd) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Log incoming UDP

## 0.2.5

### Patch Changes

- [`91cbbea`](https://github.com/radoslavirha/iot-miniservers/commit/91cbbea93b784e02bc3d98a0dc9510a287c8c194) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Test release

## 0.2.4

### Patch Changes

- [`10c964e`](https://github.com/radoslavirha/iot-miniservers/commit/10c964e49a8bbdd9856f70395b3eefdda85985d6) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Build issues

## 0.2.3

### Patch Changes

- [`0d504b7`](https://github.com/radoslavirha/iot-miniservers/commit/0d504b7e0fcf1b28ad59e8bb1b01844777e75073) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix docs build in CI

## 0.2.2

### Patch Changes

- [`7d56cb7`](https://github.com/radoslavirha/iot-miniservers/commit/7d56cb7e7467f7b06a848522a60d10aefec9dd78) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix build issues

## 0.2.1

### Patch Changes

- [`acb47f7`](https://github.com/radoslavirha/iot-miniservers/commit/acb47f7fdd3a9b332bc5bda009b3e9ff3c8953b0) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Improve docs build

## 0.2.0

### Minor Changes

- [`0d94528`](https://github.com/radoslavirha/iot-miniservers/commit/0d94528330e54d0f57a6fd436ec81e7d1c889f5f) Thanks [@radoslavirha](https://github.com/radoslavirha)! - General improvements
