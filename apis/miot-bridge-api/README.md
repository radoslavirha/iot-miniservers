# miot-bridge-api

Gateway between home automation controllers (Loxone and others) and Xiaomi devices via the [MIoT binary protocol](https://github.com/OpenMiHome/mihome-binary-protocol/blob/master/doc/PROTOCOL.md).

Responsibilities:
- Registers devices: performs handshake, fetches MIoT spec from `miot-spec.org`, caches device capabilities
- Sends commands: `GetProperty`, `SetProperty`, `Action` — unified payload across HTTP, UDP, MQTT
- Polls device properties on interval; dispatches change notifications via HTTP, UDP, or MQTT

## Consumed By

- Loxone / other HA controllers: send commands via HTTP, UDP, or MQTT; receive property-change notifications

## External Dependencies

| System | Protocol | Condition | Purpose |
|--------|----------|-----------|---------|
| Xiaomi devices (LAN) | MIoT binary UDP | always | Device control, property reads |
| miot-spec.org | HTTPS GET | on device registration | Fetch device capability spec |
| MQTT broker | MQTT pub/sub | `mqtt.enabled` | Inbound commands + outbound notifications |
| MongoDB | TCP | `mongodb.enabled` | Device registry + notification subscriptions (fallback: local JSON cache) |

## REST API

| Method | Path | Description |
|--------|------|-------------|
| POST | `/devices/discover` | Handshake + capabilities — no persist |
| POST | `/devices` | Register device (handshake, fetch spec, persist) |
| GET | `/devices` | List all registered devices |
| GET | `/devices/:deviceId` | Get device by app UUID |
| DELETE | `/devices/:deviceId` | Delete registered device |
| POST | `/devices/:deviceId/notifications` | Subscribe to property changes |
| GET | `/devices/:deviceId/notifications` | List active subscriptions |
| DELETE | `/devices/:deviceId/notifications` | Delete all subscriptions for device |
| DELETE | `/devices/:deviceId/notifications/:notificationId` | Delete single subscription |
| GET | `/model-property-overrides` | List property override rules |
| POST | `/model-property-overrides` | Add property override rule |
| DELETE | `/model-property-overrides/:id` | Delete override rule |
| POST | `/command` | Send command to device (HTTP transport) |

> `deviceId` in path = app UUID (assigned on registration). `deviceId` in command body = numeric MIoT hardware ID.

## MQTT

| Topic | Direction | Description |
|-------|-----------|-------------|
| `[prefix/]miot-bridge/device/{deviceId}/command` | inbound | Send command |
| `[prefix/]miot-bridge/device/{deviceId}/response` | outbound | Command response |
| `[prefix/]miot-bridge/device/{deviceId}/notification` | outbound | Property change event |

Command payload: `{ deviceId: number, command: "service:property", operation: "GetProperty|SetProperty|Action", [value] }`

## UDP

Command payload: same as HTTP.
Response sent back to sender address/port.

## Notification Payload (all transports)

```json
{ "deviceId": number, "property": "service:property-name", "value": any }
```

## Shared Package

Uses `@radoslavirha/miot-device` — stateful MIoT client handling UDP socket, stamp management, and handshake per device.