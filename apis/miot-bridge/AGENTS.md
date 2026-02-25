# Instructions

- follow developement plan in [DEVELOPMENT documentation](./DEVELOPMENT.md)
- automatically document API usage (Swagger, .README.hbs => this will be transformed into README.md, you can check [docs.js](../../docs.js)).

## Miot protocol

Communication between API and device uses [Xiaomi Mi Home Binary Protocol (miot)](https://github.com/OpenMiHome/mihome-binary-protocol/blob/master/doc/PROTOCOL.md).

There is one tricky part, it's `Stamp` in packet. This is counter increased on the device after every call to the device. API must cache it and send increased value on every call, otherwise device will refuse communication. Current `Stamp` version can be determined from handshake call. API should have possibility to automatically call handshake packet to get `Stamp` when data packet fails and repeat data packet again.

## Miot spec

API guards possible commands for device using [Miot spec](https://miot-spec.org/miot-spec-v2).
Responsible service is parsing raw JSON and creating structure where properties/actions are Map where:

- key is part of service `type` string (vacuum, battery, etc.) and part of action/property `type` string (status, start-sweep, etc.)
- value is similar to raw spec, with modified `iid` where `siid` is `service.iid`
  - `piid` is `property.iid` for properties
  - `aiid` is `action.iid` for actions

## Communication

API - device is UDP
client (Loxone) - API is UDP/HTTP/MQTT

All possible communication protocols must have same payload required/returned from/to client.
