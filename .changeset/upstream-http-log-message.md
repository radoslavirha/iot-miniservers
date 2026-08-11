---
'@radoslavirha/tsed-http-provider': patch
---

Name outbound log lines `Upstream HTTP request completed` / `Upstream HTTP request failed`.

Outbound calls used the same `Request completed` / `Request failed` messages as the
inbound entries from `@radoslavirha/tsed-logger`, so in Grafana the two directions were
indistinguishable unless the query also filtered on `scope`.

The message now carries the direction and the transport, which also leaves room for a
future non-HTTP client (gRPC, MQTT) to get its own message instead of overloading this one.
