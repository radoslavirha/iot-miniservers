# Backend Health Checks — Design Spec

> **Status:** Proposed
> **Scope:** backends only (`apis/*` + new `packages/*`). The two nginx UIs are covered by a
> separate frontend spec.
> **Upstream plan:** `homelab` — `docs/superpowers/plans/2026-08-06-iot-app-health-checks.md`.
> That plan's Kubernetes reasoning (the three probes, liveness-must-be-shallow, preStop) is
> taken as given and not restated. This spec replaces its **Phase A** and **Phase B** with a
> package design that fits this repository, and corrects three of its findings.
> **Blocked by:** `toolkit-hub` — `docs/superpowers/specs/2026-08-06-health-endpoint-log-exclusion.md`.

## Goal

Two new workspace packages — `@radoslavirha/health` (framework-agnostic) and
`@radoslavirha/tsed-health` (Ts.ED adapter) — that give every API `/health`,
`/health/live` and `/health/ready` endpoints, a typed registry of dependency checks, and a
correct graceful-shutdown path. Apps contribute the checks only they know about; anything
shared by more than one app lives in the packages, behind an optional peer dependency when
it needs a driver (see `MongoHealthCheck` below).

Both packages are `private: true` workspace members here, mirroring how `resilience` /
`tsed-resilience` were incubated, and move to `toolkit-hub` (`packages/health`,
`tsed/health`) once the API has settled across three consumers.

---

## What changes versus the homelab plan

Five substantive changes. The first three are corrections found by reading the installed
code; the last two are design.

### 1. Health lives in new packages, not in `toolkit-hub`'s `tsed/platform`

The homelab plan puts `HealthController` into `@radoslavirha/tsed-platform`. Rejected:

- `tsed-platform` is the Express middleware stack and `BaseServer`. Adding a controller,
  a DI registry, a shutdown state machine and a caching evaluator to it makes every
  consumer of `BaseServer` — including ones with no HTTP dependencies to check — carry
  the whole thing.
- This repository already has the right precedent. `resilience` / `tsed-resilience` is a
  framework-agnostic core plus a thin Ts.ED adapter with `peerDependencies` on `@tsed/*`,
  incubated here and destined for `toolkit-hub`. Health has exactly the same shape:
  the roll-up, timeout and report format are pure logic with no Ts.ED in them.
- Incubating here means the three APIs can iterate on the check contract without a
  publish cycle per change.

### 2. There is no pre-shutdown lifecycle hook — the plan's A2 has no "if"

The plan hedges: *"Give `BaseServer` a `$beforeShutdown`-equivalent hook … Verify against
the installed Ts.ED version which lifecycle hook fires first."* Verified against
`@tsed/platform-http@8.37.1`:

```js
// PlatformBuilder.js:184
async stop() {
    await destroyInjector();     // → $asyncEmit('$onDestroy'), then $off every token
    this.#listeners.map(closeServer);
}
```

