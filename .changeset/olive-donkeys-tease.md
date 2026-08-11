---
"interactive-map-feeder-api": minor
---

Add Kubernetes health endpoints: `/health/live`, `/health/ready` and `/health`, mounted at
the root rather than under `/v1` so the probe path matches every other app.

Readiness deliberately does **not** depend on the upstream ČHMÚ APIs. Failing readiness on
a third-party outage would remove this pod from the Service's Endpoints during an incident
nobody here can fix, turning someone else's outage into ours for no benefit. Instead the
upstreams are reported as a non-critical check: `/health` degrades to `warn` while
`/health/ready` keeps answering 200. Alert on the `warn`; do not act on it in the cluster.

The signal is passive — it reads the circuit breakers already guarding real traffic, so no
synthetic request is issued and an idle upstream cannot raise a false alarm.

SIGTERM now drains before shutting down: readiness starts failing immediately, in-flight
requests are given time to finish, and `platform.stop()` is awaited. Previously it was
neither awaited nor guarded against a second signal, and `beforeExit` could trigger a
shutdown that was never requested.
