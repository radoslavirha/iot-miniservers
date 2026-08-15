# qr-manager-api

## 0.5.2

### Patch Changes

- [`6c82bdb`](https://github.com/radoslavirha/iot-miniservers/commit/6c82bdb4db625aaec873d51b4343d23b508e84bb) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix root documentation page

## 0.5.1

### Patch Changes

- [#61](https://github.com/radoslavirha/iot-miniservers/pull/61) [`9bec12c`](https://github.com/radoslavirha/iot-miniservers/commit/9bec12c6b3fc8cdb9cc910c155647ef0d48862d3) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Flush OTEL on shutdown.

  `onStopped: () => openTelemetry.shutdown()` runs after the platform stops, so the drain's
  spans, logs and metrics reach the collector instead of dying with the process. The
  `uncaughtException` / `unhandledRejection` path flushes too — the crash's own telemetry is
  the trace most worth having and the one that was always lost.

- Updated dependencies [[`9bec12c`](https://github.com/radoslavirha/iot-miniservers/commit/9bec12c6b3fc8cdb9cc910c155647ef0d48862d3), [`9bec12c`](https://github.com/radoslavirha/iot-miniservers/commit/9bec12c6b3fc8cdb9cc910c155647ef0d48862d3)]:
  - @radoslavirha/otel@0.4.0
  - @radoslavirha/tsed-health@0.2.0

## 0.5.0

### Minor Changes

- [`8616300`](https://github.com/radoslavirha/iot-miniservers/commit/86163000f67cbfd7388aa1a39e4fd1cf24d6cf9b) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Add Kubernetes health endpoints: `/health/live`, `/health/ready` and `/health`.

  `/health/live` is shallow by design — it performs no I/O and stays 200 while MongoDB is
  down, so a database blip can never restart every replica at once. `/health/ready` reports
  503 when the Mongo connection is not established, which removes the pod from the Service's
  Endpoints without restarting it. Mongo disabled by configuration reports `pass`, so a
  deployment that runs without it is not left permanently NotReady.

  SIGTERM now drains before shutting down: readiness starts failing immediately, in-flight
  requests are given time to finish, and `platform.stop()` is awaited. Previously it was
  neither awaited nor guarded against a second signal, and `beforeExit` could trigger a
  shutdown that was never requested.

## 0.4.4

### Patch Changes

- [#54](https://github.com/radoslavirha/iot-miniservers/pull/54) [`ccb17cc`](https://github.com/radoslavirha/iot-miniservers/commit/ccb17cc3238db60ecd521ce7606bd2687c580603) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Add transport-agnostic resilience (timeout, retry, circuit breaker) with AbortSignal support.

  - `@radoslavirha/resilience`: new package. cockatiel-backed `createResiliencePolicy` /
    `ResiliencePolicyFactory` wrapping any `(signal) => Promise<T>`, composed as
    retry → circuit breaker → timeout, plus `combineSignals` and re-exported error guards
    (`isBrokenCircuitError`, `isTaskCancelledError`).
  - `@radoslavirha/tsed-resilience`: new package. A `@RequestSignal()` parameter decorator that
    injects an `AbortSignal` tied to the HTTP request lifecycle, usable from `SINGLETON`
    controllers, plus `getRequestSignal(ctx)` for middlewares.
  - `@radoslavirha/http-provider`: **config shape changed** — `axios-retry` and the `retry` entry
    are replaced by an optional `resilience` section (timeout + retry + circuit breaker). Retry is
    now **opt-in** (`retry.count` defaults to `0`, previously `3`), and the retriable statuses
    moved from `retry.statusCodes` to a top-level `retriableStatusCodes` (default
    `[500, 502, 503, 504]`). The factory parses each entry through `HttpProviderEntrySchema`, so
    Zod supplies every default.
  - `qr-manager-api`: wires the redirect path (`RedirectController` → `QrCodeService` →
    `QrCodeMongoRepository.findBySlug`) through a resilience policy + `maxTimeMS`, cancelled by
    the request-lifecycle signal.

- Updated dependencies [[`ccb17cc`](https://github.com/radoslavirha/iot-miniservers/commit/ccb17cc3238db60ecd521ce7606bd2687c580603)]:
  - @radoslavirha/resilience@0.2.0
  - @radoslavirha/tsed-resilience@0.2.0

## 0.4.3

### Patch Changes

- [`4a34a89`](https://github.com/radoslavirha/iot-miniservers/commit/4a34a892fa02d4d44307e756a9cab77c1e68256a) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

- Updated dependencies [[`4a34a89`](https://github.com/radoslavirha/iot-miniservers/commit/4a34a892fa02d4d44307e756a9cab77c1e68256a)]:
  - @radoslavirha/otel@0.3.2

## 0.4.2

### Patch Changes

- [`422cfcf`](https://github.com/radoslavirha/iot-miniservers/commit/422cfcf17880bbd18b824b20592cac85e007ec88) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

- Updated dependencies [[`422cfcf`](https://github.com/radoslavirha/iot-miniservers/commit/422cfcf17880bbd18b824b20592cac85e007ec88)]:
  - @radoslavirha/otel@0.3.1

## 0.4.1

### Patch Changes

- [`065250c`](https://github.com/radoslavirha/iot-miniservers/commit/065250c3c2a1f91797e1f8bb6e6db318a88ff93f) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Startup script fix

## 0.4.0

### Minor Changes

- [`aeff188`](https://github.com/radoslavirha/iot-miniservers/commit/aeff188f97952da65227e41d36e7fec2626f8cb2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update dependencies

### Patch Changes

- Updated dependencies [[`aeff188`](https://github.com/radoslavirha/iot-miniservers/commit/aeff188f97952da65227e41d36e7fec2626f8cb2), [`ccd9628`](https://github.com/radoslavirha/iot-miniservers/commit/ccd9628a9d80104c53779572a720546229720e19)]:
  - @radoslavirha/otel@0.3.0

## 0.3.1

### Patch Changes

- [`8bb6799`](https://github.com/radoslavirha/iot-miniservers/commit/8bb679916e23e64df4dd97643f1494e01ef710c2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

- Updated dependencies [[`8bb6799`](https://github.com/radoslavirha/iot-miniservers/commit/8bb679916e23e64df4dd97643f1494e01ef710c2)]:
  - @radoslavirha/otel@0.2.2

## 0.3.0

### Minor Changes

- [`62e9e05`](https://github.com/radoslavirha/iot-miniservers/commit/62e9e05d40755a69d8aa76632d95d801d1fc28ec) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Adjustments in models

## 0.2.1

### Patch Changes

- [`6a21d27`](https://github.com/radoslavirha/iot-miniservers/commit/6a21d27ec7dae43558bb78e832e0c92dcfc3c2cc) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Test deploy

- Updated dependencies [[`6a21d27`](https://github.com/radoslavirha/iot-miniservers/commit/6a21d27ec7dae43558bb78e832e0c92dcfc3c2cc)]:
  - @radoslavirha/otel@0.2.1

## 0.2.0

### Minor Changes

- [`e77d857`](https://github.com/radoslavirha/iot-miniservers/commit/e77d8576a2b70d8f06fd357c74fe436fc4676b74) Thanks [@radoslavirha](https://github.com/radoslavirha)! - test relase

### Patch Changes

- Updated dependencies [[`e77d857`](https://github.com/radoslavirha/iot-miniservers/commit/e77d8576a2b70d8f06fd357c74fe436fc4676b74)]:
  - @radoslavirha/otel@0.2.0
