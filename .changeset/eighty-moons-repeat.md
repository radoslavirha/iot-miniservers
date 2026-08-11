---
"qr-manager-api": minor
---

Add Kubernetes health endpoints: `/health/live`, `/health/ready` and `/health`.

`/health/live` is shallow by design — it performs no I/O and stays 200 while MongoDB is
down, so a database blip can never restart every replica at once. `/health/ready` reports
503 when the Mongo connection is not established, which removes the pod from the Service's
Endpoints without restarting it. Mongo disabled by configuration reports `pass`, so a
deployment that runs without it is not left permanently NotReady.

SIGTERM now drains before shutting down: readiness starts failing immediately, in-flight
requests are given time to finish, and `platform.stop()` is awaited. Previously it was
neither awaited nor guarded against a second signal, and `beforeExit` could trigger a
shutdown that was never requested.
