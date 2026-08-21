# qr-manager-api

## 0.5.5

### Patch Changes

- [`b14ef8c`](https://github.com/radoslavirha/iot-miniservers/commit/b14ef8cedc63a488bc7dbfb62791601135129443) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Enable the `@radoslavirha/utils` reuse lint rules in every workspace that depends on `utils`.
  
  The rules flag a hand-written check that the toolkit already provides a type predicate for —
  `=== null`, `=== undefined`, `typeof x === 'string' | 'boolean' | 'number' | 'function'`,
  `instanceof Date`, `Array.isArray`, `JSON.parse(JSON.stringify(...))` — and a `lodash` import that
  should come from `utils` instead. Each message names the replacement and what it narrows to.
  
  They ship from `@radoslavirha/utils/eslint`, **not** `@radoslavirha/config-eslint`, so that a rule
  and the method it recommends are released together and a project can never be advised to call
  something its installed version lacks. Nothing needed installing — `utils` is already a dependency
  at the required version everywhere the rules are now enabled; this is wiring only:
  
  ```js
  import PreferUtils from '@radoslavirha/utils/eslint';
  
  export default config(...Config, ...PreferUtils);
  ```
  
  Enabled in the seven workspaces that depend on `utils`, and deliberately not in the four that do
  not (`health`, `resilience`, `tsed-resilience`, `ui-*`), where the rules would only produce noise.
  The ruleset already excludes `*.spec.ts`: `expect(Array.isArray(x)).toBe(true)` is asserting a raw
  fact about a value, and routing it through a toolkit guard would partly test the toolkit.
  
  Every finding is fixed rather than suppressed, so the baseline is **zero warnings** and
  `--max-warnings 0` passes today. That is the point of doing it this way: the rules are graded
  `warn` because a raw check is occasionally the clearer choice, but a permanently-warning baseline
  makes the next real finding invisible and forces every reader to re-derive which of the standing
  warnings were deliberate. A clean baseline keeps the signal, and leaves the option of enforcing it.

- [`8026b4f`](https://github.com/radoslavirha/iot-miniservers/commit/8026b4f7cf12742daf881790796bb06f14e61074) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

- [`b14ef8c`](https://github.com/radoslavirha/iot-miniservers/commit/b14ef8cedc63a488bc7dbfb62791601135129443) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Use `@radoslavirha/utils` guards instead of hand-written ones in backend code.
  
  Every package here already depends on `@radoslavirha/utils`, but a number of call sites still
  wrote the check by hand: `!== undefined`, `typeof x === 'string'`, `typeof x === 'function'`,
  `Array.isArray(x)`. The toolkit ships type predicates for all of them, so the hand-written form is
  a second implementation of something the dependency already provides — and the place the
  difference shows is narrowing, which the predicates carry and an ad-hoc check only reproduces by
  accident.
  
  All raw guards in the packages that depend on `utils` are now replaced, so the repo is clean under
  the reuse rules adopted alongside this change. `ui/*` is out of scope — those bundles do not
  depend on `utils` — as are `health`, `resilience` and `tsed-resilience`, which do not either.
  
  Two of the replacements are not the obvious ones, and both would have been behaviour changes:
  
  - **`MiotTransport.callAction` keeps its explicit branches** rather than collapsing into
    `ArrayUtils.toArray`, which looks like a drop-in and is not: `toArray` maps `null` to `[]`, where
    the existing code wraps it as `[null]` and sends it to the device as an action argument.
  - **`resolveUrl` keeps its `=== ''` comparisons.** `CommonUtils.isEmpty` covers both cases in one
    call but returns a plain `boolean`, not a type predicate, so folding the two together would have
    dropped the narrowing that the following `ABSOLUTE_URL.test(url)` depends on.
  
  One site needed restructuring rather than substitution. In `attachRequestLogging`, TypeScript
  narrows `requestConfig` itself through `requestConfig?._logStartedAt === undefined` — a special
  rule for optional-chain comparisons that a user-defined predicate does not get. Hoisting the value
  to a local gives the narrowing something to attach to, and shortens the expression.
- Updated dependencies [[`b14ef8c`](https://github.com/radoslavirha/iot-miniservers/commit/b14ef8cedc63a488bc7dbfb62791601135129443), [`b14ef8c`](https://github.com/radoslavirha/iot-miniservers/commit/b14ef8cedc63a488bc7dbfb62791601135129443), [`b14ef8c`](https://github.com/radoslavirha/iot-miniservers/commit/b14ef8cedc63a488bc7dbfb62791601135129443)]:
  - @radoslavirha/otel@0.6.1

## 0.5.4

### Patch Changes

- [`fe19ecb`](https://github.com/radoslavirha/iot-miniservers/commit/fe19ecb0468ec0e5a93379a4b988e573b88c3df2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Give every non-HTTP entry point a root span, trace the miot device call, and give scheduled work a
  reusable metric set.

  1,065 of 1,067 log lines carried no `trace_id`, which was never a logging problem:
  `WinstonInstrumentation` stamps the id off the active span, and outside the MQTT paths no span
  was ever active. The same absence turned every poller DB call into a **parentless single-span
  trace** — mongoose auto-instrumentation starting a fresh trace because there was no parent —
  arriving at ~0.35/s, roughly 7,500 per 6 hours, enough that a 6h Tempo search returned nothing
  else.

  `packages/otel` gains the primitive the MQTT helpers already implied: `withSpan`, plus
  `withEntryPointSpan` (roots a trace for work this process starts by itself) and `withClientSpan`
  (nested, for an outbound call). `mqttTracing` now builds on it instead of carrying its own copy of
  the settle-and-record logic. `withSpan` also takes `suppress`, which runs the callback with
  tracing suppressed rather than creating a span — the "not sampled" case for a high-frequency
  caller, and not the same as skipping the wrapper, since with no span _and_ no suppression the
  calls underneath start orphan traces again.

  ## Metrics for scheduled work

  Spans answer _what happened in this one run_, which for a cron is the less useful question: a cron
  is deterministic, so a fault that recurs every tick shows up in any of them. What an operator needs
  is _is this job running, how long does it take, is it failing_, always-on, without opening Tempo.

  `packages/otel` gains `runJob`, which emits the entry-point span **and** three metrics from one
  call, so the next cron gets both signals without its author thinking about either — and crucially,
  **a run sampled out of tracing still records its metrics**. Traces are sampled; metrics are not.
  If the two were wired separately, the sampling rate would silently become the run rate.

  | Metric             | Instrument | Unit     | Attributes                     |
  | ------------------ | ---------- | -------- | ------------------------------ |
  | `job.run.duration` | Histogram  | `s`      | `job.name`, `job.run.outcome`  |
  | `job.run.skips`    | Counter    | `{skip}` | `job.name`, `job.skip.reason`  |
  | `job.run.items`    | Counter    | `{item}` | `job.name`, `job.item.outcome` |

  No separate executions counter — the histogram's `count` series is the run rate and its outcome
  split is the failure rate. `job.name` is a bounded static set of constants; span attributes are
  deliberately never copied onto a metric, so no call site can put a device id on one. Explicit
  bucket boundaries (10ms–5min) replace the SDK default, which is built for milliseconds and would
  report every quantile of these sub-second jobs as 0. `job.*` is repo-local: OpenTelemetry has no
  convention for an in-process scheduled job, `faas.*` would claim FaaS semantics a `setTimeout` does
  not have, and `cicd.pipeline.run.*` lent its shape but not its entity.

  In `miot-bridge-api`:

  - **The poll tick** is one root span with a child span per device, so the device lookup, override
    lookup and UDP read finally nest under the thing that caused them. A tick with nothing due opens
    no span at all. Ticks are head-sampled — at most one per `polling.traceIntervalMs` (new,
    optional, default 60s), plus every tick that polls a device already mid-failure, because that is
    the case the spans exist for. An always-on tick span would be ~17k identical traces a day and
    would have replaced the flood rather than removed it. The cost: a property change detected in a
    sampled-out tick publishes its notification untraced; `traceIntervalMs: 0` traces every tick.
    Every tick — sampled or not — records `job.run.duration`, and every device polled records a
    `job.run.items` outcome. The item outcome is what makes the poller legible: a device fault is
    caught per device and turned into back-off, so the _run_ always succeeds, and run outcome alone
    would report a perfectly healthy job with every device dead. A tick with nothing due counts a
    `nothing_due` skip, the only thing separating an idle poller from a dead one once every device is
    in back-off. The startup subscription load is a job too, so a slow or throwing load is visible as
    the reason a live-looking poller polls nothing.
  - **No `overrun` skip is emitted, and that is deliberate.** `scheduleNext` re-arms a `setTimeout`
    in `tick`'s `finally`, after the awaited work, so exactly one timer is ever armed and the
    `_ticking` guard is unreachable; counting it would create a series that can only read zero. The
    real consequence of that scheduler shape is that a slow tick makes the job run _late_ rather than
    skip — the effective period is `intervalMs + tick duration`. That needs no metric either: for a
    self-rescheduling chain there is no missed deadline to be late against, and
    `1 / (rate(job_run_duration_seconds_count) + rate(job_run_skips_total))` is the effective period.
    The `overrun` value stays defined for the first fixed-rate job, which genuinely can skip.
  - **The UDP listener gets no `job.*` metric.** A datagram from Loxone is request traffic whose rate
    a client sets, not work this process scheduled; filing it under `job.*` would break every panel
    reading a run rate off these instruments.
  - **The inbound UDP listener** raises a CONSUMER span per datagram, covering the reply as well as
    the command, with `network.transport` / `network.peer.*` / `network.local.port` and the
    `miot.*` command attributes. Loxone sends no trace context, so it is deliberately a root.
  - **The miot device call** raises a CLIENT span at the `DeviceCommandService` and
    `DeviceDiscoveryService` seams, carrying `server.address`, `server.port`, `network.transport`
    and `miot.device.id`. The transport is raw `dgram` with a 10s timeout and no telemetry, so a
    device that had dropped off the LAN previously showed up as ten silent seconds inside an HTTP or
    MQTT span with nothing to say what was being waited on. `@radoslavirha/miot-device` keeps its
    no-OpenTelemetry rule; it only exports `MIOT_DEFAULT_PORT` so the span cannot claim a port the
    transport never used.
  - Span names, tracer scopes, `job.name` values and `miot.*` attribute keys move to
    `src/otel/telemetry.ts`. The dead `src/otel/index.ts` in all three APIs — a duplicate of
    `getTracer`/`getMeter` from `@radoslavirha/otel`, imported nowhere — is gone.

- Updated dependencies [[`fe19ecb`](https://github.com/radoslavirha/iot-miniservers/commit/fe19ecb0468ec0e5a93379a4b988e573b88c3df2)]:
  - @radoslavirha/otel@0.6.0

## 0.5.3

### Patch Changes

- Updated dependencies [[`b3c30db`](https://github.com/radoslavirha/iot-miniservers/commit/b3c30db5964b8a55e912c6442dcf47ddd3a1e1ee)]:
  - @radoslavirha/otel@0.5.0

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
