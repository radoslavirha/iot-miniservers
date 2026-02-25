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

## Phase 3

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

## Phase 4

Device value updates. We need to discover, how other libraries handle this. We'll definitelly allow defining HTPP/UDP/MQTT logic per device during register/device update. E.g. client endpoint/topic where we send updated value for property on the device.

We need to discover, how to achieve it internally. Are we always connected to the device via UDP per property, we're polling device regularly (may influence `stamp`)?

Worth to check other libraries how they do it, or check the internet.

- [xmihome](https://github.com/alex2844/node-xmihome/tree/main/packages/node), with [abstract-things](https://github.com/thingbound/abstract-things)
- [mihome-binary-protocol](https://github.com/OpenMiHome/mihome-binary-protocol)
- [miot-api](https://github.com/nt0xa/miot-api)
- [python-miot](https://github.com/rytilahti/python-miot)
- [xiaomi-miot](https://github.com/mvdevries/xiaomi-miot)
- [homebridge-miot](https://github.com/merdok/homebridge-miot)
- [miot](https://github.com/aholstenson/miot)
- [hass-xiaomi-miot](https://github.com/al-one/hass-xiaomi-miot)

## Phase 5

We need a mechanism to verify spec (fetch new, compare with cached) on server start (maybe cron).
We also need internal cache for SimplifiedMiotSpec (Maybe we can optimize the size, speed of access).

## Phase 6

Optional (server configuration) MongoDB integration and replacement of JSON cache.
