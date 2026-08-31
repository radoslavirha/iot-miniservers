---
"miot-bridge-api": patch
---

Make MQTT recovery observable and re-subscribe explicitly on every reconnect.

`MqttClientProvider` used `once('connect')`, so only the very first connection was ever logged.
After a broker roll the last line was "reconnecting" whether the client had recovered or was
stuck retrying, which is why restarting the app looked like the only option. It now logs each
reconnect distinctly, with the bootstrap promise still settling exactly once — the startup-failure
counter is keyed off a separate flag so a live-connection error can never reach `client.end(true)`
and kill a client that is merely between reconnects.

`MqttListenerService` now issues its SUBSCRIBE on every `connect` event rather than once at
startup. mqtt.js resubscribes on its own, but that rests on two library defaults nothing here
asserts, and the failure mode is silent: the client stays connected, passes every probe, and
receives no commands. SUBSCRIBE is idempotent, so this costs one packet per reconnect.

Also fixes the test setup, which called `$onInit()` on top of the container's own call and so
registered two `message` handlers — every command was being executed twice under test.
