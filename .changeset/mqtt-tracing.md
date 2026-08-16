---
'@radoslavirha/otel': minor
'miot-bridge-api': minor
---

Trace MQTT publishes and inbound commands.

MQTT was invisible in Tempo. The `message` handler ran in a root context, so the miot cloud
call a command triggered became an orphan trace with nothing tying it to the command; the
response and notification publishes produced no spans at all. There is no MQTT
instrumentation in `opentelemetry-js-contrib` to register, and the only community package
(`aedes-otel-instrumentation`) targets the Aedes broker rather than an MQTT.js client.

`@radoslavirha/otel` gains `withMqttPublishSpan` / `withMqttConsumeSpan`, which raise
PRODUCER and CONSUMER spans with the messaging semantic-convention attributes and carry W3C
trace context over MQTT 5 user properties. They are transport-typed but library-agnostic —
the carrier is a plain string map, so the package takes no dependency on `mqtt`.

`miot-bridge-api` wires them into its three MQTT call sites via a new `MqttTracingService`,
and the client now connects with `protocolVersion: 5` so user properties are available to
carry the header. Span names come from new `…TopicTemplate` methods on `MqttTopicService`
rather than the concrete topic, which embeds a device id and would otherwise give Tempo one
span name per device.

Also fixes `MqttTopicService` building every topic with a leading slash when no
`mqtt.topicPrefix` was configured, which disagreed with the unslashed form
`extractDeviceIdFromCommandTopic` matches against and dropped every inbound command. Latent
in production, where a prefix is always set.
