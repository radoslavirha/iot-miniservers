---
name: instrument-entry-point
description: Instrument anything that starts work in an app — a poller, cron, timer, socket listener, queue consumer, startup task — with a root span and, when it is scheduled work, the reusable `job.*` metrics. Also covers outbound calls to a device or API. Use when adding a background job, a protocol listener, a `setInterval`/`setTimeout` loop, a Ts.ED `$onInit` task, or when spans show up in Tempo as parentless single-span traces, or when log lines have no `trace_id`, or when you need to answer "is this job healthy" without opening Tempo.
---

# Instrument an Entry Point

Every unit of work in these apps starts at an **entry point**. Two separate obligations:

1. **Every entry point gets a root span.** Without one, each auto-instrumented call underneath
   (Mongo, HTTP) starts a **parentless trace of its own** — a 5s poller produced ~7,500 per 6
   hours and made Tempo search unusable — and every log line written underneath has **no
   `trace_id`**, because `WinstonInstrumentation` reads it off the active span. A log with no trace
   context is a missing span, never a logging bug.
2. **Scheduled work also gets metrics.** Spans answer *what happened in this one run*. For a cron
   that is the less useful question.

## Why scheduled work is a metrics problem first

A cron is deterministic: same thing, same inputs, every tick. Correlating a log line to one exact
iteration buys almost nothing, because a fault that recurs every tick shows up in any of them. The
question that matters — *is this job running, how long does it take, is it failing* — must be
answerable at a glance, always-on, by someone who never opens Tempo.

So: **traces are head-sampled, metrics are not.** `runJob` emits both from one call and a
sampled-out run still records its duration and outcome. Never reach for a metric API directly in a
job; you will get the sampling coupling wrong.

## What already has one

| Entry point | Span from | Job metrics? |
| --- | --- | --- |
| Inbound HTTP | `HttpInstrumentation` + `ExpressInstrumentation` | No — `http.server.request.duration` already |
| Inbound / outbound MQTT | `withMqttConsumeSpan` / `withMqttPublishSpan` | No — see "not a job" below |
| Mongo queries | `MongooseInstrumentation` | No — but it needs a parent |
| Inbound UDP datagram | `withEntryPointSpan`, CONSUMER kind | **No** — request traffic, not a job |
| **Timers, pollers, crons, startup tasks** | `runJob` | **Yes** |
| **miot device calls** | `withMiotCallSpan` | **Yes** — `miot.*`, see below |
| **Other outbound calls over an uninstrumented protocol** (raw `dgram`, `fetch`) | `withClientSpan` | No |

### What is not a job

A job is work **this process schedules for itself**. Inbound request traffic is not, however it
arrives. The UDP command listener is deliberately excluded: it is Loxone asking this service to do
something, its rate is set by a client rather than a schedule, and filing it under `job.*` would
wreck every "is my cron running" panel that reads a run rate off these instruments. If it ever
needs a metric, the honest shape is a consumer / `messaging.*` duration.

## The helpers

All from `@radoslavirha/otel`.

```ts
import { runJob, recordJobSkip, withEntryPointSpan, withClientSpan, recordSpanError } from '@radoslavirha/otel';

// scheduled work → span AND metrics, one call
await runJob(
    {
        name: JOB_POLL_DEVICE_PROPERTIES,     // job.name — bounded, static, snake_case
        tracer: POLLER_TRACER_NAME,
        spanName: SPAN_POLL_TICK,             // optional; defaults to `name`
        attributes: { … },                    // span only — never reaches a metric
        suppressTrace: !this.shouldTrace()    // trace sampling; metrics record regardless
    },
    async ({ span, recordItem }) => {
        for (const device of due) recordItem(await this.poll(device));
    }
);

// a run that did not happen — no duration to record, so it cannot live in the histogram
recordJobSkip({ name: JOB_POLL_DEVICE_PROPERTIES, reason: 'nothing_due' });

// an entry point that is NOT a job (inbound datagram, queue message) → span only
await withEntryPointSpan({ name: SPAN_UDP_COMMAND, tracer: UDP_TRACER_NAME, kind: SpanKind.CONSUMER }, (span) => …);

// outbound call to a socket / API → nested, never a root
await withClientSpan({ name: SPAN_SOMETHING, tracer: SOME_TRACER_NAME }, () => …);

// a miot device call → CLIENT span AND `miot.client.call.duration`, one call
await withMiotCallSpan({ method: MIOT_METHOD_GET_PROPERTIES, device, propertySource }, () => …);
```

