# MQTT — What Is Actually Reusable

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Repo:** `/Users/radoslavirha/dev/irha/iot-miniservers`.

**Verdict:** MQTT does **not** get an `mqtt-provider` / `tsed-mqtt-provider` package pair. Almost all of it is `miot-bridge-api` business logic. The reusable surface is one health check, extracted the way `MongoHealthCheck` was.

**Status:** measured 2026-08-15. No action required until a second app needs MQTT, and even then the answer is probably still "copy the provider, share the check".

This file exists to stop a future agent proposing the package pair — that proposal was made and rejected on the numbers below.

---

## The measurement

| File | LOC | What is actually generic |
| --- | --- | --- |
| [`services/MqttListenerService.ts`](../../../apis/miot-bridge-api/src/services/MqttListenerService.ts) | 207 | ~12 lines of `subscribe` + `on('message')`. Rest is device-id extraction, JSON parse, `MqttCommandRequestModel` validation, command dispatch, response semantics. **Business logic.** |
| [`services/MqttTopicService.ts`](../../../apis/miot-bridge-api/src/services/MqttTopicService.ts) | 118 | `getPrefix()` + `build()` — about 8 lines. Everything else is the `miot-bridge/device/{id}/…` shapes. **Business logic.** |
| [`providers/MqttClientProvider.ts`](../../../apis/miot-bridge-api/src/providers/MqttClientProvider.ts) | 113 | Genuinely generic, but it is a thin wrapper over `mqtt.connect()` — the added substance is a startup error budget and four log lines. Also reads the app's `ConfigService` directly. |
| [`services/MqttTracingService.ts`](../../../apis/miot-bridge-api/src/services/MqttTracingService.ts) | 59 | ~12 lines of glue, and it reads app config. |
| [`health/MqttHealthCheck.ts`](../../../apis/miot-bridge-api/src/health/MqttHealthCheck.ts) | 42 | **All of it.** No app coupling beyond the client token. |
| [`models/config/MqttConfig.ts`](../../../apis/miot-bridge-api/src/models/config/MqttConfig.ts) | 31 | Generic, but trivially copied and each app tweaks `notifications`. |

### Why the http-provider parallel does not hold

[`http-provider`](../../../packages/http-provider) earns its existence: four auth strategies, resilience and circuit breakers, transport config, redaction — real substance across 16 files, with per-upstream keying that no single app could have discovered alone.

The MQTT equivalent is `mqtt.connect()` plus a reconnect option the library already implements. Wrapping that in two packages would be more machinery than the thing it wraps.

---

## The one extraction worth doing

- [ ] Move `MqttHealthCheck` to `@radoslavirha/tsed-health/mqtt`, mirroring [`packages/tsed-health/src/mongoose.ts`](../../../packages/tsed-health/src/mongoose.ts) exactly:

  - Own subpath export in `package.json`, so `mqtt` stays an **optional peer** — an app with no broker never resolves it. Same reason `mongoose` and `@tsed/mongoose` are optional there.
  - The app re-exports it from its health barrel to register it: `export { MqttHealthCheck } from '@radoslavirha/tsed-health/mqtt';`. A bare `@Injectable()` resolves but is invisible to `injectMany` — the app then reports healthy having checked nothing. Assert the check name in an integration test.
  - Keep `pass`/`disabled` for a null client. Returning `fail` for a disabled dependency leaves a correctly-configured deployment permanently NotReady, silently.
  - Needs a client token to inject. `MongoHealthCheck` injects `MongooseService`; there is no equivalent shared MQTT token, so this either takes the token as a parameter or the client provider moves too. **This is the one real design question** — resolve it against a second consumer, not in the abstract.

Do this when a second app needs MQTT, not before. `AGENTS.md` already names this exact file as the example of the rule:

> Write a check in the app only when the dependency is genuinely app-specific (`MqttHealthCheck` in `miot-bridge-api`); anything a second app would duplicate belongs in the package.

---

## Correction: the tracing helpers stay in `packages/otel`

An earlier version of this spec argued that [`packages/otel/src/mqttTracing.ts`](../../../packages/otel/src/mqttTracing.ts) sat in the wrong package — by the precedent that `@radoslavirha/tsed-logger` knows nothing about axios while [`tsed-http-provider`](../../../packages/tsed-http-provider/src/attachRequestLogging.ts) owns the HTTP logging.

That argument assumed an MQTT package would exist to own them. With no such package, moving them out of `packages/otel` means moving them into the app — which makes them **less** reusable, not more. They stay.

The generic-messaging refactor (`withProducerSpan` / `withConsumerSpan` taking the messaging system as a parameter) becomes worthwhile when a **second transport** needs spans — the UDP listener, or a queue — not when a second MQTT consumer appears. Until then the MQTT-specific signature is the honest one.

---

## Non-goals

Tracked separately, not part of any packaging decision: the poller root span, UDP listener spans, and the untraced `fetch` in `NotificationDispatchService.sendHttp()`.
