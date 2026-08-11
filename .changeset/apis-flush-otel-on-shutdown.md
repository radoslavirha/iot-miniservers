---
'interactive-map-feeder-api': patch
'miot-bridge-api': patch
'qr-manager-api': patch
---

Flush OTEL on shutdown.

`onStopped: () => openTelemetry.shutdown()` runs after the platform stops, so the drain's
spans, logs and metrics reach the collector instead of dying with the process. The
`uncaughtException` / `unhandledRejection` path flushes too — the crash's own telemetry is
the trace most worth having and the one that was always lost.
