# @radoslavirha/resilience

## 0.2.0

### Minor Changes

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
