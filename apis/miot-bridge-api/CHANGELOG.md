# miot-bridge

## 0.23.2

### Patch Changes

- [`18ea446`](https://github.com/radoslavirha/iot-miniservers/commit/18ea4466d011bf23991f4da380bcf1bb2c2a9b61) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Make MQTT recovery observable and re-subscribe explicitly on every reconnect.
  
  `MqttClientProvider` used `once('connect')`, so only the very first connection was ever logged.
  After a broker roll the last line was "reconnecting" whether the client had recovered or was
  stuck retrying, which is why restarting the app looked like the only option. It now logs each
  reconnect distinctly, with the bootstrap promise still settling exactly once — the startup-failure
  counter is keyed off a separate flag so a live-connection error can never reach `client.end(true)`
  and kill a client that is merely between reconnects.
  
  `MqttListenerService` now issues its SUBSCRIBE on every `connect` event rather than once at
  startup. mqtt.js resubscribes on its own, but that rests on two library defaults nothing here
  asserts, and the failure mode is silent: the client stays connected, passes every probe, and
  receives no commands. SUBSCRIBE is idempotent, so this costs one packet per reconnect.
  
  Also fixes the test setup, which called `$onInit()` on top of the container's own call and so
  registered two `message` handlers — every command was being executed twice under test.

## 0.23.1

### Patch Changes

- Updated dependencies [[`ebe9612`](https://github.com/radoslavirha/iot-miniservers/commit/ebe9612aa7fe3263efb91f8488171aab4be7263b)]:
  - @radoslavirha/miot-device@0.7.0

## 0.23.0

### Minor Changes

- [`ea18069`](https://github.com/radoslavirha/iot-miniservers/commit/ea18069886553c2d3a21caf97662138b23645b08) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix model names and trace errors

## 0.22.6

### Patch Changes

- [`e1178c2`](https://github.com/radoslavirha/iot-miniservers/commit/e1178c221f404f28fdd956fb3cd61b009c65fd25) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Swagger enum update to lowercase

## 0.22.5

### Patch Changes

- [`8046bc5`](https://github.com/radoslavirha/iot-miniservers/commit/8046bc5e20911838609caef053f1a5d209c3cd82) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update dependencies
- Updated dependencies [[`8046bc5`](https://github.com/radoslavirha/iot-miniservers/commit/8046bc5e20911838609caef053f1a5d209c3cd82)]:
  - @radoslavirha/miot-device@0.6.2
  - @radoslavirha/otel@0.6.2
  - @radoslavirha/tsed-health@0.2.1
  - @radoslavirha/tsed-http-provider@0.2.4

## 0.22.4

### Patch Changes

- [#75](https://github.com/radoslavirha/iot-miniservers/pull/75) [`67cf7d6`](https://github.com/radoslavirha/iot-miniservers/commit/67cf7d6d1ad6d99c8afcfe42ef4101190d7e3276) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Rebuild and redeploy after the changesets v3 upgrade skipped three release cycles

## 0.22.3

### Patch Changes

- [`3d969d2`](https://github.com/radoslavirha/iot-miniservers/commit/3d969d2d51fa57ff9ac117e7520e836c698b94cf) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix changeset release

## 0.22.2

### Patch Changes

- [`ec7c551`](https://github.com/radoslavirha/iot-miniservers/commit/ec7c55100731d2ea1790b5f7785ea4f0b8f5efcc) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix changeset releases

## 0.22.1

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
  - @radoslavirha/miot-device@0.6.1
  - @radoslavirha/otel@0.6.1
  - @radoslavirha/tsed-http-provider@0.2.3

## 0.22.0

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

### Patch Changes

- [`55f6775`](https://github.com/radoslavirha/iot-miniservers/commit/55f6775ffe2760a78e86d72d7cd322ab67935dd6) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Emit `miot.*` identifier attributes as strings, not integers.

  A Grafana 13.0.1 table panel running a Tempo TraceQL query with `select(span.miot.device.id, …)`
  crashed outright:

  ```
  TypeError: Cannot read properties of undefined (reading '0')
    at eval (eval at Mo (utils.ts:821), <anonymous>)   ← the new Function()-compiled row accessor
    at hooks.ts:301 / useMemo / hooks.ts:288
    at ql (TableNG.tsx:217)
  ```

  Bisected against live data one attribute at a time at a fixed window: `select(span.http.request.method,
span.url.path)` (strings, present on every matched span) renders; `select(span.miot.command,
span.http.response.status_code)` (absent from every matched span) renders; `select(span.miot.device.id)`
  (int, present on **some** matched spans) crashes. Tempo exports the attribute as `intValue` on the
  `poll device` span and not on the sibling mongoose spans, Grafana builds a sparse numeric column in
  the nested sub-frame, and the compiled row accessor dereferences the hole. The two string attributes
  above are equally sparse and are fine.

  String is also the more correct choice independently of the Grafana bug. `miot.device.id` is an
  **identifier**, not a measurement: nothing sums, averages or ranges over it, so the integer it
  happens to be carries no arithmetic meaning worth keeping — and OTel models identifiers as strings
  even when the underlying value is numeric (`service.instance.id`, `messaging.message.id`,
  `k8s.pod.uid`). It removes a TraceQL trap too, since an int attribute has to be filtered unquoted
  (`span.miot.device.id = 1141132187`) and quoting it by habit silently matches nothing.

  Now a **repo-local rule**, written down because no semantic convention covers `miot.*` and the
  failure mode is invisible until a dashboard happens to `select()` the attribute:

  > **Identifier attributes are strings, quantity attributes are numbers.**

  - **Strings, via the new `identifierAttribute()` in `src/otel/telemetry.ts`:** `miot.device.id`
    (every call site — the miot CLIENT span, the UDP and MQTT consumer spans, the notification
    publish span, the poll device span), `miot.device.storage_id` (already a string; routed through
    the helper so a future change of storage id type cannot slip a number onto a span), and
    `miot.siid` / `miot.piid` / `miot.aiid`.
  - **Unchanged, because they are quantities:** `miot.property.count`, `miot.poll.device.count`,
    `miot.poll.failing.count`, `miot.poll.interval_ms`, `miot.poll.subscription.count`, plus the
    semconv attributes beside them — `server.port`, `network.peer.port`, `network.local.port`,
    `messaging.message.body.size`, `messaging.mqtt.qos`. Those are aggregated, and semconv _requires_
    integers for several; stringifying them would break both the panel maths and the convention.

  `siid`/`piid`/`aiid` are identifiers rather than indices despite looking like small ordinals: they
  are the coordinates a call is addressed to — `siid=2,piid=1` is "the vacuum service's status
  property" — and `siid + 1` names an unrelated service rather than the next one. They also have the
  same sparse shape as the device id, appearing only on the `miot *` client spans, so leaving them
  numeric would have left the identical crash armed on a different column.

  `identifierAttribute()` is a helper rather than a bare `String()` at each call site because a miot
  handshake is the call that _asks_ for the device id, so the value is `undefined` there;
  `String(undefined)` would put the literal `"undefined"` on that span. `undefined` in, `undefined`
  out — an absent attribute stays absent.

  **Metric attributes are untouched.** The `job.*` instruments deliberately carry no device id, and
  `runJob` still never copies span attributes onto a metric.

  Tests assert the string form at every call site and a new one pins the _type_ rather than the
  value, so a call site that drops `identifierAttribute()` fails in CI instead of at the next
  dashboard load.

- Updated dependencies [[`55f6775`](https://github.com/radoslavirha/iot-miniservers/commit/55f6775ffe2760a78e86d72d7cd322ab67935dd6)]:
  - @radoslavirha/miot-device@0.6.0

## 0.21.0

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

### Patch Changes

- Updated dependencies [[`fe19ecb`](https://github.com/radoslavirha/iot-miniservers/commit/fe19ecb0468ec0e5a93379a4b988e573b88c3df2)]:
  - @radoslavirha/otel@0.6.0
  - @radoslavirha/miot-device@0.5.0

## 0.20.0

### Minor Changes

- [`b3c30db`](https://github.com/radoslavirha/iot-miniservers/commit/b3c30db5964b8a55e912c6442dcf47ddd3a1e1ee) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Trace MQTT publishes and inbound commands.

  MQTT was invisible in Tempo. The `message` handler ran in a root context, so the miot cloud
  call a command triggered became an orphan trace with nothing tying it to the command; the
  response and notification publishes produced no spans at all. There is no MQTT
  instrumentation in `opentelemetry-js-contrib` to register, and the only community package
  (`aedes-otel-instrumentation`) targets the Aedes broker rather than an MQTT.js client.

  `@radoslavirha/otel` gains `withMqttPublishSpan` / `withMqttConsumeSpan`, which raise
  PRODUCER and CONSUMER spans with the messaging semantic-convention attributes and carry W3C
  trace context over MQTT 5 user properties. They are transport-typed but library-agnostic —
  the carrier is a plain string map, so the package takes no dependency on `mqtt`.

  `miot-bridge-api` wires them into its three MQTT call sites via a new `MqttTracingService`,
  and the client now connects with `protocolVersion: 5` so user properties are available to
  carry the header. Span names come from new `…TopicTemplate` methods on `MqttTopicService`
  rather than the concrete topic, which embeds a device id and would otherwise give Tempo one
  span name per device.

  Also fixes `MqttTopicService` building every topic with a leading slash when no
  `mqtt.topicPrefix` was configured, which disagreed with the unslashed form
  `extractDeviceIdFromCommandTopic` matches against and dropped every inbound command. Latent
  in production, where a prefix is always set.

### Patch Changes

- Updated dependencies [[`b3c30db`](https://github.com/radoslavirha/iot-miniservers/commit/b3c30db5964b8a55e912c6442dcf47ddd3a1e1ee)]:
  - @radoslavirha/otel@0.5.0

## 0.19.4

### Patch Changes

- [`6c82bdb`](https://github.com/radoslavirha/iot-miniservers/commit/6c82bdb4db625aaec873d51b4343d23b508e84bb) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix root documentation page

## 0.19.3

### Patch Changes

- Updated dependencies [[`d1d7337`](https://github.com/radoslavirha/iot-miniservers/commit/d1d73375fdbfe1a4df0407c63a6ba910944e3c4e)]:
  - @radoslavirha/tsed-http-provider@0.2.2

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
