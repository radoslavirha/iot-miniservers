---
"miot-bridge-api": minor
---

Add Kubernetes health endpoints: `/health/live`, `/health/ready` and `/health`.

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
