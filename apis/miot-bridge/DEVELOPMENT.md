# miot-bridge — Architecture & Technical Reference

This document is for contributors and AI coding agents. For end-user documentation, see [README.md](./README.md) (generated from [.README.hbs](./.README.hbs)).

## Overview

miot-bridge is a Node.js API (Ts.ED framework) that bridges Loxone and other home-automation controllers to Xiaomi devices via the MIoT binary protocol. It exposes HTTP, UDP, and MQTT command interfaces over a unified payload model and manages device registration, MIoT spec caching, property polling, and notification subscriptions.

## Source structure

```
src/
├── controllers/        # Ts.ED HTTP controllers (CommandController, DevicesController, DeviceNotificationsController)
├── endpoints/
│   └── miot-spec-v2/   # External MIoT spec v2 HTTP fetch wrapper + DTO
├── handlers/           # Business logic per route action
│   └── notifications/  # Notification subscription CRUD handlers
├── mappers/            # Bi-directional DTO ↔ model transforms
├── miot/
│   └── packet/         # MIoT binary protocol packet encoding/decoding
├── models/             # Ts.ED schema models, enums, request/response types
│   ├── config/         # Zod config schemas (ConfigModel, HttpConfig, MqttConfig, PollingConfig, UdpConfig)
│   ├── miot-spec-v2/   # Raw MIoT spec v2 shape models
│   ├── notifications/  # Notification request/response models
│   └── simplified-miot-spec/  # Internal simplified property/action map
├── providers/          # Custom Ts.ED providers (MqttClientProvider)
├── services/           # Core services: command execution, polling, dispatch, storage facades, listeners
└── storage/            # Storage layer — repositories + DTOs, one subfolder per backend+entity
    ├── device-local-storage/     # File-based device repository
    ├── device-mongo/             # MongoDB device repository
    ├── notification-local-storage/ # File-based notification repository
    └── notification-mongo/       # MongoDB notification repository
```

All controllers are mounted at `/` — there is no API version prefix in routes.

## MIoT binary protocol

Communication between the bridge and devices uses the [Xiaomi Mi Home Binary Protocol](https://github.com/OpenMiHome/mihome-binary-protocol/blob/master/doc/PROTOCOL.md) over UDP.

### Stamp management

Every MIoT packet carries a `Stamp` counter that the device increments after each call. The bridge:

1. Obtains the current stamp via a handshake packet.
2. Increments and includes the stamp on every subsequent packet.
3. If a data packet is rejected (stale stamp), performs an automatic handshake to refresh the stamp and retries the packet once.

Stamp state is maintained per-device in memory by `MiotDeviceClient`.

## MIoT spec v2

The bridge fetches the raw spec JSON for each device from `miot-spec.org` via `MiotSpecV2Endpoint`. `MiotSpecV2Mapper` + `SimplifiedMiotSpecV2Mapper` parse it into a simplified in-memory map where:

- **Key format**: `<service-type-suffix>:<property-or-action-type-suffix>`
  Examples: `vacuum:status`, `battery:battery-level`, `vacuum:start-sweep`
- **Value**: property access flags (`read`, `write`, `notify`), type, allowed values, IIDs (for wire encoding) — or action arguments/results for actions.

This map is used to validate commands and notification subscriptions at request time.

## Storage

Two storage backends are supported, selected at startup by `DeviceStorageService` and `NotificationStorageService` based on `mongodb.enabled`.

Layering (bottom-up):

1. `src/storage/<group>/dto/` — raw data shapes (no Ts.ED schema decorators needed)
2. `src/storage/<group>/` — repository class (`DeviceLocalStorageRepository`, `DeviceMongoRepository`, etc.), performs CRUD and returns DTOs
3. `src/services/Device[Local|Mongo]Service.ts` — maps DTOs to domain models, contains business logic
4. `src/services/DeviceStorageService.ts` — facade, delegates to the active backend

| Backend | Folder | Notes |
|---|---|---|
| File (default) | `storage/device-local-storage/`, `storage/notification-local-storage/` | JSON files at `cachePath`. Single-instance only. |
| MongoDB | `storage/device-mongo/`, `storage/notification-mongo/` | Via `@radoslavirha/tsed-mongoose`. Mongo models extend `BaseMongo`. |

Repositories return `null` for missing single-document results. Services convert to `undefined` where callers expect it.

## Polling & notification dispatch

`DevicePropertyPollerService` (singleton, extends `EventEmitter`):

- Hydrates an in-memory subscription map from storage on startup.
- Runs a `setTimeout`-based loop at `polling.intervalMs`.
- Per-device back-off after `maxErrorCount` consecutive errors (`errorSkipCycles` cycles skipped).
- Emits `property:changed` events on value changes (or every cycle when `dispatchOnChange = false`).

`NotificationDispatchService` receives `property:changed` events (and direct observations from `DeviceCommandService` for `GetProperty` calls) and forwards to all enabled transports: HTTP POST, UDP datagram, MQTT publish.

Subscription state mutations (`addSubscriptions`, `removeSubscription`, `removeAllSubscriptions`) are called synchronously by the notification REST handlers after persisting to storage, keeping the in-memory cache consistent without a storage round-trip per tick.

## Transport listeners

- **HTTP**: standard Ts.ED/Express HTTP server on `server.httpPort`.
- **UDP**: `UdpListenerService` binds a UDP4 socket on `udp.port`. Includes exponential back-off socket restart on errors (max 5 attempts). Payload uses `UdpCommandRequestModel` with an added `version` field for future routing.
- **MQTT**: `MqttClientProvider` creates the `mqtt` client; `MqttListenerService` subscribes to the command topic and routes to `DeviceCommandService`.

## Design decisions

- **Single instance**: The bridge is deployed as a single `replicas: 1` pod. The poller holds in-memory state (`_subscriptions`, `_lastValues`, `_errorCounts`, `_skipCycles`) that cannot be shared across instances without a distributed lock or an extracted poller service. This is intentional — the target use case is monitoring a small number of local devices.
- **No API versioning in routes**: Controllers are mounted at `/` without a version prefix. The `version` field on UDP payloads exists for future routing flexibility if needed.
