# Instructions

- Stick to root [AGENTS.md](../../AGENTS.md) instructions.
- API end-user documentation lives in [.README.md](./.README.md). Keep it up to date when adding or changing endpoints, config keys, or protocols. Swagger UI is mounted at `/`.
- Technical architecture reference lives in [DEVELOPMENT.md](./DEVELOPMENT.md).

## Source structure

```
src/
├── controllers/        # Ts.ED HTTP controllers — one file per resource
├── endpoints/
│   └── miot-spec-v2/   # External MIoT spec v2 API wrapper + DTOs
├── handlers/           # Business logic per route action
│   └── notifications/  # Notification subscription CRUD handlers
├── mappers/            # Bi-directional DTO ↔ model transforms
├── miot/
│   └── packet/         # MIoT binary protocol packet encoding/decoding
├── models/             # Ts.ED schema models, enums, request/response types
│   ├── config/         # Zod config schemas
│   ├── miot-spec-v2/   # Raw MIoT spec v2 shape models
│   ├── notifications/  # Notification request/response models
│   └── simplified-miot-spec/  # Internal simplified property/action map
├── providers/          # Custom Ts.ED providers (MqttClientProvider)
├── services/           # Core services (poller, dispatch, storage facades, command execution, listeners)
└── storage/            # Repositories + DTOs, one subfolder per backend+entity
    ├── device-local-storage/
    ├── device-mongo/
    ├── notification-local-storage/
    └── notification-mongo/
```

All controllers are mounted at `/` — there is no API version prefix in routes.

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

## Coding rules

- Never use `any` type.
- Repositories return `null` (not `undefined`) for missing single-document results. Services convert to `undefined` where callers expect it.
