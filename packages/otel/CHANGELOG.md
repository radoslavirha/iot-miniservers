# @radoslavirha/otel

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
