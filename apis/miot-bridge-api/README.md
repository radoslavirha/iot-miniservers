# miot-bridge-api

Gateway between home automation controllers (Loxone and others) and Xiaomi devices via the [MIoT binary protocol](https://github.com/OpenMiHome/mihome-binary-protocol/blob/master/doc/PROTOCOL.md).

Responsibilities:
- Registers devices: performs handshake, fetches MIoT spec from `miot-spec.org`, caches device capabilities
- Sends commands: `GetProperty`, `SetProperty`, `Action` — unified payload across HTTP and MQTT
- Polls device properties on interval; dispatches change notifications via HTTP or MQTT

## Authentication

**Every REST route requires a bearer token.** There is no per-route ranking: the four controllers —
commands, devices, device notifications and model-property overrides — all carry
`@Authenticate(AuthMethod.Idp)`. Telling "read the registry" apart from "actuate a device" is
authorization, and waits for scopes rather than being approximated with separate trust domains.

Guarded routes answer `401` without a valid token, and `503` when the token could not be verified — a
JWKS fetch that failed is our problem, not the caller's, and unlike `401` it is retriable. Neither
response says why; the operator-facing detail stays in the logs.

**The decorator reaches HTTP only, and commands also arrive over MQTT**
(`[prefix/]miot-bridge/device/{deviceId}/command`), which never passes through a controller. That
identity belongs to the broker — EMQX per-client credentials and topic ACLs, configured in `homelab`.
So authentication here protects a human surface and a possible future UI; on its own it is **not**
what stops an unauthorized device command.

`DeviceNotificationsController` is a child of `DevicesController` and carries its own decorator. Ts.ED
applies `UseAuth` to the class it decorates, and a child controller is a separate class — inheriting
the parent's guard is exactly the assumption that would leave those four routes open beside twelve
closed ones.

| Open route | Why |
|------------|-----|
| `/health*` | Kubernetes probes |

## Consumed By

- Loxone / other HA controllers: send commands via MQTT; receive property-change notifications over MQTT

## External Dependencies

The only UDP left in this service is the outbound MIoT protocol to the devices themselves. The
inbound UDP command listener and the outbound UDP notification transport were removed — the
controllers use MQTT, and an unauthenticated datagram socket accepting device commands on the LAN was
a command path no decorator or broker ACL could reach.

| System | Protocol | Condition | Purpose |
|--------|----------|-----------|---------|
| Xiaomi devices (LAN) | MIoT binary UDP | always | Device control, property reads |
| miot-spec.org | HTTPS GET | on device registration | Fetch device capability spec |
| MQTT broker | MQTT pub/sub | `mqtt.enabled` | Inbound commands + outbound notifications |
| MongoDB | TCP | `mongodb.enabled` | Device registry + notification subscriptions (fallback: local JSON cache) |

## Configuration (externalApis)

`MiotSpecV2Endpoint` resolves its base URL from `externalApis.MIOT_SPEC`.
Apply ConfigMap changes before rolling application images.

```json
{
	"externalApis": {
		"MIOT_SPEC": {
			"baseURL": "https://miot-spec.org/miot-spec-v2",
			"resilience": {
				"timeout": { "ms": 10000 },
				"retry": { "count": 2, "backoffMs": 500 },
				"circuitBreaker": {}
			},
			"logging": {
				"enabled": true,
				"stack": false
			},
			"retriableStatusCodes": [500, 502, 503, 504, 429, 408]
		}
	}
}
```

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

## Health

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health/live` | Liveness. Always `200` — no dependency I/O, by design |
| GET | `/health/ready` | Readiness. `503` when a critical dependency is down or the pod is draining |
| GET | `/health` | Full report: `{ status, checks }`. `200` for `pass` and `warn`, `503` for `fail` |

Checks: `mongodb` (shared, from `@radoslavirha/tsed-health/mongoose`) and `mqtt` (local) —
both **critical**, since a bridge without storage or broker cannot serve. Each reports
`pass` when not configured. The MQTT check is the only
signal a mid-life broker outage produces, since reconnects after startup are silent.

Hidden from Swagger, excluded from traces and request logs. See
[`@radoslavirha/tsed-health`](../../packages/tsed-health/README.md).

## MQTT

| Topic | Direction | Description |
|-------|-----------|-------------|
| `[prefix/]miot-bridge/device/{deviceId}/command` | inbound | Send command |
| `[prefix/]miot-bridge/device/{deviceId}/response` | outbound | Command response |
| `[prefix/]miot-bridge/device/{deviceId}/notification` | outbound | Property change event |

Command payload: `{ deviceId: number, command: "service:property", operation: "GetProperty|SetProperty|Action", [value] }`

## Notification Payload (all transports)

```json
{ "deviceId": number, "property": "service:property-name", "value": any }
```

## Shared Package

Uses `@radoslavirha/miot-device` — stateful MIoT client handling UDP socket, stamp management, and handshake per device.