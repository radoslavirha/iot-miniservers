# @radoslavirha/tsed-health

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