`runJob` and `withEntryPointSpan` both force `root: true` unless you pass a `parent`. That is the
point of using them rather than `withSpan`: a `setTimeout` callback inherits the context that
scheduled it, so a loop which reschedules itself from inside its own span chains every future tick
onto the first one and grows one unbounded trace.

## The metric set

Three instruments, and three is the whole set. `job.*` is a **repo-local namespace** — see below.

| Metric | Instrument | Unit | Attributes |
| --- | --- | --- | --- |
| `job.run.duration` | Histogram | `s` | `job.name`, `job.run.outcome` = `success` \| `failure` |
| `job.run.skips` | Counter | `{skip}` | `job.name`, `job.skip.reason` = `nothing_due` \| `overrun` |
| `job.run.items` | Counter | `{item}` | `job.name`, `job.item.outcome` = `success` \| `failure` |

- **No separate executions counter.** A histogram's `count` series already gives the run rate and
  the `job.run.outcome` split gives the failure rate. A second instrument would be the same
  information twice, free to drift apart.
- **`job.run.items` is not optional decoration.** A job that catches per-item faults and keeps
  going — the normal shape for a poller — reports `success` for every run it ever makes. Run
  outcome alone would call the job healthy with every device dead. If your job simply throws on the
  first fault, skip it; the run outcome already says so.
- **`job.run.skips` is what separates "idle" from "dead".** When every item is in back-off the
  duration histogram stops moving entirely, and only this counter still ticks over.

### Rules these follow

- Hierarchical `{area}.{metric_name}`, shaped after `cicd.pipeline.run.duration`.
- **Units live in instrument metadata, never in the name.** No `_seconds`, no `_total`.
- Durations in **seconds**, per semconv.
- Counter names are plural nouns with a `{curly}` non-unit, matching `faas.timeouts` /
  `cicd.pipeline.run.errors`.
- **Aggregation over all attributes must be meaningful.** It is, for all three: dropping
  `job.run.outcome` gives total runs and their overall latency; dropping `job.name` gives all
  background work in the service, the same way `http.server.request.duration` aggregates across
  routes. This is also why the startup subscription load records *no* items — its "items" are an
  inventory snapshot, and summing an inventory into a throughput counter would make
  `job.run.items` mean two different things depending on which series you look at.
- **Bucket boundaries are set explicitly** (`JOB_RUN_DURATION_BUCKETS`, 10ms–5min). The SDK default
  is built for milliseconds and tops out at 10000; against sub-second jobs every quantile reads 0.

### Cardinality

`job.name` **must be a bounded, static set** — one value per job, chosen at author time, declared
as a constant in `src/otel/telemetry.ts`. Never a device id, topic, tenant or anything derived from
data: each value is a permanent Prometheus series on all three instruments. `runJob` deliberately
does not copy span `attributes` onto metrics, so a call site cannot do this by accident.

Budget for `miot-bridge-api`: 2 jobs × 2 outcomes = 4 histogram attribute sets × (13 buckets + sum
+ count) = **60 series**, plus 2 skip and 2 item series ≈ **64 per pod**.

### Why `job.*` and not `faas.*`

OpenTelemetry has **no** convention for a generic in-process scheduled job. Both neighbours were
considered and rejected:

- **`faas.invocations` / `faas.invoke_duration`** describe a Function-as-a-Service invocation.
  Adopting them claims FaaS semantics this process does not have — the conventions require
  `faas.trigger`, `faas.name`, `faas.invoked_provider`, none of which have an honest value for a
  `setTimeout` — and would collide with real Lambda/Cloud Run data in the same Prometheus,
  corrupting both. `faas.invoke_duration` is also a name the current spec would no longer mint
  (`{operation}.duration` says `faas.invoke.duration`); it is frozen for compatibility, and a
  grandfathered shape is a poor model for a new one.
- **`cicd.pipeline.run.*`** is closest in *shape*, and the `.run.duration`-grouped-by-result idea is
  borrowed from it wholesale — but its entity is a CI pipeline with `cicd.pipeline.name` and
  `cicd.pipeline.run.id`, which an in-process timer is not.

If OpenTelemetry ever standardises one, the `.run.duration` shape means renaming, not redesigning.

## Instrumenting a miot device call

`withMiotCallSpan` from `src/otel/miotTracing.ts` is `runJob`'s counterpart for outbound device
traffic: one call emits the CLIENT span **and** the metrics. Reach for it instead of
`withClientSpan` for anything that talks miIO.

### miIO is JSON-RPC, so use the RPC conventions

`{ id, method, params }` out, `{ id, result | error }` back. Nothing here needs a `miot.error_code`.

