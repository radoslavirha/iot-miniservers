# @radoslavirha/otel

## 0.6.0

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

## 0.5.0

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

## 0.4.0

### Minor Changes

- [#61](https://github.com/radoslavirha/iot-miniservers/pull/61) [`9bec12c`](https://github.com/radoslavirha/iot-miniservers/commit/9bec12c6b3fc8cdb9cc910c155647ef0d48862d3) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Flush and stop the OTEL SDK on termination.

  `init()` discarded the `NodeSDK` handle, so nothing could ever shut it down. Batched
  telemetry was dropped when the process exited — up to 5s of spans, 1s of logs and, on the
  60s default export interval, a full minute of metrics, every rollout and restart. It was
  silent: the metric reader `unref()`s its interval, so nothing held the loop open and
  nothing logged the loss.

  - `OpenTelemetryService.shutdown()` flushes and stops, time-boxed to
    `DEFAULT_OTEL_SHUTDOWN_MS` (3s) because the OTLP exporters retry against an unreachable
    collector and would otherwise spend the pod's whole grace period.
  - New `openTelemetry` export — the process-wide instance. `instrument.js` and `index.js`
    are separate `--import` entry graphs, and the shared instance is what lets teardown reach
    an SDK started before the app entrypoint ran.
  - **Breaking:** `OtelBootstrapOptions` moves from the constructor to `init(options)`.
    Replace `new OpenTelemetryService(options).init()` with `openTelemetry.init(options)`.
  - `init()` is now idempotent per instance.

## 0.3.2

### Patch Changes

- [`4a34a89`](https://github.com/radoslavirha/iot-miniservers/commit/4a34a892fa02d4d44307e756a9cab77c1e68256a) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

## 0.3.1

### Patch Changes

- [`422cfcf`](https://github.com/radoslavirha/iot-miniservers/commit/422cfcf17880bbd18b824b20592cac85e007ec88) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

## 0.3.0

### Minor Changes

- [`aeff188`](https://github.com/radoslavirha/iot-miniservers/commit/aeff188f97952da65227e41d36e7fec2626f8cb2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update dependencies

- [`ccd9628`](https://github.com/radoslavirha/iot-miniservers/commit/ccd9628a9d80104c53779572a720546229720e19) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Disable host metrics

## 0.2.2

### Patch Changes

- [`8bb6799`](https://github.com/radoslavirha/iot-miniservers/commit/8bb679916e23e64df4dd97643f1494e01ef710c2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

## 0.2.1

### Patch Changes

- [`6a21d27`](https://github.com/radoslavirha/iot-miniservers/commit/6a21d27ec7dae43558bb78e832e0c92dcfc3c2cc) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Test deploy

## 0.2.0

### Minor Changes

- [`e77d857`](https://github.com/radoslavirha/iot-miniservers/commit/e77d8576a2b70d8f06fd357c74fe436fc4676b74) Thanks [@radoslavirha](https://github.com/radoslavirha)! - test relase
