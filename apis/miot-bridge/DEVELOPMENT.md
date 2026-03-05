# Development

This application will be a bridge between Loxone (and other apps) and Xiaomi devices. Communication runs on localhost (important for k8s advices).

API will be able to communicate via HTTP/UDP/MQTT with unified request model.
Devices will be defined in json configuration, along with server configuration, later it'll be moved to database and managed via REST API.

API will receive instructions and resend them to devices using defined packet structure (miot protocol). API will automatically perform handshake with device when needed and will cache necessary data.

Development consists of multiple phases.

## Phase 1 (done)

Running 'empty' server with json configuration and using [toolkit-hub](https://github.com/radoslavirha/toolkit-hub) (@radoslavirha packages)

## Phase 2 (done)

Device registry/discovery, caching.

We need a HTTP endpoint (enumerated v1, check next phase) for device discovery. This endpoint will require only device IP address in local network. This endpoint will perform handshake, if successful, will try to fetch Miot spec. If both successful, will return data from handshake except `stamp` and parsed spec for the user, we can think about limiting it for only necessary data.

We need a HTTP endpoint (enumerated v1, check next phase) for device registry. This endpoint will do the same as discovery endpoint and will cache device data, including `stamp` which will be updated. Now we save raw Miot spec. For now we cache devices in JSON, later we'll introduce option to cache in MongoDB. Device ID from handshake will be identifier for further operations related to the device. This endpoint should allow updating cached devices (spec change, new IP,...)

## Phase 3 (done)

Communication request/response model for client -> api communication. Must be same for UDP/HTTP/MQTT. I'm thinking about versioned routes. In HTTP/MQTT it's easy. Maybe UDP request model will have extra property for version and routing service will be created. In ideal scenario, at some moment, all possible requests should be resolved by one service which communicates with device, validates if action is possible, etc.

In model, we need

- API version (enum) - enumerated value we'll use in HTPP/MQTT routing, UDP post routing, swagger docs, etc.
- Device ID (integer) - numeric device ID returned from hanshake and unique identifier in app
- command (string) - property/action Map key from [Miot spec](./AGENTS.md#miot-spec)
- value (unknown) - allowed value for property, depends on property access type and type itself, can be improved later

I imagine REST API:
GET /property (further validation if property has read access)
POST /property (further validation if property has write access)

But this won't fit MQTT/UDP routing. Remember we have properties (read/write/notify access) and actions (no access, just execute action).

## Phase 4 (done)

UDP support.

In server config model we need to add new optional input for UDP.

```
{
    udp: {
        enabled: boolean,
        udpPort: number
    }
}
```

Create UDP listener in server using this port.

## Phase 5 (done)

1. Endpoint updates (done)

- `DeviceRequestModel` for `/discover` will be renamed to `DeviceDiscoverRequest`
- `DeviceResponseModel` for  `/discover` will be renamed to `DeviceDiscoverResponse`
- `/register` will be changed to `/`. Handler will be renamed to `DevicePostHandler`
- logic in `DevicePostHandler` must be changed to mimic real DB (later MongoDB) and should create unique ID and save. `DeviceResponseModel` must include this newly created ID field and be renamed to `DeviceGetResponse`. `DeviceRequestModel` should be renamed to `DeviceRequest`
- new GET `/devices/:id` endpoint which just returns device, basically identical to `DeviceResponseModel`, should be called `DeviceGetResponse`. Id is new one (DB id), not current real deviceId we have.
- new DELETE `/device/:id` endpoint. ID is this newly created ID
- new `DeviceNotificationsController`, `/notifications` path, mounted as children in `DevicesController`
- new POST `/` endpoint for registering new notification. `NotificationRequest` model will have property `properties: string[]`. Device ID from path (hope it'll work in nested controller in Ts.ED) will be verified in storage and all properties will be verified against `SimplifiedMiotSpec.properties`. No need to check access, every READ/WRITE property can be subscribed (ignoring NOTIFY access, it's useless for our usage). This will create new records (again preparing for MongoDB) in a new file for notifications (very similar to devices cache json). Includes reference to deviceId (new ID, not real device id we currently have). Returns `DeviceNotificationResponse` which is only extending new `DeviceNotification` model.
- new GET `/` returns all notifications for device. Returns `DeviceNotificationsResponse` which defines `notifications: DeviceNotification[]` property.
- new DELETE `/` deletes all notifications for device
- new DELETE `/:id` deletes notification by id


2. Device value updates. We need to discover, how other libraries handle this, I guess we need to poll device:

- [xmihome](https://github.com/alex2844/node-xmihome/tree/main/packages/node), with [abstract-things](https://github.com/thingbound/abstract-things)
- [mihome-binary-protocol](https://github.com/OpenMiHome/mihome-binary-protocol)
- [miot-api](https://github.com/nt0xa/miot-api)
- [python-miot](https://github.com/rytilahti/python-miot)
- [xiaomi-miot](https://github.com/mvdevries/xiaomi-miot)
- [homebridge-miot](https://github.com/merdok/homebridge-miot)
- [miot](https://github.com/aholstenson/miot)
- [hass-xiaomi-miot](https://github.com/al-one/hass-xiaomi-miot)

### Phase 6

1. Empty notification service receiving all updates from polling and direct HTTP/UDP/MQTT calls (get property).
Sending notifications out will be solved later.

2. Define HTPP/UDP/MQTT notifications in server configuration and prepare NotificationDispatchService. Send notifications only via HTTP/UDP. Response model contains deviceId, value and property only. 

```
    "notifications": {
        "udp": {
            "enabled": true,
            "address": ""
        },
        "http": {
            "enabled": true,
            "address": ""
        },
        "mqtt": {
            "enabled": false
        }
    }
```

3. Implement MQTT client. Enhance configuration model similar to UDP listener config. We need also credentials and maybe we should define also topic? But then we need to add v1 to topic, so maybe we should just hardcode and document it. We should create mqtt client via <https://tsed.dev/docs/custom-providers.html#custom-providers>. Maybe we should create UDP listener same way.

4. Integrate MQTT client in pub/sub operations.

## Phase 7

We need a mechanism to verify spec (fetch new, compare with cached) on server start (maybe cron).
We also need internal cache for SimplifiedMiotSpec (Maybe we can optimize the size, speed of access).

## Phase 8

MQTT support

## Phase 9

Optional (server configuration) MongoDB integration and replacement of JSON cache.
