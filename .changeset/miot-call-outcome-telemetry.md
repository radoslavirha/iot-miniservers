---
'@radoslavirha/miot-device': minor
'miot-bridge-api': minor
---

Surface *why* a miIO call failed, and whose spec entry the device refused.

## The gap

`miot-bridge-api` builds a miIO request from the device spec and sends it over UDP. When that came
back refused, none of the reason survived the trip. miIO is JSON-RPC shaped — a rejection is a real
response carrying `error: { code, message }` — and `MiotTransport` flattened it into
`new Error('Device error -4004: ...')`, after which `MiotDevice.runWithFreshStamp` re-wrapped it a
second time into `new Error('Operation failed after stamp refresh for device 1141132187: <that
message>')`. By the time `DeviceCommandService` caught it, the only machine-readable content was a
substring. Instrumentation on top of that can say "the call failed" and nothing else.

Worse, the case that matters most was not an error at all. A bulk `get_properties` returns a
per-property `code` per result item, so a read of twelve properties where the device refuses three
is a **successful** RPC call: green span, `job.run.items` = `success`, and
`DevicePropertyPollerService` simply `continue`d past every non-zero code. That is the shape every
refusal takes on the polling path, which is the dominant caller.

## The device is a blackbox and the published spec is incomplete

`model-property-overrides` holds entries that are *not* in the published spec but that the device is
believed to know. So a refusal means one of three things — the override is wrong, the published spec
is wrong, or the device genuinely does not implement it — and nothing recorded which.

`SimplifiedMiotSpecV2Mapper` is the only place that can tell: it maps the published spec first and
lets overrides `set()` over it, so an override reusing a published key **replaces** it and the
merged map keeps no record of who won. `MiotProperty.source` is now stamped there, at insertion, and
rides through to telemetry as `miot.property.source` = `spec` | `override`.

## `@radoslavirha/miot-device`

New `MiotError`, carrying `kind`, `method`, `code` and `stampRefreshed`. Still no OpenTelemetry
dependency — it is plain data the app maps onto attributes.

- `kind` is `timeout` (silence), `device_error` (the device answered and refused) or
  `transport_error` (socket fault, failed send, empty or undecryptable response).
- `code` is the miIO status code from *either* wire position: `error.code` of the envelope, or the
  `code` of a result item. Both are the device saying "no, and here is why".
- `MiotError.afterStampRefresh` replaces the `new Error(...)` in `runWithFreshStamp`, so the
  classification survives the retry. Messages are unchanged.
- `runWithStamp` retries **every** failure behind a fresh handshake, including a `device_error` that
  can never succeed twice — a refused property costs a handshake plus a second round trip.
  Behaviour is unchanged here, but the failure now says so via `stampRefreshed`.

## Traces

`withMiotCallSpan` now emits the span *and* the metrics from one call, the same pairing as `runJob`.
miIO is JSON-RPC over UDP, so the RPC conventions apply as they are — no `miot.error_code` was
invented:

| Attribute | Value |
| --- | --- |
| `rpc.system.name` | `jsonrpc` (`rpc.system` is deprecated) |
| `rpc.method` | `get_properties` / `set_properties` / `action` / `handshake` (`rpc.service` is deprecated, folded in) |
| `rpc.response.status_code` | the miIO code **as a string** (`rpc.jsonrpc.error_code` is deprecated) |
| `error.type` | `timeout` / `device_error` / `transport_error` / `rejected_locally` / `_OTHER` |
| span status description | the error message (`rpc.jsonrpc.error_message` is deprecated) |
| `miot.property.source` | `spec` / `override`, on single-property calls |
| `miot.stamp.refreshed` | set when the failure survived a stamp-refresh retry |
| `miot.property.rejected` / `.count` | which keys of a bulk read were refused |

