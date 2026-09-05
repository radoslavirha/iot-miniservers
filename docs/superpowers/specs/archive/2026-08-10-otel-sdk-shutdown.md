# OpenTelemetry — Shut the SDK Down on Termination

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Repo:** `/Users/radoslavirha/dev/irha/iot-miniservers`.

**Goal:** the OTEL SDK flushes and stops as the last step of graceful shutdown, so the telemetry produced during termination actually reaches the collector.

**Origin:** raised from another repo on 2026-08-10 as two claims — "the SDK is never closed" and "there is no protection against double instantiation across CJS/ESM". The first is real and the loss is larger than the report suggested. The second is largely not a problem here, and the fix proposed for it would not have worked; both are settled below. This file is the authority.

**Size:** one new method plus an exported instance in `packages/otel`, one callback option in `packages/tsed-health`, six call-site lines across the three APIs. No new dependencies, no homelab change.

**Status (2026-08-11):** implemented on `feat/otel-sdk-shutdown`; `pnpm run verify` green. The Verification section below is deploy-time and still outstanding — in particular, confirming the 3s flush fits inside the deployed `terminationGracePeriodSeconds`.

---

## The problem, verified

[`OpenTelemetryService.ts:51-82`](../../../packages/otel/src/OpenTelemetryService.ts#L51-L82) builds a `NodeSDK` in a local `const`, calls `sdk.start()`, and returns. The handle is never stored, so nothing in either process entry graph can call `sdk.shutdown()`. There is no teardown path at all.

### How much is lost, measured from the installed versions

Read out of `node_modules` rather than assumed, at the versions pinned in [`pnpm-workspace.yaml`](../../../pnpm-workspace.yaml) (`otel` catalog):

| Signal | Processor | Default flush interval | Worst-case loss per termination |
| --- | --- | --- | --- |
| Traces | `BatchSpanProcessor` (via `traceExporter`) | `scheduledDelayMillis ?? 5000` | 5s |
| Logs | `BatchLogRecordProcessor` | `scheduledDelayMillis ?? 1000` | 1s |
| **Metrics** | `PeriodicExportingMetricReader` | `exportIntervalMillis = 60000` | **60s** |

**Metrics are the real damage, not traces.** The report led with spans; the 60s metric interval is twelve times the drain window and is silently discarded on every rollout.

### Why it is silent

`PeriodicExportingMetricReader` calls `this._interval.unref()`. The pending collect therefore does not hold the event loop open, and [`createShutdownHandler`](../../../packages/tsed-health/src/createShutdownHandler.ts) deliberately never calls `process.exit` — the process ends when the loop drains. So the queued batches are dropped with no error, no log and no non-zero exit. Nothing about the current behaviour looks wrong from the outside.

### Why the lost window is the expensive one

`DEFAULT_DRAIN_DELAY_MS` is 5s ([`createShutdownHandler.ts:28`](../../../packages/tsed-health/src/createShutdownHandler.ts#L28)). The data thrown away is precisely the drain: readiness flipping to 503, in-flight requests finishing, mongoose and MQTT disconnecting. That is the interval [`specs/2026-08-06-backend-health-checks.md`](2026-08-06-backend-health-checks.md) exists to make observable, and it is the one interval that never reaches the collector.

### Not reproducible in dev

`pnpm start` is `nodemon src/index.ts` with no `--import`, so `instrument.ts` never runs and no SDK exists. Only `start:prod` loads it:

```jsonc
"start:prod": "node --import @swc-node/register/esm-register --import /home/app/dist/otel/instrument.js dist/index.js"
```

Every part of this design must therefore no-op cleanly when the SDK was never started — that is the normal case locally and in every test run.

---

## The ordering constraint that drives the design

`--import ./dist/otel/instrument.js` is evaluated **before** `dist/index.js`. Node runs signal listeners in registration order. So a `process.on('SIGTERM', …)` registered inside `OpenTelemetryService` would always fire *first* — before `beginDrain()`, before the 5s wait, before `platform.stop()`.

That is worse than the current bug: it would flush an empty-ish batch, then tear down instrumentation for the entire drain, losing the same window it was added to save.

**The flush must run last, after `await platform.stop()`, and the ordering must be explicit.** Self-registering signal handlers inside the otel package are rejected outright.

---

## Decision 1 — an exported instance, not a module-level variable

```ts
// packages/otel/src/OpenTelemetryService.ts
export class OpenTelemetryService {
    private sdk: NodeSDK | undefined;

    public init(options: OtelBootstrapOptions): void { /* … */ }
    public async shutdown(timeoutMs = DEFAULT_OTEL_SHUTDOWN_MS): Promise<void> { /* … */ }
}

/**
 * Process-wide instance. `instrument.js` and `index.js` are separate `--import` entry
 * graphs but share one module registry, so both resolve this to the same object — that
 * is how teardown in the app entrypoint reaches an SDK started before it ran.
 */
export const openTelemetry = new OpenTelemetryService();
```

Options move from the constructor to `init()`.

**The trap this avoids, written down because it is not obvious:** calling `new OpenTelemetryService().shutdown()` from `index.ts` *cannot* work. It is a fresh instance with an empty `sdk`, so it no-ops silently — the same failure mode as today, but now with code that looks like it handles shutdown. Anyone reaching for the handle must use the exported instance.

Rejected alternatives:

- **A free `let activeSdk` at module scope.** Works identically at runtime, but tests cannot isolate it — no way to reset between cases. State on a private field keeps the class exported for throwaway instances in tests while the singleton serves production. (The field is a TS `private`, not a `#` private: no `#` field appears anywhere in `packages/`.)
- **`globalThis[Symbol.for('@radoslavirha/otel.sdk')]`.** Only buys reach across *separate copies* of the module. Nothing here has that problem (see Decision 5), so it adds a genuine global for no gain.
- **`import { otel } from './otel/instrument.js'` in `index.ts`.** Works in prod — the absolute `--import` path and the relative import resolve to the same URL, so no re-execution. Breaks dev: `nodemon src/index.ts` has no `--import`, so the import would newly *execute* `instrument.ts` and start an SDK where none exists today. Silent dev/prod divergence, and dependent on an import staying in first source position against lint-driven reordering.

---

## Decision 2 — `onStopped` on `createShutdownHandler`, not a call-site `await`

The obvious wiring is wrong in a way that only shows up on the second signal:

```ts
// Do not do this.
SIG_EVENTS.forEach((evt) => process.on(evt, async () => {
    await shutdown();
    await openTelemetry.shutdown();
}));
```

A second signal is routine — kubelet follows SIGTERM with SIGKILL and process managers often send several, which is why the re-entry guard at [`createShutdownHandler.ts:64-67`](../../../packages/tsed-health/src/createShutdownHandler.ts#L64-L67) exists. On re-entry `shutdown()` returns *immediately* rather than awaiting the first run, so the second signal would flush and stop the SDK mid-drain, while the first shutdown is still waiting out `drainDelayMs`.

Putting the hook inside the existing guard fixes it, keeps the three `index.ts` files identical, and keeps `tsed-health` otel-agnostic — it takes a callback, not a dependency:

```ts
/**
 * Runs after the platform is fully stopped. For flushing telemetry — anything that must
 * outlive the listeners but must not delay the drain.
 */
onStopped?: () => Promise<void> | void;
```

---

## Decision 3 — the flush is time-boxed

`sdk.shutdown()` is awaited against a timeout race:

```ts
await Promise.race([sdk.shutdown(), delay(timeoutMs)]).catch(() => undefined);
```

The OTLP exporters retry. Against an unreachable collector — the exact condition during a cluster-wide disruption, when several pods terminate at once — an unbounded flush burns the rest of `terminationGracePeriodSeconds` and earns a SIGKILL, which loses strictly more than giving up early would. 3s default.

The budget rule from [`ShutdownHandlerOptions`](../../../packages/tsed-health/src/createShutdownHandler.ts#L10-L26) gains a term: **`preStop` + `drainDelayMs` + teardown + `otelShutdownMs` must fit inside `terminationGracePeriodSeconds`.**

---

## Decision 4 — flush on the crash path too

[`index.ts:67-75`](../../../apis/qr-manager-api/src/index.ts#L67-L75) handles `uncaughtException` / `unhandledRejection` by logging and calling `platform.stop()`. Today that path drops the crash's own spans and logs — the trace most worth having. It gets the same flush, after `platform.stop()`.

---

## Decision 5 — the double-instantiation claim, declined

The report also asked for a CJS/ESM double-instantiation guard implemented as "save the SDK and check whether one was already created". Assessed and mostly declined:

1. **The proposed fix does not do what it claims.** A module-scoped flag cannot prevent CJS/ESM double loading — each copy of the module gets its own scope, so each would hold its own flag and start its own SDK. Guarding across copies needs process-global state; a per-module check is unrelated to the stated failure.
2. **The scenario does not arise here.** [`packages/otel/package.json`](../../../packages/otel/package.json) publishes both `dist/cjs` and `dist/esm`, so the copy exists — but all three APIs are `"type": "module"` with a single `--import` entry, and nothing in the workspace `require()`s the package. The CJS copy is never loaded.
3. **The blast radius is already bounded.** `@opentelemetry/api` refuses duplicate global registration (`Attempted duplicate registration of API: trace`) and keeps the first provider. A second SDK would waste exporters, not corrupt the first one's output.

What *is* worth keeping is plain idempotency within one instance: `init()` called twice should return rather than start a second SDK. That is one line and it is a different property from the one that was asked for.

---

## Rejected: reading the providers back out of `@opentelemetry/api`

Considered because it needs no handle at all — `sdk.start()` has already registered the providers globally, so shutdown could read them back:

```ts
const provider = trace.getTracerProvider();
const delegate = provider instanceof ProxyTracerProvider ? provider.getDelegate() : provider;
await (delegate as BasicTracerProvider).shutdown();
```

`getDelegate()` is public on `ProxyTracerProvider` in api 1.9.x, so this works. Rejected on three counts:

- **It casts through interfaces the API deliberately keeps narrow.** `TracerProvider` and `MeterProvider` at the api level expose no `shutdown` — that is SDK surface. Every line needs a cast into internals.
- **Logs would need a new direct dependency.** `logs` is not in `@opentelemetry/api`; it lives in `@opentelemetry/api-logs` (0.221.0, currently only transitive). It would have to be added to `packages/otel` — and log records are one of the two batched signals being rescued.
- **`ProxyTracerProvider` / `getDelegate` are 1.x-shaped**, version-fragile in a way `sdk.shutdown()` is not.

Net: three casts, an added dependency and version risk, to avoid one private field inside the module that already owns the SDK.

---

## Rejected: a Ts.ED provider with `$onDestroy`

Wrong moment, per the comment already at [`index.ts:58-60`](../../../apis/qr-manager-api/src/index.ts#L58-L60): `platform.stop()` is `destroyInjector()` **then** close the listeners. `$onDestroy` fires while the server still accepts connections, so anything emitted during listener close lands after the flush. It is the same reason the drain is driven from `index.ts` rather than a lifecycle hook. The SDK is also not in the container — it would have to be wrapped in a provider purely to obtain a hook that fires too early.

---

## Steps

### 1. `packages/otel`

- [x] `OpenTelemetryService`: add `sdk: NodeSDK | undefined`; move `OtelBootstrapOptions` from the constructor to `init(options)`; assign `this.sdk = sdk` after `sdk.start()`.
- [x] `init()`: return early when `this.sdk` is already set (Decision 5's idempotency only — do not add a `globalThis` guard).
- [x] Add `shutdown(timeoutMs = DEFAULT_OTEL_SHUTDOWN_MS)`, using `setTimeout as delay` from `node:timers/promises`. Clear `sdk` **before** awaiting, so a concurrent second call is a no-op rather than a second `sdk.shutdown()`. Swallow errors — a failed flush must never turn a clean termination into a crash.
- [x] TSDoc on `shutdown()` must state both non-obvious facts: it no-ops when `init()` never ran (`pnpm start` has no `--import`; tests never bootstrap), and the timeout exists because the OTLP exporter retries against a dead collector.
- [x] Export `openTelemetry` from [`packages/otel/src/index.ts`](../../../packages/otel/src/index.ts), keeping the `OpenTelemetryService` class export for tests.

### 2. `packages/tsed-health`

- [x] Add `onStopped?: () => Promise<void> | void` to `ShutdownHandlerOptions`, awaited after `onShutdown?.('stopped')` and inside the re-entry guard.
- [x] Extend the sequence TSDoc with step 5 and the reason it is inside the guard (Decision 2) — the second-signal race is invisible from the code alone.
- [x] Add the `otelShutdownMs` term to the `drainDelayMs` budget note.

### 3. The three APIs

- [x] `apis/*/src/otel/instrument.ts` — `new OpenTelemetryService({…}).init()` → `openTelemetry.init({…})`. All three keep their own `extraInstrumentations`.
- [x] `apis/*/src/index.ts` — add `onStopped: () => openTelemetry.shutdown()` to the `createShutdownHandler` options.
- [x] `apis/*/src/index.ts` — add `await openTelemetry.shutdown()` after `platform.stop()` in the `uncaughtException` / `unhandledRejection` handler.

### 4. Tests

- [x] `packages/otel` — `shutdown()` before any `init()` resolves without throwing; `shutdown()` after `init()` calls `sdk.shutdown()` once; a `sdk.shutdown()` that never settles is abandoned at the timeout instead of hanging; a rejecting `sdk.shutdown()` does not propagate.
- [x] `packages/tsed-health` — `onStopped` runs after `platform.stop()` and never before; a second signal during the drain does **not** trigger it a second time. This is the regression test for Decision 2; without it the race returns the first time someone inlines the call.

### 5. Release

- [x] Changesets: minor for `@radoslavirha/otel` (the `init()` signature moves) and `@radoslavirha/tsed-health` (additive option); patch for the three APIs.
- [x] `pnpm run verify`.
- [ ] No homelab change. `terminationGracePeriodSeconds` already covers `preStop + 5s drain + teardown`; 3s of flush fits the existing budget, but confirm against the deployed values before merging rather than assuming.

---

## Verification

- [ ] Unit tests above pass.
- [ ] Local, against a running collector: start an API with `start:prod`, send one request, `SIGTERM`, and confirm the request's span **and** a final metric export both arrive. Today the metric export cannot arrive — the 60s interval means a short-lived process never exports at all — so this is the check that proves the fix rather than restating it.
- [ ] Local: with the collector stopped, `SIGTERM` still terminates within roughly `drainDelayMs + 3s`. If it hangs, the timeout race is not wired.
- [ ] Local: `pnpm start` (no `--import`) starts, serves and shuts down unchanged — `shutdown()` no-ops.
- [ ] Sandbox: `kubectl delete pod`, then confirm in Grafana that spans and logs from the drain window are present and the pod terminated inside its grace period without SIGKILL.
- [ ] Sandbox: rollout stays gapless — `RESTARTS` unchanged, no non-200s during a restart loop. The flush is after `platform.stop()`, so it must not be able to affect this; if it does, the hook is wired in the wrong place.

---

## Out of scope

- A `globalThis` CJS/ESM guard (Decision 5). Revisit only if a CJS consumer of `@radoslavirha/otel` ever appears.
- An on-demand `forceFlush()` for callers that want to flush without stopping. No caller wants it yet.
- Metric export interval tuning. 60s is the right steady-state interval; the problem was the missing final export, not the cadence.
