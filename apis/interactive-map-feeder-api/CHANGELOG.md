# interactive-map-feeder

## 0.11.9

### Patch Changes

- [`3d969d2`](https://github.com/radoslavirha/iot-miniservers/commit/3d969d2d51fa57ff9ac117e7520e836c698b94cf) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix changeset release

## 0.11.8

### Patch Changes

- [`ec7c551`](https://github.com/radoslavirha/iot-miniservers/commit/ec7c55100731d2ea1790b5f7785ea4f0b8f5efcc) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix changeset releases

## 0.11.7

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
- Updated dependencies [[`b14ef8c`](https://github.com/radoslavirha/iot-miniservers/commit/b14ef8cedc63a488bc7dbfb62791601135129443), [`b14ef8c`](https://github.com/radoslavirha/iot-miniservers/commit/b14ef8cedc63a488bc7dbfb62791601135129443), [`b14ef8c`](https://github.com/radoslavirha/iot-miniservers/commit/b14ef8cedc63a488bc7dbfb62791601135129443)]:
  - @radoslavirha/otel@0.6.1
  - @radoslavirha/tsed-http-provider@0.2.3

## 0.11.6

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

## 0.11.5

### Patch Changes

- Updated dependencies [[`b3c30db`](https://github.com/radoslavirha/iot-miniservers/commit/b3c30db5964b8a55e912c6442dcf47ddd3a1e1ee)]:
  - @radoslavirha/otel@0.5.0

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