| Attribute | Value | Notes |
| --- | --- | --- |
| `rpc.system.name` | `jsonrpc` | `rpc.system` is **deprecated** in its favour |
| `rpc.method` | `get_properties` \| `set_properties` \| `action` \| `handshake` | fully qualified; `rpc.service` is deprecated and folded in |
| `rpc.response.status_code` | the miIO code **as a string**, e.g. `"-4004"` | `rpc.jsonrpc.error_code` is deprecated in its favour |
| `error.type` | `timeout` \| `device_error` \| `transport_error` \| `rejected_locally` | stable semconv; **absent on success**, never `ok` |
| span status description | the error message | `rpc.jsonrpc.error_message` is deprecated in its favour |
| `miot.property.source` | `spec` \| `override` | single-property calls only |
| `miot.stamp.refreshed` | boolean | set when the failure survived a stamp-refresh retry |

Not emitted, deliberately: `jsonrpc.protocol.version` (a miIO packet carries no `jsonrpc` member —
asserting `"2.0"` would be a fabrication) and `jsonrpc.request.id` (minted inside `OutgoingPacket`
and never surfaced; an attribute present only on failures is worse than none). `network.transport`
is kept even though the RPC conventions dropped it, because UDP is what makes a failure ten seconds
of silence.

### The outcome taxonomy lives in `error.type`

Four members, exhaustive, and no `ok` — semconv says not to set `error.type` on success, so
`error_type=""` is the success series. `stamp_retry_exhausted` is **not** a member: every such
failure is also a timeout, a device error or a transport error, and promoting it would erase the
code on exactly the calls where it matters. Orthogonal facts get their own attribute.

### The metric set

| Metric | Instrument | Unit | Attributes |
| --- | --- | --- | --- |
| `miot.client.call.duration` | Histogram | `s` | `rpc.method`, `error.type` |
| `miot.property.rejections` | Counter | `{rejection}` | `rpc.method`, `rpc.response.status_code`, `miot.property.source` |

- **Why not `rpc.client.call.duration`.** The RPC client metric conventions make `server.address`
  **required**, and that is one LAN address per physical device — the per-device cardinality this
  repo already refuses on `job.*`. Emitting the reserved name without a required attribute is a
  non-conformant metric under a name tools assume is conformant. Same reasoning as `job.*` vs
  `faas.*`; the shape is identical, so it converges by rename if the constraint ever lifts.
- **Buckets are the semconv RPC set extended past 10s** (`MIOT_CALL_DURATION_BUCKETS`). 10s is not
  a tail here, it is `MIOT_TIMEOUT_MS` exactly, and the stamp-refresh retry doubles it.
- **`rpc.response.status_code` is on the counter, not the histogram.** Nobody asks how long a
  `-4004` took; putting ~15 codes on a 16-bucket histogram buys nothing the counter does not give
  for one series per code.
- **`miot.property.source` is on the counter only.** A bulk read mixes provenances, so a call has
  no honest single value, and an attribute present on some series and absent on others makes every
  `sum by` over it lie.
- **`rpc.method` is on both.** Four static values; reads, writes and actions have different latency
  and failure profiles, and read-vs-write refusal is the signature of an override with the wrong
  `access`.
- **Never** `miot.device.id`, `miot.siid`, `miot.piid` or `server.address` on either.

### A successful call can still be full of refusals

A bulk `get_properties` returns a per-property `code` per item. The RPC call succeeds, the span is
green, the poller's `job.run.items` says `success` — and `-4004` for three of twelve properties is
invisible. `DeviceCommandService.reportRejectedProperties` is what surfaces those: the counter, the
`miot.property.rejected` key list on the span, and one structured log line each.

### Provenance is decided in the mapper or not at all

`SimplifiedMiotSpecV2Mapper` maps the published spec first and lets overrides `set()` over it, so
an override that reuses a published key **replaces** it and the merged map keeps no record. That is
why `MiotProperty.source` is stamped at insertion: re-deriving it later from the override list gets
a replaced published property wrong.

## Scheduler shape decides which metrics are meaningful

Check which one you are writing **before** picking metrics — the two fail in completely different
ways.

| | **Self-rescheduling chain** | **Fixed rate** |
| --- | --- | --- |
| Code | `setTimeout` re-armed in a `finally`, after the work | `setInterval`, or an external scheduler |
| Concurrent runs | Impossible — one timer armed at a time | Possible |
| `job.skip.reason=overrun` | **Never emit it.** The series can only read zero | Emit it — this is the blind spot |
| Effective period | `interval + run duration`, so it silently runs **late** | `interval`, and it **skips** instead |
| Drift visible via | Run rate (below) | The overrun counter |

