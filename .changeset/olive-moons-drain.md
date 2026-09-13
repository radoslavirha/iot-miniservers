---
"@radoslavirha/tsed-health": minor
"interactive-map-feeder-api": patch
"miot-bridge-api": patch
"qr-manager-api": patch
---

Bound the shutdown sequence with an optional hard deadline

`createShutdownHandler` gains `hardDeadlineMs` and `onHardDeadline`. Nothing previously
bounded the drain: a connection that never closes, or a `platform.stop()` stuck on a
dependency, burned the whole termination grace period and ended in SIGKILL — which also
discarded the batched spans, metrics and logs the drain produced, i.e. the exact telemetry
that would explain the hang.

Off by default. The three APIs set 10s, which fits inside their chart budget of
preStop 10s + drain 5s < terminationGracePeriodSeconds 30s, and log
`SERVER_SHUTDOWN_TIMEOUT` with the elapsed time before exiting non-zero.
