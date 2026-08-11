# @radoslavirha/tsed-health

Kubernetes probe endpoints for a Ts.ED API — `/health/live`, `/health/ready` and
`/health` — backed by a DI-registered check registry, plus a graceful-shutdown drain.

Semantics live in [`@radoslavirha/health`](../health) and are re-exported here, so an app
needs only this package.

## 🚀 Quick Reference for AI Agents

Three steps to add health to an API.

**1. Write a check**, tagged with the `HEALTH_CHECKS` provider type:

```ts
import {
  HEALTH_CHECKS,
  HealthStatus,
  type HealthCheck,
  type HealthCheckResult
} from '@radoslavirha/tsed-health';

@Injectable({ type: HEALTH_CHECKS })
@Scope(ProviderScope.SINGLETON)
export class MqttHealthCheck implements HealthCheck {
  public readonly name = 'mqtt';
  public readonly critical = true;

  @Inject(MqttClientProvider) private readonly client!: MqttClient | null;

  public check(): HealthCheckResult {
    // A dependency switched off by config is not a failure — see the pitfall below.
    if (CommonUtils.isNil(this.client)) {
      return { status: HealthStatus.Pass, detail: 'disabled' };
    }

    return this.client.connected
      ? { status: HealthStatus.Pass }
      : { status: HealthStatus.Fail, detail: 'disconnected' };
  }
}
```

For MongoDB there is nothing to write — see [Built-in: MongoDB](#built-in-mongodb).

**2. Mount the controller and import the checks** in `Server.ts`:

```ts
import { HealthController } from '@radoslavirha/tsed-health';
import './health/index.js';   // side-effect import: this is what registers the checks

@Configuration({
  mount: { '/': [SwaggerController, HealthController, ...ObjectUtils.values(rest)] }
})
```

Mount at `/`, **never** under a version prefix — the probe path must be identical across
apps or the chart's probe block stops being copy-paste.

**3. Drain on SIGTERM** in `index.ts`:

```ts
const shutdown = createShutdownHandler(platform);
['SIGHUP', 'SIGINT', 'SIGQUIT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM']
  .forEach((evt) => process.on(evt, shutdown));
```

**4. Override `HealthCheckService`** to supply configuration — same idiom as `LoggerProvider`:

```ts
@Injectable({ token: HealthCheckService, scope: ProviderScope.SINGLETON })
export class HealthProvider extends HealthCheckService {
  public constructor(configService: ConfigService) {
    super(configService.config.health ?? {});
  }
}
```

**This override is mandatory, not optional.** Ts.ED reads `design:paramtypes` and cannot
resolve a plain config object — it has no DI token — so resolving `HealthCheckService`
without an override fails with `Given token is undefined`, which reads like a circular
dependency and is not. `Logger` and `HttpProviderService` carry the same contract; every
consumer overrides them, and this package's own test suite registers `TestHealthProvider`
for exactly this reason.

## Built-in: MongoDB

`MongoHealthCheck` ships ready to register — the two Mongo-backed APIs had identical copies
of it before it moved here:

```ts
// apis/<api>/src/health/index.ts — the re-export is what registers it
export { MongoHealthCheck } from '@radoslavirha/tsed-health/mongoose';
```

It reads `MongooseService.get()?.readyState` — a field read, not a `ping`, which would be a
network round trip every few seconds for the life of the pod. `critical: true`.

> **Moving soon.** This check belongs in `@radoslavirha/tsed-mongoose`, which already owns
> mongoose. It lives here only because that package is in `toolkit-hub` and cannot depend
> on an unpublished workspace package. See
> [the graduation spec](../../docs/superpowers/specs/2026-08-11-health-packages-graduation.md).

**Why the `/mongoose` subpath.** `mongoose` and `@tsed/mongoose` are declared
`optional: true` in `peerDependenciesMeta`, and the check is a separate build entry. An app
with no database never resolves either package; importing the main entry pulls in nothing
Mongo-related.

**No `ConfigService` needed.** `MongooseService` populates its connection map only from
`connect()`, which Ts.ED calls once per configured connection — so `get() === undefined`
means Mongo was never configured, and the check reports `pass` / `disabled`. A bootstrap
failure is not this case: the process exits instead.

Verified against a real MongoDB (`mongoose.spec.ts`, testcontainers): that `readyState` is
genuinely `1` on a live connection, and genuinely drops to `0` when it closes. Mocking that
would assume the premise the whole `critical: true` design rests on.

## Endpoints

| Endpoint | Answers | Body |
| --- | --- | --- |
| `GET /health/live` | 200, always | `{"status":"pass"}` |
| `GET /health/ready` | 200 / 503 | `{"status":…}` — status only |
| `GET /health` | 200 for `pass` and `warn`, 503 for `fail` | `{"status":…,"checks":{…}}` |

All are `@Hidden()` — probe endpoints are not API surface — and served as
`application/health+json`.

**`/health/live` performs no I/O and never consults the registry.** Reaching the handler
*is* the check. It stays 200 while every dependency is down and while the pod is draining.
That is the single most important decision here: a dependency check in a liveness probe
means one database blip restarts every replica of every service simultaneously, they all
reconnect at once, and the health check becomes the outage. Dependencies belong in
readiness, which only removes the pod from Endpoints.

Status codes are set on the response rather than thrown as `ServiceUnavailable`: a thrown
exception routes through the exception filter, which would log an error for every failing
probe — one line per pod every five seconds for the duration of any outage.

## Pitfalls

**A check with a bare `@Injectable()` is silently invisible.** `injectMany` matches on
`provider.type`, not on the token, so a check missing `type: HEALTH_CHECKS` resolves and
injects normally while never being evaluated — the app reports healthy having checked
nothing. Assert the expected check names in the app's integration test; asserting that
`/health` returns 200 does not catch it.

```ts
expect(inject(HealthCheckService).checks().map((c) => c.name).sort()).toEqual(['mongodb']);
```

**A dependency disabled by config must report `pass`.** Returning `fail` would leave a
correctly-configured deployment permanently NotReady — silently, with no restart and no
error log, because liveness is shallow by design.

**Never put a URL, hostname, credential or stack trace in `detail`.** `/health` is readable
by anything that can reach the pod. The registry surfaces only `error.name` from a thrown
error for exactly this reason, and truncates `detail` to 120 characters.

## Shutdown

`createShutdownHandler` exists because **Ts.ED has no pre-shutdown hook**: `platform.stop()`
is `destroyInjector()` — which emits `$onDestroy` — followed by closing the listeners. By
the time `$onDestroy` fires, mongoose and MQTT are being torn down alongside it, far too
late to flip readiness.

The handler, in order: guard against re-entry, `beginDrain()` so `/health/ready` starts
answering 503, wait `drainDelayMs` (default 5 s) for in-flight requests, then **await**
`platform.stop()`.

That drain window is a *different* window from the chart's `preStop` sleep. `preStop` runs
to completion **before** kubelet sends SIGTERM and covers Endpoints removal propagating to
the ingress — new requests. By the time SIGTERM arrives it is over, so it does nothing for
a request already mid-query when the injector is destroyed. Both are needed; keep
`preStop + drainDelayMs + teardown` inside `terminationGracePeriodSeconds`.

Do **not** register the handler for `beforeExit`: it fires when the event loop empties, not
on a signal, and would start a shutdown nobody requested.
