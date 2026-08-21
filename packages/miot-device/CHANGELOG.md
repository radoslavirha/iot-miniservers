# @radoslavirha/miot-device

## 0.6.1

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

## 0.6.0

### Minor Changes

- [`55f6775`](https://github.com/radoslavirha/iot-miniservers/commit/55f6775ffe2760a78e86d72d7cd322ab67935dd6) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Surface _why_ a miIO call failed, and whose spec entry the device refused.

  ## The gap

  `miot-bridge-api` builds a miIO request from the device spec and sends it over UDP. When that came
  back refused, none of the reason survived the trip. miIO is JSON-RPC shaped — a rejection is a real
  response carrying `error: { code, message }` — and `MiotTransport` flattened it into
  `new Error('Device error -4004: ...')`, after which `MiotDevice.runWithFreshStamp` re-wrapped it a
  second time into `new Error('Operation failed after stamp refresh for device 1141132187: <that
message>')`. By the time `DeviceCommandService` caught it, the only machine-readable content was a
  substring. Instrumentation on top of that can say "the call failed" and nothing else.

  Worse, the case that matters most was not an error at all. A bulk `get_properties` returns a
  per-property `code` per result item, so a read of twelve properties where the device refuses three
  is a **successful** RPC call: green span, `job.run.items` = `success`, and
  `DevicePropertyPollerService` simply `continue`d past every non-zero code. That is the shape every
  refusal takes on the polling path, which is the dominant caller.

  ## The device is a blackbox and the published spec is incomplete

  `model-property-overrides` holds entries that are _not_ in the published spec but that the device is
  believed to know. So a refusal means one of three things — the override is wrong, the published spec
  is wrong, or the device genuinely does not implement it — and nothing recorded which.

  `SimplifiedMiotSpecV2Mapper` is the only place that can tell: it maps the published spec first and
  lets overrides `set()` over it, so an override reusing a published key **replaces** it and the
  merged map keeps no record of who won. `MiotProperty.source` is now stamped there, at insertion, and
  rides through to telemetry as `miot.property.source` = `spec` | `override`.

  ## `@radoslavirha/miot-device`

  New `MiotError`, carrying `kind`, `method`, `code` and `stampRefreshed`. Still no OpenTelemetry
  dependency — it is plain data the app maps onto attributes.

  - `kind` is `timeout` (silence), `device_error` (the device answered and refused) or
    `transport_error` (socket fault, failed send, empty or undecryptable response).
  - `code` is the miIO status code from _either_ wire position: `error.code` of the envelope, or the
    `code` of a result item. Both are the device saying "no, and here is why".
  - `MiotError.afterStampRefresh` replaces the `new Error(...)` in `runWithFreshStamp`, so the
    classification survives the retry. Messages are unchanged.
  - `runWithStamp` retries **every** failure behind a fresh handshake, including a `device_error` that
    can never succeed twice — a refused property costs a handshake plus a second round trip.
    Behaviour is unchanged here, but the failure now says so via `stampRefreshed`.

  ## Traces

  `withMiotCallSpan` now emits the span _and_ the metrics from one call, the same pairing as `runJob`.
  miIO is JSON-RPC over UDP, so the RPC conventions apply as they are — no `miot.error_code` was
  invented:

  | Attribute                           | Value                                                                                                 |
  | ----------------------------------- | ----------------------------------------------------------------------------------------------------- |
  | `rpc.system.name`                   | `jsonrpc` (`rpc.system` is deprecated)                                                                |
  | `rpc.method`                        | `get_properties` / `set_properties` / `action` / `handshake` (`rpc.service` is deprecated, folded in) |
  | `rpc.response.status_code`          | the miIO code **as a string** (`rpc.jsonrpc.error_code` is deprecated)                                |
  | `error.type`                        | `timeout` / `device_error` / `transport_error` / `rejected_locally` / `_OTHER`                        |
  | span status description             | the error message (`rpc.jsonrpc.error_message` is deprecated)                                         |
  | `miot.property.source`              | `spec` / `override`, on single-property calls                                                         |
  | `miot.stamp.refreshed`              | set when the failure survived a stamp-refresh retry                                                   |
  | `miot.property.rejected` / `.count` | which keys of a bulk read were refused                                                                |

  `error.type` is where the outcome taxonomy lives rather than a `miot.call.outcome` of our own: it is
  stable semconv, it is what RPC metrics require on failure, and it is contractually low cardinality.
  Success sets no `error.type`, per semconv — `error_type=""` is the success series.
  `stamp_retry_exhausted` is deliberately **not** a member, because every such failure is also a
  timeout, a device error or a transport error, and promoting it would erase the code on exactly the
  calls where it matters.

  Anything that is not a `MiotError` gets semconv's own `_OTHER` rather than a guess. A Mongo fault or
  a programming error surfacing on this path is not a device fault, and folding it into
  `transport_error` would put our bugs in the device's column.

  `jsonrpc.protocol.version` is not emitted: it is defined as the value of the request's `jsonrpc`
  member and a miIO packet has none — the payload is JSON-RPC 1.0-shaped, and asserting `"2.0"` would
  be a fabrication. `jsonrpc.request.id` is not emitted either; it is a UNIX timestamp minted inside
  `OutgoingPacket` and never surfaced. `network.transport` stays even though the RPC conventions
  dropped it, because UDP is what makes a failure ten seconds of silence.

  Note `rpc.response.status_code` being a string also sidesteps the Grafana TableNG crash that sparse
  _numeric_ span attributes cause — the same reason identifiers became strings.

  ## Metrics

  | Metric                      | Instrument | Unit          | Attributes                                                       |
  | --------------------------- | ---------- | ------------- | ---------------------------------------------------------------- |
  | `miot.client.call.duration` | Histogram  | `s`           | `rpc.method`, `error.type`                                       |
  | `miot.property.rejections`  | Counter    | `{rejection}` | `rpc.method`, `rpc.response.status_code`, `miot.property.source` |

  - **Not `rpc.client.call.duration`**, deliberately. The RPC client metric conventions make
    `server.address` **required**, and that is one LAN address per physical device — the per-device
    cardinality this repo already refuses on `job.*`. Emitting the reserved name without a required
    attribute produces a non-conformant metric under a name tools assume is conformant. Same reasoning
    that made the job namespace `job.*` and not `faas.*`; the shape is identical, so it converges by
    rename if the constraint ever lifts.
  - Buckets are the semconv-recommended RPC set extended past 10s, because 10s is not a tail here — it
    is `MIOT_TIMEOUT_MS` exactly, and the stamp-refresh retry doubles it.
  - `rpc.response.status_code` is on the counter and **not** the histogram: nobody asks how long a
    `-4004` took, and ~15 codes across 16 buckets buys nothing the counter gives for one series each.
  - `miot.property.source` is on the counter only. A bulk read mixes provenances, so a call has no
    honest single value, and an attribute present on some series and absent on others makes every
    `sum by` over it lie.
  - `rpc.method` is on both. Read-versus-write refusal is the signature of an override with the wrong
    `access`.
  - Never `miot.device.id`, `miot.siid`, `miot.piid` or `server.address` on either.

  `rejected_locally` is recorded from `DeviceCommandService`, which raises no span for it on purpose —
  a client span for a call that never left the process would be a lie. The metric is therefore the
  only always-on evidence that Loxone is asking for a key in neither the spec nor the overrides, which
  is the mirror image of a device refusal.

  A property the device omits from a bulk read response entirely is recorded as
  `rpc.response.status_code="_MISSING"`. The `-1` filler is ours, not the device's, and putting it on
  the attribute would invent a miIO code and sort in among the real ones.

  ## Logs

  Device faults keep their readable message and gain structured fields — `errorType`, `statusCode`,
  `stampRefreshed`, `consecutiveErrors` — so Loki filters on them instead of regexing prose. Each
  refused property in a bulk read gets its own `warn` carrying the key, siid/piid, provenance and
  code. Both sites run inside an active span, so `WinstonInstrumentation` stamps `trace_id` for free.

  ## Answering the question

  ```traceql
  { span.miot.device.id = "1141132187" && span.rpc.response.status_code != "" }
  | select(span.miot.command, span.rpc.response.status_code, span.miot.property.source)
  ```

  ```promql
  sum by (rpc_response_status_code, miot_property_source) (
    rate(miot_property_rejections_total[1h])
  )
  ```

## 0.5.0

### Minor Changes

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

## 0.4.4

### Patch Changes

- [`4a34a89`](https://github.com/radoslavirha/iot-miniservers/commit/4a34a892fa02d4d44307e756a9cab77c1e68256a) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

## 0.4.3

### Patch Changes

- [`422cfcf`](https://github.com/radoslavirha/iot-miniservers/commit/422cfcf17880bbd18b824b20592cac85e007ec88) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

## 0.4.2

### Patch Changes

- [`8bb6799`](https://github.com/radoslavirha/iot-miniservers/commit/8bb679916e23e64df4dd97643f1494e01ef710c2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

## 0.4.1

### Patch Changes

- [`6a21d27`](https://github.com/radoslavirha/iot-miniservers/commit/6a21d27ec7dae43558bb78e832e0c92dcfc3c2cc) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Test deploy

## 0.4.0

### Minor Changes

- [`e77d857`](https://github.com/radoslavirha/iot-miniservers/commit/e77d8576a2b70d8f06fd357c74fe436fc4676b74) Thanks [@radoslavirha](https://github.com/radoslavirha)! - test relase

## 0.3.0

### Minor Changes

- [`5c4f307`](https://github.com/radoslavirha/iot-miniservers/commit/5c4f30794812819a3350341cc7e0d8fcfb533edb) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Implement logger

## 0.2.0

### Minor Changes

- [`3e839ad`](https://github.com/radoslavirha/iot-miniservers/commit/3e839adecbe9b83082886dbfc929aacd0f987250) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Change miot logic

## 0.1.4

### Patch Changes

- [`e585962`](https://github.com/radoslavirha/iot-miniservers/commit/e58596279df17e882007d2dbdb7967e7ae9b9fe5) Thanks [@radoslavirha](https://github.com/radoslavirha)! - CI bugs

## 0.1.3

### Patch Changes

- [`94f9770`](https://github.com/radoslavirha/iot-miniservers/commit/94f9770ac9a3de6e6decbc121c3b247d18b9dd57) Thanks [@radoslavirha](https://github.com/radoslavirha)! - CI bugs

## 0.1.2

### Patch Changes

- [`f3e45e5`](https://github.com/radoslavirha/iot-miniservers/commit/f3e45e5cbe74996468ea7d1894cb0049209a37d8) Thanks [@radoslavirha](https://github.com/radoslavirha)! - CI fixing

## 0.1.1

### Patch Changes

- [`f8c44dc`](https://github.com/radoslavirha/iot-miniservers/commit/f8c44dcfaa3b7dd865fea0cd9d67cc690cde7161) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Separate miot logic
