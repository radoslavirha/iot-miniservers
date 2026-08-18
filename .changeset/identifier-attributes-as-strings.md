---
'miot-bridge-api': patch
---

Emit `miot.*` identifier attributes as strings, not integers.

A Grafana 13.0.1 table panel running a Tempo TraceQL query with `select(span.miot.device.id, …)`
crashed outright:

```
TypeError: Cannot read properties of undefined (reading '0')
  at eval (eval at Mo (utils.ts:821), <anonymous>)   ← the new Function()-compiled row accessor
  at hooks.ts:301 / useMemo / hooks.ts:288
  at ql (TableNG.tsx:217)
```

Bisected against live data one attribute at a time at a fixed window: `select(span.http.request.method,
span.url.path)` (strings, present on every matched span) renders; `select(span.miot.command,
span.http.response.status_code)` (absent from every matched span) renders; `select(span.miot.device.id)`
(int, present on **some** matched spans) crashes. Tempo exports the attribute as `intValue` on the
`poll device` span and not on the sibling mongoose spans, Grafana builds a sparse numeric column in
the nested sub-frame, and the compiled row accessor dereferences the hole. The two string attributes
above are equally sparse and are fine.

String is also the more correct choice independently of the Grafana bug. `miot.device.id` is an
**identifier**, not a measurement: nothing sums, averages or ranges over it, so the integer it
happens to be carries no arithmetic meaning worth keeping — and OTel models identifiers as strings
even when the underlying value is numeric (`service.instance.id`, `messaging.message.id`,
`k8s.pod.uid`). It removes a TraceQL trap too, since an int attribute has to be filtered unquoted
(`span.miot.device.id = 1141132187`) and quoting it by habit silently matches nothing.

Now a **repo-local rule**, written down because no semantic convention covers `miot.*` and the
failure mode is invisible until a dashboard happens to `select()` the attribute:

> **Identifier attributes are strings, quantity attributes are numbers.**

- **Strings, via the new `identifierAttribute()` in `src/otel/telemetry.ts`:** `miot.device.id`
  (every call site — the miot CLIENT span, the UDP and MQTT consumer spans, the notification
  publish span, the poll device span), `miot.device.storage_id` (already a string; routed through
  the helper so a future change of storage id type cannot slip a number onto a span), and
  `miot.siid` / `miot.piid` / `miot.aiid`.
- **Unchanged, because they are quantities:** `miot.property.count`, `miot.poll.device.count`,
  `miot.poll.failing.count`, `miot.poll.interval_ms`, `miot.poll.subscription.count`, plus the
  semconv attributes beside them — `server.port`, `network.peer.port`, `network.local.port`,
  `messaging.message.body.size`, `messaging.mqtt.qos`. Those are aggregated, and semconv *requires*
  integers for several; stringifying them would break both the panel maths and the convention.

`siid`/`piid`/`aiid` are identifiers rather than indices despite looking like small ordinals: they
are the coordinates a call is addressed to — `siid=2,piid=1` is "the vacuum service's status
property" — and `siid + 1` names an unrelated service rather than the next one. They also have the
same sparse shape as the device id, appearing only on the `miot *` client spans, so leaving them
numeric would have left the identical crash armed on a different column.

`identifierAttribute()` is a helper rather than a bare `String()` at each call site because a miot
handshake is the call that *asks* for the device id, so the value is `undefined` there;
`String(undefined)` would put the literal `"undefined"` on that span. `undefined` in, `undefined`
out — an absent attribute stays absent.

**Metric attributes are untouched.** The `job.*` instruments deliberately carry no device id, and
`runJob` still never copies span attributes onto a metric.

Tests assert the string form at every call site and a new one pins the *type* rather than the
value, so a call site that drops `identifierAttribute()` fails in CI instead of at the next
dashboard load.
