---
"miot-bridge-api": minor
---

Require a verified caller on every REST route, and delete the UDP listener.

**Breaking, in the sense that matters here:** the UDP command listener and the UDP notification
transport are gone. `homelab` had already stopped exposing them — no `udpIngress`, no Service, no
container UDP port, on the owner's word that they were never used — so this was a dead socket the
application still opened, and deleting it closes the path for good rather than leaving it shut by a
values file. The MIoT binary UDP client out to the Xiaomi devices is untouched; that is a client, not
a listener, and it is the only UDP this service still speaks.

All 16 REST routes now carry `@Authenticate(AuthMethod.Idp)`. No per-route ranking: separating "read
the device registry" from "actuate a device" is authorization, and it waits for scopes rather than
being approximated with two trust domains that verify identically.

**The guard reaches HTTP only.** Commands also arrive on an MQTT subscription that never passes a
controller — that identity belongs to the broker, and EMQX topic ACLs are `homelab` work. So this
protects a human surface and a possible future UI; on its own it is not what stops an unauthorized
device command.

`DeviceNotificationsController` is guarded in its own right. Ts.ED's `UseAuth` decorates the class it
sits on, and a child controller is a separate class — it inherits the path prefix and nothing else.

Credential headers are no longer written to the log; that is now the `@radoslavirha/tsed-logger`
default, so this service configures nothing.
