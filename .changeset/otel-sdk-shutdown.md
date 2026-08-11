---
'@radoslavirha/otel': minor
---

Flush and stop the OTEL SDK on termination.

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
