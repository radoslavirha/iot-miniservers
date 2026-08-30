---
"@radoslavirha/miot-device": minor
---

Read one property per UDP packet in `getProperties`, and drop the `maxChunkSize` parameter.

A multi-property `get_properties` fed the miot-bridge poller unchanged values for 11 minutes
across a property change made through the Xiaomi app, while a single-property read issued in the
same minute returned the new value. The device is a black box and the cause is not established;
the call shape that reflects changes is. Batching saved four datagrams per poll cycle against one
LAN device — never worth a read whose correctness this library cannot verify per device.
Reinstating it needs evidence from a real device.

Breaking for anyone passing `maxChunkSize`; there were no such callers. Stamp handling is
unchanged: one increment between packets, exactly as the chunk loop did.