`$onDestroy` is the **only** hook, and it fires as part of teardown — concurrently with
mongoose disconnecting and `MqttClientProvider`'s `$onDestroy` ending the client. Setting
`draining = true` there is too late to be useful, and the HTTP listeners close immediately
after. So the conditional branch resolves: **drain is driven from the signal handler in
each app's `index.ts`, before `platform.stop()`.** A shared helper makes that one line
per app rather than three copies (see [Shutdown](#shutdown)).

### 3. `preStop` runs *before* SIGTERM, not concurrently with it

The plan's Rule 4 says *"kubelet sends SIGTERM at the same moment the endpoints controller
starts removing the pod from Endpoints"*. Kubelet actually runs the `preStop` hook to
completion **first**, and only then sends SIGTERM. The concurrency is between Endpoints
removal and `preStop` starting.

The recommendation (`preStop: sleep`) is unchanged and correct, but the reason matters for
sizing the budget, and it means `preStop` and the in-process drain solve *different*
problems:

| Window | Covered by | Problem it solves |
| --- | --- | --- |
| Endpoints removal → Traefik stops routing | `preStop: sleep 10` | New requests still arriving at a doomed pod |
| SIGTERM → injector destroyed | in-process drain delay | Requests **already in flight** losing their Mongo connection mid-query |

`platform.stop()` destroys the injector immediately, so without the second window an
in-flight request loses its dependencies. `preStop` alone does not cover this — by the time
SIGTERM arrives, `preStop` is over.

### 4. `critical` is a per-check property, not a per-app decision

The plan decides readiness contracts per app in a table: `miot-bridge-api` checks
mongo+mqtt, `interactive-map-feeder-api` checks nothing. That is the right conclusion, but
encoding it as "register a check" vs "register nothing" throws away the middle ground and
loses the *reason* at the point where someone will later change it.

Instead, every `HealthCheck` declares `critical: boolean`:

- `critical: true` — a `fail` makes `/health/ready` return 503 (pod leaves Endpoints).
- `critical: false` — a `fail` degrades the `/health` report to `warn`; `/health/ready`
  stays **200**.

So `interactive-map-feeder-api` is not "registers nothing" — it registers its upstreams as
non-critical. You get the observability without the outage-amplification, and the
`critical: false` sits literally at the registration site, which is where the "never
health-check a dependency you cannot fix" comment belongs.

### 5. Health does not depend on resilience — see [below](#resilience-coupling)

---

## Package structure

```text
packages/health/                    @radoslavirha/health
  src/
    index.ts
    HealthCheck.ts                  contract: HealthCheck, HealthCheckResult, HealthStatus
    HealthRegistry.ts               concurrent evaluation, per-check deadline, single-flight cache
    report.ts                       status roll-up + application/health+json body
    checks/
      breakerCheck.ts               circuit-breaker adapter over CircuitState from resilience
    schemas/health.schema.ts        zod HealthConfigSchema
    errors.ts

packages/tsed-health/               @radoslavirha/tsed-health
  src/
    index.ts
    HEALTH_CHECKS.ts                the provider-type symbol checks are grouped under
    HealthCheckService.ts           owns the HealthRegistry, resolves the token
    HealthController.ts             @Controller('/health') @Hidden
    ShutdownState.ts                draining flag
    createShutdownHandler.ts        the correct SIGTERM sequence, shared by all apps
    mongoose.ts                     MongoHealthCheck — second build entry, optional peers
    mongoose.spec.ts                testcontainers: verified against a real MongoDB
    test/setup.ts
    test/TestMongoServer.ts         fixture server for the Mongo spec
```

`MongoHealthCheck` is shared rather than per-app. An earlier draft of this spec kept it in
each API — "packages never import mongoose" — which produced two files differing only in
comments, both tested against a mocked `readyState`. That reasoning confused a *runtime*
dependency with a *test* one: `@radoslavirha/tsed-mongoose` in `toolkit-hub` already
declares `mongoose` as both a peer and a dev dependency and tests itself with
`@tsed/testcontainers-mongo`, and `packages/resilience` here imports real mongoose in an
integration spec while shipping no mongoose dependency at all.

Two things make it clean:

- **`/mongoose` subpath, second tsdown entry.** `mongoose` and `@tsed/mongoose` are
  `optional: true` in `peerDependenciesMeta`, so an app with no database never resolves
  them. Bundling the check into the main entry would drag `@tsed/mongoose` into every
  consumer's import graph.
- **No `ConfigService`.** `MongooseService` populates its connection map only from
  `connect()`, so `get() === undefined` means Mongo was never configured — which is what
  the disabled case needs, without the check knowing anything app-specific.

Scaffolding is copied verbatim from `packages/tsed-resilience`: `tsdown.config.ts`
(`[cjsConfig, esmConfig]`), `vitest.config.ts` merging `defaultConfig` with 90% thresholds,
`eslint.config.mjs`, `tsconfig.json`, dual CJS/ESM `exports`, `private: true`.
`@radoslavirha/health` takes `zod` as its only runtime dependency (config schema);
`@radoslavirha/tsed-health` takes `@tsed/*` as `peerDependencies` only, exactly as
`tsed-resilience` does. Both are consumed as `workspace:*`.

Use the `add-workspace-member` skill (`.apm/skills/add-workspace-member`) to scaffold both.

---

## `@radoslavirha/health` — the core

### Contract

```ts
export type HealthStatus = 'pass' | 'warn' | 'fail';

export interface HealthCheckResult {
    readonly status: HealthStatus;
    /**
     * Short, non-sensitive detail — a state name, not a message. Never a URL, a
     * hostname, a credential or a stack trace: /health is reachable by anything that
     * can reach the pod. Truncated to 120 characters by the registry.
     */
    readonly detail?: string;
    /** Optional numeric observation, e.g. latency in ms. IETF `observedValue`. */
    readonly observedValue?: number;
}

export interface HealthCheck {
    /** Stable identifier, e.g. 'mongodb', 'mqtt'. Appears in the /health body. */
    readonly name: string;
    /**
     * Whether a `fail` here removes the pod from the Service's Endpoints.
     *
     * `true`  — the app cannot do its job without this. /health/ready returns 503.
     * `false` — informational. A `fail` degrades /health to `warn`; readiness is
     *           unaffected. Use for anything you cannot fix by restarting or
     *           rescheduling this pod — third-party APIs above all.
     */
    readonly critical: boolean;
    /**
     * @param signal aborts at the per-check deadline. Honour it: an abandoned check
     *   still holds a connection. Every I/O path in this repository already takes an
     *   AbortSignal (`ResiliencePolicy.execute`, mongoose `QueryOptions.signal`).
     */
    check(signal: AbortSignal): Promise<HealthCheckResult> | HealthCheckResult;
}
```

Three additions over the homelab plan's version: `critical` (above), `signal` (so a check
can cancel rather than be abandoned — the repo idiom already), and `observedValue`.

### Roll-up

```text
readiness gate  = every check with critical:true has status !== 'fail'
overall status  = 'fail'  if any critical check failed
                  'warn'  if any check warned, or any non-critical check failed
                  'pass'  otherwise
```

`/health` returns **200 for both `pass` and `warn`**, 503 only for `fail`. A degraded
third-party upstream is therefore a 200 with `"status":"warn"` — visible to a dashboard,
invisible to kubelet. This is the whole point of the `critical` flag.

### Evaluation

- **Concurrent.** `Promise.all` over already-timeboxed checks, so wall time is the slowest
  check, not the sum. With a serial loop, three 2 s checks blow past a
  `readinessProbe.timeoutSeconds: 3`.
- **Per-check deadline**, default 2000 ms, configurable. On expiry the check yields
  `{ status: 'fail', detail: 'timeout' }` — the registry never rejects. A hung check must
  fail loudly, not stall the probe into a bodyless kubelet timeout.
- **Never propagates a thrown error.** A check that throws becomes
  `{ status: 'fail', detail: <error.name> }`. `error.name`, deliberately **not**
  `error.message` — a mongoose connection error's message contains the connection URI.
  Enforcing this in the registry rather than trusting each check is the difference between
  a convention and a guarantee.
- **Single-flight + TTL cache**, default 1000 ms, must be below the shortest probe period.
  Startup, liveness and readiness probes plus any human hitting `/health` otherwise
  multiply into concurrent evaluations of the same checks. One in-flight evaluation is
  shared; a result younger than the TTL is reused. Staleness is bounded by one probe
  period, which is below the resolution any probe can act on anyway.
- `/health/live` never touches the registry, the cache, or anything else. Reaching the
  handler is the proof.

### Config

```ts
export const HealthConfigSchema = z.object({
    /** Per-check hard deadline. Keep below readinessProbe.timeoutSeconds. */
    checkTimeoutMs: z.number().int().min(1).default(2000),
    /** Result reuse window. Keep below the shortest probe periodSeconds. */
    cacheTtlMs: z.number().int().min(0).default(1000),
    /**
     * When false, GET /health returns status only, with no per-check breakdown —
     * for when /health ends up routable from outside the cluster.
     */
    exposeDetail: z.boolean().default(true)
});
```

`z.input` for the public type so callers may pass `{}`, matching
`ResilienceConfigSchema`'s convention.

### Body

`application/health+json`, per `draft-inadarei-api-health-check`:

```jsonc
// GET /health           → 200
{ "status": "warn", "checks": { "mongodb": { "status": "pass" },
                                "chmi-portal": { "status": "fail", "detail": "circuit-open" } } }

// GET /health/ready     → 200
{ "status": "warn" }

// GET /health/live      → 200
{ "status": "pass" }
```

`/health/ready` deliberately omits `checks` — the kubelet path stays minimal, and the one
consumer that wants detail (a human, a dashboard) uses `/health`.

---

## `@radoslavirha/tsed-health` — the adapter

### Registry — `HEALTH_CHECKS` is a provider *type*, not an injection token

This is the load-bearing mechanism, and the naming in `@tsed/di` invites getting it wrong.
Traced through `@tsed/di@8.37.1`:

```js
// InjectorService.js:109 — injectMany(x) → getMany(x)
getMany(type, options) {
    return this.getProviders(type).map((provider) => this.resolve(provider.token, options));
}

// Container.js:70 — the match is on provider.type, NOT on provider.token
getProviders(type) {
    const types = new Set([].concat(type).map(String));
    // ...for each provider: if (types.has(String(provider.type))) providers.push(provider);
}
```

So `injectMany(SYMBOL)` returns every provider whose **`type`** is `SYMBOL`. Each check
therefore keeps its own token (its class) and is *grouped* by the symbol:

```ts
export const HEALTH_CHECKS = Symbol.for('radoslavirha:HEALTH_CHECKS');

// Registration — a class provider tagged with the group type.
@Injectable({ type: HEALTH_CHECKS })
@Scope(ProviderScope.SINGLETON)
export class MongoHealthCheck implements HealthCheck { /* ... */ }

// or, via the fluent builder (ProviderBuilder.type() — ProviderBuilder.d.ts:187).
// `injectable()` registers on call; `.token()` is the terminal accessor — there is no
// `.build()`. Same shape as MqttClientProvider in miot-bridge-api.
injectable(SOME_TOKEN).type(HEALTH_CHECKS).factory(() => check).token();
```

Two consequences worth spelling out, because both are silent failures:

- **The match is `String(provider.type)`.** A `Symbol.for('HEALTH_CHECKS')` declared in two
  packages is the *same* symbol, which is what we want — but any unrelated symbol with the
  same description would also collide, since only the stringified form is compared. Hence
  the namespaced description above rather than a bare `'HEALTH_CHECKS'`.
- **A check registered with `@Injectable()` and no `type` is silently invisible.** It
  resolves fine, injects fine, and never appears in `injectMany` — so the app reports
  healthy while checking nothing. The per-app integration tests must assert the *expected
  set of check names* appears in the `/health` body, not merely that `/health` returns 200.

`HealthCheckService` resolves the group with `injectMany<HealthCheck>(HEALTH_CHECKS)` and
feeds it to a `HealthRegistry`. **An empty group is legal** — `getProviders` on an unused
type returns `[]`, so the registry reports `pass`. Verify explicitly in a test.

### Controller

```ts
@Controller('/health')
@Hidden()
@Scope(ProviderScope.SINGLETON)
export class HealthController { /* @Get('/live'), @Get('/ready'), @Get('/') */ }
```

- `@Hidden()` keeps it out of the Swagger document; probe endpoints are not API surface.
- Mounted explicitly by each app, next to `SwaggerController` — every app overrides `mount`
  in its own `@Configuration`, so anything `BaseServer` mounted by decorator would be
  dropped. Same idiom, one line per app.
- **Mount at `/`, never under a version prefix.** `interactive-map-feeder-api` mounts its
  controllers at `/v1`; health must not follow, or the probe path becomes app-specific and
  the copy-paste values block in the chart stops being copy-paste.
- Returns the status code via `@Context()` / `$ctx.response.status(...)` rather than
  throwing `ServiceUnavailable` — a thrown exception routes through the exception filter,
  which logs an error for every readiness failure. During a Mongo outage that is one error
  log per pod per 5 s, which is precisely what this design is trying to avoid.

### Shutdown

`ShutdownState` is an injectable holding one boolean, defaulting to `false`, with
`beginDrain()`. `/health/ready` returns 503 immediately when draining, **before** consulting
any check. `/health/live` stays 200 throughout — a draining pod is not a stuck pod, and
returning 503 from liveness during shutdown earns a pointless restart.

Because no pre-stop hook exists ([correction 2](#2-there-is-no-pre-shutdown-lifecycle-hook--the-plans-a2-has-no-if)),
the package ships the sequence rather than documenting it:

```ts
// node:timers/promises — the callback `setTimeout` is not awaitable and would make the
// drain a no-op that silently skips straight to platform.stop().
import { setTimeout } from 'node:timers/promises';

export const createShutdownHandler = (
    platform: PlatformBuilder,
    opts: { drainDelayMs?: number } = {}
) => {
    let shuttingDown = false;
    return async (): Promise<void> => {
        if (shuttingDown) { return; }
        shuttingDown = true;
        inject<ShutdownState>(ShutdownState).beginDrain();   // /health/ready → 503 now
        await setTimeout(opts.drainDelayMs ?? 5_000);         // in-flight requests finish
        await platform.stop();
    };
};
```

Each app's `index.ts` becomes `SIG_EVENTS.forEach((evt) => process.on(evt, shutdown))`.

This fixes three real defects in the current bootstrap, identical in all three apps:

- **`platform.stop()` is never awaited.** The handler is `() => { platform.stop(); }`, so
  nothing keeps the process alive while teardown runs; Node exits when the loop drains.
- **No re-entrancy guard.** A second signal — routine, since kubelet may SIGKILL-follow —
  starts a second teardown over a half-destroyed injector.
- **`beforeExit` is in `SIG_EVENTS`.** It fires when the event loop empties, not on a
  signal, and calling `platform.stop()` from it is at best redundant. Drop it from the list.

Budget, matching the homelab plan's `terminationGracePeriodSeconds: 30`:
`preStop 10s` + `drainDelay 5s` + teardown, ~15 s of the 30 s used.

---

## Resilience coupling

> *"verify connection with resilience … not sure if coupling so much those packages is good"*

**`@radoslavirha/health` must not depend on `@radoslavirha/resilience`, and health checks
must not execute through a `ResiliencePolicy`.** Three reasons, in order of importance:

1. **Retry inside a probe is double-counting.** `readinessProbe.failureThreshold: 3` *is*
   the retry, owned by kubelet, at the right layer. A retry inside the check makes each
   probe slower, delays the true signal by `count × backoff`, and can push the response
   past `timeoutSeconds` — at which point kubelet records a bodyless timeout and the
   `detail` the check worked to produce is lost.
2. **A circuit breaker inside a probe is statistically meaningless and actively harmful.**
   `SamplingBreaker` needs `minimumThroughput` calls per second; a readiness probe supplies
   0.2/s. Worse, if the breaker is *shared* with the real traffic path, health-check
   traffic starts tripping the breaker that guards production requests — the probe becomes
   a cause of outages.
3. **Timeout is the only resilience primitive a probe wants**, and the registry needs its
   own anyway (per-check, always-on, must produce `fail` rather than reject). That is ~10
   lines. Taking `cockatiel` into the health package to reuse them is a poor trade.

**The reverse direction, though, is where the value is.** An existing circuit breaker —
one already guarding real traffic — is the best available signal about an external
dependency, and reading it costs zero I/O. So `@radoslavirha/health` ships an adapter over
breaker state:

```ts
// packages/health/src/checks/breakerCheck.ts
import { CircuitState, type CircuitStateLike } from '@radoslavirha/resilience';

/**
 * Reports an existing circuit breaker's state as a health check. Passive: it reads a
 * field, issues no request, and adds no load to the dependency. A breaker seeing no
 * traffic reports `pass` — correct, since there is no evidence of a fault.
 *
 * Defaults to `critical: false`. A breaker guarding a third-party API must never gate
 * readiness; see the analysis in the homelab plan.
 */
export const breakerCheck = (
    name: string,
    breaker: CircuitStateLike,
    opts?: { critical?: boolean }
): HealthCheck => { /* Closed → pass, HalfOpen → warn, Open|Isolated → fail */ };
```

`CircuitStateLike` and `CircuitState` are owned by `@radoslavirha/resilience`, which owns
cockatiel. **This is the only reason health depends on resilience, and it costs nothing:
anyone who needs `breakerCheck` already has a circuit breaker, so already has resilience.**

An earlier draft declared a structural `{ state: number | string }` in health instead, to
keep the package dependency-free. Rejected on implementation: it produced *two* identical
`CircuitStateLike` interfaces (health and http-provider) with no relationship between them,
and forced health to mirror cockatiel's enum by value — `1: 'open'` — which would silently
report every open circuit as healthy if cockatiel ever renumbered. Trading a correctness
risk and a duplicated type for a dependency the consumer already has is a bad trade, and it
broke the convention `http-provider` → `resilience` already sets.

**One enabling change is needed** in `@radoslavirha/tsed-http-provider`:
`HttpProviderFactory` already builds one `ResiliencePolicy` per configured entry and
`createResiliencePolicy` already returns `{ execute, breaker }`, but the policy is local to
`applyResilience` and unreachable. Retain it and expose:

```ts
public breakers(): ReadonlyMap<K, CircuitStateLike>;   // HttpProviderService
```

Additive, read-only, no behaviour change.

**Not done:** exposing `QrCodeMongoRepository`'s private `slugLookup` breaker. Its signal
duplicates `MongoHealthCheck`'s `readyState`, which is cheaper and less indirect. Left as a
follow-up if per-collection granularity is ever wanted.

---

## Per-app and cross-cutting work

Shared by all three: bump nothing from `toolkit-hub` except the two logger-related
packages (below), add `@radoslavirha/health` + `@radoslavirha/tsed-health` as
`workspace:*`, add `HealthController` to the `mount` array at `/`, replace the signal
handler with `createShutdownHandler`, add `health` to `ConfigModel` (all fields defaulted —
additive, per the repository's configuration-contract rule), and extend
`Server.integration.spec.ts`.

### `miot-bridge-api`

- `src/health/index.ts` re-exports the shared `MongoHealthCheck` from
  `@radoslavirha/tsed-health/mongoose` — `critical: true`. It reads `readyState` (a field
  read; a ping would be a round trip every 5 s forever) and reports `pass` when Mongo was
  never configured, since `MongooseService.get()` is `undefined` in that case.

  **The disabled case is load-bearing.** `MongoConfigSchema` is
  `z.union([MongoEnabledSchema, MongoDisabledSchema])` and both apps' `index.ts` branch on
  it: `mongoose: ObjectUtils.isEnabled(config.config.mongodb) ? [...] : undefined`. A naive
  check would report `fail` forever with Mongo off — the pod would **never** enter
  Endpoints, silently, with no restart and no error log. A health check causing a total
  outage of a correctly-configured app is the exact failure class this design prevents.
- `src/health/MqttHealthCheck.ts` — `critical: true`. Injects `MqttClientProvider`; `pass`
  when the client is non-null and `client.connected`. **`pass` when the provider resolved
  to `null`** — MQTT disabled by config is not a failure, and this app runs with
  `mqtt.enabled: false` in some environments.
  Post-startup reconnects are silent (`MqttClientProvider` only rejects during bootstrap,
  after `MAX_STARTUP_ERRORS`), so this check is the *only* signal that a mid-life broker
  outage exists. That is the case readiness is for.
- Both are `@Injectable({ type: HEALTH_CHECKS })`, re-exported from a new
  `src/health/index.ts` that `Server.ts` imports alongside `./providers/index.js` — the
  import is what registers them, same as the providers barrel does today.

### `qr-manager-api`

As above, minus MQTT. The disabled-Mongo guard applies here too: `ConfigModel.ts` describes
Mongo as always present ("The QR Manager always persists records to MongoDB"), but the
schema is the same disable-able union and `index.ts` branches on it identically. The
description is not the contract.

### `interactive-map-feeder-api`

- **No `critical: true` check.** Its dependencies are third-party HTTP APIs; an outage
  there is not fixable by removing this pod from Endpoints, and doing so converts someone
  else's outage into yours.
- Registers `breakerCheck(name, breaker, { critical: false })` per configured external API,
  driven off `HttpProviderService.breakers()`. `/health` then reports upstream state, and
  `/health/ready` never moves.
- The `critical: false` argument, plus a one-line comment at the registration site, is the
  guard against a future "fix". Mount `HealthController` at `/`, **not** `/v1`.

### `packages/otel`

`OpenTelemetryService.ts` — pass `ignoreIncomingRequestHook` to `HttpInstrumentation`,
dropping requests whose pathname is `/healthz` or is `/health` / under `/health/`. Keep the
path list as a module constant next to the instrumentation list so it is greppable.

Match on the pathname with the query string stripped, and anchor on a segment boundary —
a bare `startsWith('/health')` would also silence an unrelated `/healthchecks-admin` route.
`request.url` is a relative path plus query, never absolute, so parse it as such.

**One hook is enough for the whole trace.** Verified in the resolved
`@opentelemetry/instrumentation-http@0.221.0` (`build/src/http.js:308-318`): the ignore
branch returns early, wrapping the handler in
`context.with(suppressTracing(context.active()), …)`. `@opentelemetry/sdk-trace`'s
`Tracer.startSpan` checks `isTracingSuppressed(context)` and returns a non-recording span
(`Tracer.js:48-52`), and the suppression travels with the async context — so
`ExpressInstrumentation`'s child spans are non-recording too. No separate Express filter,
no custom sampler, no filtering `SpanProcessor`.

Note the repository has **two** copies of `instrumentation-http` in the store (0.219.0
transitively, 0.221.0 for this package). The ignore branch is identical in both; check the
version `packages/otel` actually resolves before relying on line numbers.

#### This also drops the HTTP server metric — which is fine, but exposes a real gap

`_recordServerDuration` is called at `http.js:527`, inside the response handler that the
ignore branch returns before ever reaching. So `ignoreIncomingRequestHook` suppresses
`http.server.request.duration` for probe requests along with the spans. The hook is
all-or-nothing; there is no trace-only variant.

**Dropping probe rows from that histogram is correct on its own merits.** The metric is
live today — `http_server_request_duration_seconds_{bucket,count,sum}` is present in
server3's Prometheus — and it is the natural basis for a latency SLO. Health checks are
fast and constant-rate; leaving them in dilutes every percentile of real traffic. Any
dashboard built on it would have to filter `http.route!~"/health.*"` by hand forever.

**But it does mean probe state must be observable from Kubernetes, and today it is not.**
Queried against server3's Prometheus:

| Metric | Present | Note |
| --- | --- | --- |
| `kube_pod_container_status_restarts_total` | yes | catches a liveness kill loop |
| `kube_pod_status_phase`, `kube_pod_status_reason` | yes | |
| `kube_pod_container_status_waiting_reason` | yes | catches `CrashLoopBackOff` |
| `kube_pod_status_ready` | **no** | the one that says "readiness is failing" |
| `prober_probe_total`, `prober_probe_duration_seconds` | **no** | kubelet probe counters |

The upstream homelab plan's Rule 5 assumes `kube_pod_status_ready` "already lands in
server3's Prometheus via k8s-monitoring". It does not — `gitops/helm-values/k8s-monitoring.yaml`
sets no `metricsTuning`, so the chart's default allow-list applies and drops it, and
kubelet's `prober_*` series are not collected at all.

So without a change, a Mongo outage would put every pod NotReady and **nothing would
record it** — which is exactly the "green does not mean working" failure this whole effort
exists to fix.

**Fix it in `homelab`, not here.** Written up as its own problem statement at
`homelab/docs/superpowers/plans/2026-08-07-probe-state-not-observable.md`, to be analysed
and implemented separately. Nothing in this spec is blocked on it, but the probe rollout is
not *observable* until it lands.

#### No custom health metric

An earlier draft of this spec proposed a `health.check.duration` histogram emitted by
`HealthRegistry`. Dropped:

- **There is no OpenTelemetry semantic convention for health checks.** The name would be
  invented, so nothing downstream — no dashboard, no exporter, no mixin — would understand
  it without bespoke wiring.
- It measures **our check's** latency, not the dependency's. Mongo and EMQX already export
  their own metrics into the same Prometheus; a `readyState` field read is not a
  measurement of Mongo.
- Neither Spring Boot Actuator nor the other framework health stacks emit per-indicator
  metrics by default. This is not a gap in the ecosystem; it is a deliberate absence.

If per-dependency latency is ever wanted, it belongs on the real query path — where the
data is already flowing and the number means something — not on a probe endpoint that
reads a cached field every five seconds.

The other rejected alternative was keeping the HTTP metric by filtering spans through a
custom `Sampler` instead of the hook: a sampler runs before span attributes are set, so it
would have to match on the span name (`GET /health/ready`), which Express instrumentation
assigns late and inconsistently. More machinery to preserve rows that should not be in
that histogram anyway.

### Logger — blocked on `toolkit-hub`

There are **two** independent request-log emitters, and silencing one leaves the other:

| Emitter | Fix |
| --- | --- |
| `@tsed/platform-log-request` → `defaultLogResponse` → `$ctx.logger.info({event:'request.end'})` | Ts.ED's native `logger.ignoreUrlPatterns`, defaulted in `getServerDefaultConfig()` (`@radoslavirha/tsed-configuration`) |
| `@radoslavirha/tsed-logger` `Logger.$onResponse` → `httpLog.info('Request completed')` | **New** `requests.ignorePaths` — it reads `$ctx` directly and ignores `alterIgnoreLog` entirely |

Neither is fixable from this repository. Spec written at
`toolkit-hub/docs/superpowers/specs/2026-08-06-health-endpoint-log-exclusion.md`; land and
publish it first, then bump both catalog entries in `pnpm-workspace.yaml`.

---

## Phases

**Phase 0 — `toolkit-hub`** (blocking). Land the logger spec; publish `@radoslavirha/tsed-logger`
and `@radoslavirha/tsed-configuration`; bump both in `pnpm-workspace.yaml` here.

**Phase 1 — `packages/health`.** Contract, registry, roll-up, report, `breakerCheck`,
config schema. Pure logic, no Ts.ED — testable in isolation and the place
to get the semantics right.

**Phase 2 — `packages/tsed-health`.** Token, service, controller, `ShutdownState`,
`createShutdownHandler`, models.

**Phase 3 — `packages/tsed-http-provider`.** Expose `breakers()`. Additive; can land in
parallel with 1–2.

**Phase 4 — the three APIs.** `qr-manager-api` first: one dependency, simplest checks, and
it validates the whole path end to end before `miot-bridge-api` adds MQTT.

**Phase 5 — `packages/otel`.** Trace exclusion.

**Phase 6 — release.** Changesets for the three APIs only. Every `packages/*` member here is
`private: true` — including `@radoslavirha/otel` and `@radoslavirha/tsed-http-provider`,
which this spec modifies — so none of them take a changeset; they ship inside the API
images. `pnpm run verify`. Merge → the release workflow builds images and the deploy action
bumps `image.tag` via each app's `deploy.json`.

Then `homelab` Phase C (chart `lifecycle` + `terminationGracePeriodSeconds`, per-app probe
values, sandbox before production) proceeds unchanged from the upstream plan.

---

## Tests

Vitest, `*.spec.ts` co-located, 90% thresholds as in `tsed-resilience`.

`@radoslavirha/health` — the semantics live here, so this is where the coverage goes:

- Empty registry → `pass`, ready.
- One `critical: true` check failing → overall `fail`, **not** ready.
- One `critical: false` check failing → overall `warn`, **still ready**. The load-bearing case.
- Mixed: a critical `pass` plus a non-critical `fail` → `warn`, ready.
- A check that exceeds its deadline → that check is `fail` with `detail: 'timeout'`, other
  checks still report, and the registry resolves rather than rejecting.
- A check that throws → `fail` with `detail` equal to `error.name`; assert the thrown
  `error.message` (seeded with a fake connection URI) appears **nowhere** in the body.
- `detail` longer than 120 chars is truncated.
- Checks run concurrently: three checks each sleeping 500 ms complete in ~500 ms, not 1500 ms.
- Cache: two evaluations inside the TTL invoke each underlying check once. Single-flight:
  two concurrent evaluations invoke it once.
- The `AbortSignal` passed to `check()` is aborted when the deadline expires.
- `breakerCheck` maps Closed/HalfOpen/Open to pass/warn/fail and defaults to `critical: false`.
- Body contains no key other than `status`, `checks`, `detail`, `observedValue`.

`@radoslavirha/tsed-health` — wiring only:

- `/health/live` is 200 with a failing critical check registered. The single most important
  assertion in the suite: it is what stops a Mongo outage from restarting every pod.
- `/health/ready` is 503 with a failing critical check.
- `/health/ready` is 503 while draining, and `/health/live` is still 200 while draining.
- `/health` is 200 with `status: warn` when only non-critical checks fail.
- `exposeDetail: false` → `/health` body has no `checks` key.
- `HealthController` is absent from the generated Swagger document.
- A readiness failure emits no error-level log (the reason for setting the status rather
  than throwing).

Per-app integration tests alongside the existing `Server.integration.spec.ts`:

- `/health/live` 200.
- **`/health` lists exactly the expected check names** — `['mongodb', 'mqtt']` for
  `miot-bridge-api`, `['mongodb']` for `qr-manager-api`. A check missing its
  `type: HEALTH_CHECKS` is invisible to `injectMany` while still resolving normally, so the
  app would report healthy having checked nothing. Asserting a 200 does not catch this;
  asserting the name set does.
- `/health/ready` reflects a stubbed-down dependency.
- **`/health/ready` is 200 when the dependency is disabled by config** — `mongodb.enabled:
  false` for both Mongo apps, `mqtt.enabled: false` for `miot-bridge-api`. Assert this
  explicitly in each app: it is the case that turns a config-valid deployment into a
  permanently NotReady pod if anyone simplifies the check later.

---

## Verification after deploy

Beyond the upstream plan's checks, three specific to this design:

```sh
# Non-critical failures do not affect readiness. On interactive-map-feeder-api, with an
# upstream broken, /health reports warn while /health/ready stays 200.
kubectl exec -n sandbox deploy/api-iot-interactive-map-feeder-api -- \
  wget -qO- localhost:4000/health

# Liveness is genuinely shallow. Scale Mongo to 0 in sandbox, wait 2 minutes:
# pods go READY 0/1 with RESTARTS unchanged. A restart means a dependency check
# leaked into liveness.
kubectl get pods -n sandbox -w

# Rollout is gapless. Curl the ingress in a loop while restarting; expect zero non-200s.
kubectl rollout restart deploy/api-iot-qr-manager-api -n sandbox
```

---

## Alternatives considered

| Option | Verdict |
| --- | --- |
| **`packages/health` + `packages/tsed-health`, incubated here** | **Chosen.** Mirrors `resilience` / `tsed-resilience` exactly; iterate without a publish cycle; moves to `toolkit-hub` once three consumers agree on the contract. |
| `HealthController` in `toolkit-hub`'s `tsed/platform` (the upstream plan) | Rejected — loads a registry, a cache and a shutdown state machine onto every `BaseServer` consumer, and forces a publish per contract change during the exact period the contract is unstable. |
| `@tsed/terminus` | Rejected — one aggregated path, so live and ready cannot differ; `@godaddy/terminus` is effectively unmaintained. Same verdict as the upstream plan. |
| Health checks executed through `ResiliencePolicy` | Rejected — retry double-counts `failureThreshold`, a breaker at 0.2 rps is meaningless and can poison the real traffic path if shared. Timeout is the only primitive wanted and it is 10 lines. |
| Health *importing* `@radoslavirha/resilience` for the breaker type | **Chosen.** Anyone needing `breakerCheck` already has a breaker, so already has resilience — the dependency is never paid by someone who would not have it anyway. |
| A structural `{ state }` in health instead, to keep it dependency-free | Rejected on implementation — produced two unrelated copies of the same interface and forced health to mirror cockatiel's enum by value, which fails silently on a renumbering. |
| `MongoHealthCheck` shared, behind a `/mongoose` subpath with optional peers | **Chosen.** One implementation, tested once against a real MongoDB. Apps with no database never resolve `mongoose`. |
| `MongoHealthCheck` copied into each Mongo-backed API | Rejected on implementation — two files differing only in comments, both testing a mocked `readyState`, so the premise the `critical: true` design rests on went unverified in either. |
| Active outbound probe of third-party APIs in readiness | Rejected — an outage you cannot fix would delete your own pods from Endpoints, and it adds synthetic load to someone else's service every 5 s. Passive breaker state, non-critical, instead. |
| Binary "register a check" vs "register nothing" for external deps | Rejected — loses the observability entirely and puts the reasoning in a plan document rather than at the registration site. `critical: false` keeps both. |
| No result cache | Rejected — three probes plus `/health` multiply into concurrent evaluations of the same checks; a 1 s single-flight TTL removes the amplification at a staleness below any probe's resolution. |
| Throwing `ServiceUnavailable` for a 503 readiness | Rejected — routes through the exception filter and logs an error per probe. One error line per pod per 5 s during any dependency outage. |
| Custom `Sampler` / filtering `SpanProcessor` to drop probe spans while keeping `http.server.request.duration` | Rejected — a sampler runs before span attributes exist, so it must match on a span name Express assigns late. More machinery to keep rows that dilute the latency SLO anyway. |
| A custom `health.check.duration` metric from `HealthRegistry` | Rejected — no OTel semantic convention exists for health checks, so the name means nothing downstream; and it measures our check, not the dependency, which exports its own metrics already. |
| Relying on kube-state-metrics for readiness **without changing the allow-list** | Rejected — verified against server3's Prometheus that `kube_pod_status_ready` is not collected. Add it in `homelab`; otherwise readiness failures are invisible. |
| Drain via a Ts.ED `$onDestroy` hook | Rejected — verified that `$onDestroy` fires *inside* `destroyInjector()`, concurrently with mongoose and MQTT teardown. Too late. Signal handler instead. |
| `preStop` sleep alone, no in-process drain | Rejected — `preStop` completes *before* SIGTERM, so it covers Endpoints propagation but not requests in flight when the injector is destroyed. Different windows, both needed. |