`DevicePropertyPollerService` is the first kind. Its `_ticking` guard is unreachable and
deliberately left uninstrumented — do not "fix" it by adding a counter there.

**Drift gets no metric of its own.** The gap between intended and actual start is undefined for a
self-rescheduling chain: interval-after-completion *is* the intent, so there is no missed deadline
to be late against. The observable the operator actually wants is the effective period, and the
existing instruments already give it — total timer fires per second is the run rate plus the skip
rate:

```promql
1 / (
  sum(rate(job_run_duration_seconds_count{job_name="poll_device_properties"}[5m]))
+ sum(rate(job_run_skips_total{job_name="poll_device_properties"}[5m]))
)
```

Compare that against the configured `intervalMs`. If you write a genuinely fixed-rate job, a
`job.run.delay` histogram becomes meaningful, because then a deadline exists — add it then, not
before.

## Checklist for a new background job or listener

1. **Wrap the whole unit of work**, reply/response included. Wrapping only the parse, or only the
   command, leaves the rest of the journey in a separate trace.
2. **Decide job or not a job** (see the table). A job gets `runJob`; inbound traffic gets
   `withEntryPointSpan`.
3. **Pick the span kind deliberately.** `INTERNAL` for a timer, `CONSUMER` for something that
   arrived from outside the process, `CLIENT` for an outbound call. `SERVER` is HTTP's.
4. **Add every name to `src/otel/telemetry.ts`**, never inline strings — span names, attribute keys
   and `job.name` values alike. They are a query contract, and a mistyped attribute key is
   invisible rather than broken.
5. **Keep span names and `job.name` low cardinality.** `poll device`, not `poll device 442`.
6. **Use semconv attribute names where one exists** (`server.address`, `network.transport`,
   `messaging.*`) and namespace app attributes under `miot.*`.
7. **Pick the attribute *type* deliberately** — identifiers are strings, quantities are numbers.
   See below; it is not cosmetic.
8. **Record handled faults.** On the span with `recordSpanError(span, …)`; in metrics with
   `recordItem('failure')`. A path that answers `error: …` instead of throwing never reaches the
   wrapper's error handling, so both would otherwise look clean.
9. **Sample the trace if it is high frequency** — see below. Never sample the metric.
10. **Assert both in a test** — see below.

## Identifier attributes are strings, quantity attributes are numbers

**This is a repo-local rule.** No semantic convention covers `miot.*`, so nothing upstream decides
it, and the failure it prevents is invisible until a dashboard happens to select the attribute.

| Kind | Type | Examples |
| --- | --- | --- |
| **Identifier** — a name for a thing | **string**, via `identifierAttribute()` | `miot.device.id`, `miot.device.storage_id`, `miot.siid`, `miot.piid`, `miot.aiid` |
| **Quantity** — a measurement of it | **number**, as-is | `miot.property.count`, `miot.poll.device.count`, `miot.poll.failing.count`, `miot.poll.interval_ms`, `miot.poll.subscription.count`, `server.port`, `network.peer.port`, `http.response.status_code` |

```ts
import { ATTR_MIOT_DEVICE_ID, identifierAttribute } from '../otel/telemetry.js';

attributes: {
    [ATTR_MIOT_DEVICE_ID]: identifierAttribute(device.deviceId),   // 1141132187 → "1141132187"
    [ATTR_MIOT_PROPERTY_COUNT]: props.length                        // stays a number
}
```

**Why a string.** `miot.device.id` is an identifier — nothing sums, averages or ranges over it, so
the integer it happens to be carries no arithmetic meaning worth keeping. OTel's own identifiers
are strings even when the underlying value is numeric: `service.instance.id`,
`messaging.message.id`, `k8s.pod.uid`. It also removes a TraceQL trap, since an int attribute must
be filtered *unquoted* (`span.miot.device.id = 1141132187`) and quoting it by habit silently
matches nothing.

**Why it broke a dashboard.** Tempo exports a numeric attribute as `intValue`. A Grafana 13 table
panel running `select(span.miot.device.id, …)` crashed outright with

```
TypeError: Cannot read properties of undefined (reading '0')
  at eval (eval at Mo (utils.ts:821))   ← the new Function()-compiled row accessor
```

The trigger is a numeric attribute present on **some** matched spans and not others: `poll device`
carries the device id, the mongoose spans beside it do not, Grafana builds a sparse numeric column
in the nested sub-frame and the compiled accessor dereferences the hole. Bisected one attribute at
a time against live data — `select(span.http.request.method, span.url.path)` (strings, equally
sparse) renders fine, `select(span.miot.device.id)` (int, sparse) dies.