`error.type` is where the outcome taxonomy lives rather than a `miot.call.outcome` of our own: it is
stable semconv, it is what RPC metrics require on failure, and it is contractually low cardinality.
Success sets no `error.type`, per semconv — `error_type=""` is the success series.
`stamp_retry_exhausted` is deliberately **not** a member, because every such failure is also a
timeout, a device error or a transport error, and promoting it would erase the code on exactly the
calls where it matters.

Anything that is not a `MiotError` gets semconv's own `_OTHER` rather than a guess. A Mongo fault or
a programming error surfacing on this path is not a device fault, and folding it into
`transport_error` would put our bugs in the device's column.

`jsonrpc.protocol.version` is not emitted: it is defined as the value of the request's `jsonrpc`
member and a miIO packet has none — the payload is JSON-RPC 1.0-shaped, and asserting `"2.0"` would
be a fabrication. `jsonrpc.request.id` is not emitted either; it is a UNIX timestamp minted inside
`OutgoingPacket` and never surfaced. `network.transport` stays even though the RPC conventions
dropped it, because UDP is what makes a failure ten seconds of silence.

Note `rpc.response.status_code` being a string also sidesteps the Grafana TableNG crash that sparse
*numeric* span attributes cause — the same reason identifiers became strings.

## Metrics

| Metric | Instrument | Unit | Attributes |
| --- | --- | --- | --- |
| `miot.client.call.duration` | Histogram | `s` | `rpc.method`, `error.type` |
| `miot.property.rejections` | Counter | `{rejection}` | `rpc.method`, `rpc.response.status_code`, `miot.property.source` |

- **Not `rpc.client.call.duration`**, deliberately. The RPC client metric conventions make
  `server.address` **required**, and that is one LAN address per physical device — the per-device
  cardinality this repo already refuses on `job.*`. Emitting the reserved name without a required
  attribute produces a non-conformant metric under a name tools assume is conformant. Same reasoning
  that made the job namespace `job.*` and not `faas.*`; the shape is identical, so it converges by
  rename if the constraint ever lifts.
- Buckets are the semconv-recommended RPC set extended past 10s, because 10s is not a tail here — it
  is `MIOT_TIMEOUT_MS` exactly, and the stamp-refresh retry doubles it.
- `rpc.response.status_code` is on the counter and **not** the histogram: nobody asks how long a
  `-4004` took, and ~15 codes across 16 buckets buys nothing the counter gives for one series each.
- `miot.property.source` is on the counter only. A bulk read mixes provenances, so a call has no
  honest single value, and an attribute present on some series and absent on others makes every
  `sum by` over it lie.
- `rpc.method` is on both. Read-versus-write refusal is the signature of an override with the wrong
  `access`.
- Never `miot.device.id`, `miot.siid`, `miot.piid` or `server.address` on either.

`rejected_locally` is recorded from `DeviceCommandService`, which raises no span for it on purpose —
a client span for a call that never left the process would be a lie. The metric is therefore the
only always-on evidence that Loxone is asking for a key in neither the spec nor the overrides, which
is the mirror image of a device refusal.

A property the device omits from a bulk read response entirely is recorded as
`rpc.response.status_code="_MISSING"`. The `-1` filler is ours, not the device's, and putting it on
the attribute would invent a miIO code and sort in among the real ones.

## Logs

Device faults keep their readable message and gain structured fields — `errorType`, `statusCode`,
`stampRefreshed`, `consecutiveErrors` — so Loki filters on them instead of regexing prose. Each
refused property in a bulk read gets its own `warn` carrying the key, siid/piid, provenance and
code. Both sites run inside an active span, so `WinstonInstrumentation` stamps `trace_id` for free.

## Answering the question

```traceql
{ span.miot.device.id = "1141132187" && span.rpc.response.status_code != "" }
| select(span.miot.command, span.rpc.response.status_code, span.miot.property.source)
```

```promql
sum by (rpc_response_status_code, miot_property_source) (
  rate(miot_property_rejections_total[1h])
)
```
