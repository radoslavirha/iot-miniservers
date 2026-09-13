# @radoslavirha/tsed-health

## 0.3.0

### Minor Changes

- [`d402b87`](https://github.com/radoslavirha/iot-miniservers/commit/d402b871c7d2f4096dc333b1a7c5e389e96778d8) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Bound the shutdown sequence with an optional hard deadline
  
  `createShutdownHandler` gains `hardDeadlineMs` and `onHardDeadline`. Nothing previously
  bounded the drain: a connection that never closes, or a `platform.stop()` stuck on a
  dependency, burned the whole termination grace period and ended in SIGKILL — which also
  discarded the batched spans, metrics and logs the drain produced, i.e. the exact telemetry
  that would explain the hang.
  
  Off by default. The three APIs set 10s, which fits inside their chart budget of
  preStop 10s + drain 5s < terminationGracePeriodSeconds 30s, and log
  `SERVER_SHUTDOWN_TIMEOUT` with the elapsed time before exiting non-zero.

## 0.2.1

### Patch Changes

- [`8046bc5`](https://github.com/radoslavirha/iot-miniservers/commit/8046bc5e20911838609caef053f1a5d209c3cd82) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update dependencies
- Updated dependencies [[`8046bc5`](https://github.com/radoslavirha/iot-miniservers/commit/8046bc5e20911838609caef053f1a5d209c3cd82)]:
  - @radoslavirha/health@0.1.1

## 0.2.0

### Minor Changes

- [#61](https://github.com/radoslavirha/iot-miniservers/pull/61) [`9bec12c`](https://github.com/radoslavirha/iot-miniservers/commit/9bec12c6b3fc8cdb9cc910c155647ef0d48862d3) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Add `onStopped` to `createShutdownHandler`, run after `platform.stop()`.

  For work that must outlive the listeners without delaying the drain — flushing telemetry,
  in practice. It sits inside the re-entry guard rather than after `shutdown()` at the call
  site: on a second signal the handler returns immediately instead of awaiting the first run,
  so a call-site `await shutdown(); await flush();` would flush while the first shutdown is
  still draining. kubelet sending more than one signal is routine.

  Whatever runs here spends the pod's remaining termination budget, so it should be
  time-boxed: `preStop + drainDelayMs + teardown + onStopped` must fit inside
  `terminationGracePeriodSeconds`.