**Why `siid`/`piid`/`aiid` count as identifiers**, despite looking like small ordinals: they are
the coordinates a call is addressed to — `siid=2,piid=1` is "the vacuum service's status property"
— and `siid + 1` names an unrelated service rather than the next one. They are also the same
sparse shape as the device id, present only on the `miot *` client spans, so leaving them numeric
would leave the identical crash armed on a different column.

**Quantities must stay numeric.** They are aggregated, and semconv *requires* integers for several
of them (`server.port`, `http.response.status_code`); stringifying those breaks both the panel maths
and the convention. Note this applies to **span** attributes: `job.*` metric attributes are a
separate matter and deliberately carry no device id at all — never add one, see Cardinality above.

Pin the type in a test, not just the value — `expect(typeof attributes['miot.device.id']).toBe('string')`
— so a call site that drops `identifierAttribute()` fails loudly instead of at the next dashboard load.

## Sampling a loop that never stops

A fixed-rate loop is the one case where an always-on root span is itself the problem: at a 5s
interval that is ~17k identical traces a day. Decide per invocation and pass `suppressTrace`:

```ts
await runJob({ …, suppressTrace: !this.shouldTrace(due, Date.now()) }, async () => { … });
```

- `suppressTrace` is **not** the same as skipping the wrapper. With no span and no suppression the
  Mongo and UDP calls underneath each start a trace of their own again — the exact flood you are
  removing. Under suppression the SDK hands them a non-recording span and the subtree is dropped.
- It **never touches metrics.** Duration, outcome and items are recorded for every run.
- **Do not sample on time alone.** `DevicePropertyPollerService.shouldTrace` traces at most one tick
  per `polling.traceIntervalMs`, *and* always traces a tick that polls a device already failing.
  Copy that shape: a time gate plus an "always trace the interesting one" escape.
- **Open no span when there is no work** — but still `recordJobSkip`, or an idle job is
  indistinguishable from a dead one.
- Make the rate configurable and document `0` as "trace everything".

## Verifying it

Follow `packages/otel/src/jobTelemetry.spec.ts` and
`apis/miot-bridge-api/src/services/DevicePropertyPollerService.spec.ts`. Register a real
`NodeTracerProvider` with an `InMemorySpanExporter` *and* a real `MeterProvider` with a
collect-on-demand `MetricReader` — the helpers read the **global** providers, so hand-built ones
would not prove the wiring. Then assert:

```ts
// 1. the entry point is a root
expect(spanNamed(SPAN_POLL_TICK).parentSpanContext).toBeUndefined();

// 2. work raised underneath by something that knows nothing about you lands inside it
expect(spanNamed('mongodb.find').parentSpanContext?.spanId).toBe(spanNamed(SPAN_POLL_DEVICE).spanContext().spanId);

// 3. THE one that matters: a sampled-out run emits no span and still records its metrics
await start({ traceIntervalMs: 60_000 });
await ticks(4);
expect(spansNamed(SPAN_POLL_TICK)).toHaveLength(1);
expect(await runs('success')).toBeGreaterThanOrEqual(4);
```

Use a fresh `MeterProvider` per test: cumulative counters never go back down, so a shared one leaks
every previous test's increments into the next.

## Where things live

| Thing | Path |
| --- | --- |
| Job telemetry (`runJob`, `recordJobSkip`, metric + attribute constants) | `packages/otel/src/jobTelemetry.ts` |
| Span helpers (`withSpan`, `withEntryPointSpan`, `withClientSpan`, `recordSpanError`) | `packages/otel/src/spanTracing.ts` |
| MQTT span helpers, built on the same primitive | `packages/otel/src/mqttTracing.ts` |
| SDK bootstrap, auto-instrumentation list, ignored probe paths | `packages/otel/src/OpenTelemetryService.ts` |
| Per-app SDK preload | `apis/<api>/src/otel/instrument.ts` |
| Per-app span names, tracer scopes, `job.name` values, `miot.*` attribute keys, `identifierAttribute` | `apis/<api>/src/otel/telemetry.ts` |
| miot device CLIENT span | `apis/miot-bridge-api/src/otel/miotTracing.ts` |

`packages/miot-device` deliberately has **no** OpenTelemetry dependency — it takes an injected
logger only. Instrument it from the app at the last point that still knows which device is being
addressed, which is why `withMiotCallSpan` lives in the app and not in the package.
