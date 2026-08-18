---
'@radoslavirha/otel': minor
'@radoslavirha/miot-device': minor
'miot-bridge-api': minor
'interactive-map-feeder-api': patch
'qr-manager-api': patch
---

Give every non-HTTP entry point a root span, trace the miot device call, and give scheduled work a
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
caller, and not the same as skipping the wrapper, since with no span *and* no suppression the
calls underneath start orphan traces again.

## Metrics for scheduled work

Spans answer *what happened in this one run*, which for a cron is the less useful question: a cron
is deterministic, so a fault that recurs every tick shows up in any of them. What an operator needs
is *is this job running, how long does it take, is it failing*, always-on, without opening Tempo.

`packages/otel` gains `runJob`, which emits the entry-point span **and** three metrics from one
call, so the next cron gets both signals without its author thinking about either — and crucially,
**a run sampled out of tracing still records its metrics**. Traces are sampled; metrics are not.
If the two were wired separately, the sampling rate would silently become the run rate.

| Metric | Instrument | Unit | Attributes |
| --- | --- | --- | --- |
| `job.run.duration` | Histogram | `s` | `job.name`, `job.run.outcome` |
| `job.run.skips` | Counter | `{skip}` | `job.name`, `job.skip.reason` |
| `job.run.items` | Counter | `{item}` | `job.name`, `job.item.outcome` |

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
  caught per device and turned into back-off, so the *run* always succeeds, and run outcome alone
  would report a perfectly healthy job with every device dead. A tick with nothing due counts a
  `nothing_due` skip, the only thing separating an idle poller from a dead one once every device is
  in back-off. The startup subscription load is a job too, so a slow or throwing load is visible as
  the reason a live-looking poller polls nothing.
- **No `overrun` skip is emitted, and that is deliberate.** `scheduleNext` re-arms a `setTimeout`
  in `tick`'s `finally`, after the awaited work, so exactly one timer is ever armed and the
  `_ticking` guard is unreachable; counting it would create a series that can only read zero. The
  real consequence of that scheduler shape is that a slow tick makes the job run *late* rather than
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
