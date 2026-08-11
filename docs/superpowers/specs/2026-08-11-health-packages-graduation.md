# Graduating the Health Packages to toolkit-hub

> **Status:** Planned — expected soon.
> **Repos:** `iot-miniservers` (source) → `toolkit-hub` (destination).
> **Related:** [`2026-08-06-backend-health-checks.md`](./2026-08-06-backend-health-checks.md), which
> built these packages here and always intended this move.

## Goal

Move `@radoslavirha/health` and `@radoslavirha/tsed-health` from `packages/` here into
`toolkit-hub`, and **relocate `MongoHealthCheck` into `@radoslavirha/tsed-mongoose`** on the
way.

The second half is the point. The first half is bookkeeping.

## Why `MongoHealthCheck` belongs in `tsed-mongoose`

It sits in `tsed-health` today for one reason: `tsed-mongoose` lives in `toolkit-hub` and
cannot depend on a package that only exists in this repo. That constraint disappears the
moment `tsed-health` is published.

`tsed-mongoose` is the right owner because it already is the Mongo package — it declares
`mongoose` and `@tsed/mongoose` as peer *and* dev dependencies, wires
`@tsed/testcontainers-mongo` through `globalSetup`, and owns `MongoConfigSchema`,
`MongoRepository` and `MongoMapper`. A health check that reads
`MongooseService.get()?.readyState` is Mongo code that happens to produce a health-shaped
result, not health code that happens to touch Mongo.

What that buys `tsed-health`:

| Today | After |
| --- | --- |
| Two build entries (`index`, `mongoose`) | One |
| `exports` map with a `./mongoose` subpath | Plain single export |
| `mongoose` + `@tsed/mongoose` as optional peers | None |
| `peerDependenciesMeta` block | Gone |
| `@tsed/testcontainers-mongo` in devDeps | See [open question](#open-question-does-tsed-health-still-need-testcontainers) |

All of that machinery exists purely to keep an optional Mongo dependency from reaching
consumers who have no database. Move the check and it is all unnecessary.

## Ordering

The dependency direction forces this:

1. **`health` and `tsed-health` graduate to `toolkit-hub` and are published.** Nothing else
   can proceed — `tsed-mongoose` needs a real published `@radoslavirha/tsed-health` to peer on.
2. **`MongoHealthCheck` moves into `tsed-mongoose`.**
3. **`iot-miniservers` switches imports** and drops the workspace packages.

Steps 1 and 2 could ship as one `toolkit-hub` release. Step 3 is a separate PR here.

## Step 1 — `toolkit-hub`: take the packages

- `packages/health/` ← `packages/health/` (framework-agnostic; `zod` +
  `@radoslavirha/resilience` runtime deps).
- `tsed/health/` ← `packages/tsed-health/`, **minus `src/mongoose.ts` and its spec**.
- Drop from `tsed/health`'s `package.json`: the `./mongoose` export, `peerDependenciesMeta`,
  and the `mongoose` / `@tsed/mongoose` peers.
- Restore `tsdown.config.ts` to the shared `[cjsConfig, esmConfig]` default — the
  `entry` override exists only for the second entry.
- Keep `src/test/TestHealthProvider.ts`. `HealthCheckService` takes a plain config object
  that Ts.ED cannot resolve, so **every** consumer overrides the token — the test suite
  included. This mirrors `TestLoggerProvider` in `tsed/logger`.
- Publish both. `health` is a normal `packages/*` member; `tsed/health` follows the
  `tsed/*` convention (peer deps on `@tsed/*`, never runtime deps).

## Step 2 — `toolkit-hub`: `MongoHealthCheck` into `tsed-mongoose`

- Move `src/mongoose.ts` → `tsed/mongoose/src/health/MongoHealthCheck.ts`, and
  `src/mongoose.spec.ts` → alongside it. Rename the class file to match the class, and
  export it through the existing barrel — an `index.ts` re-exports and nothing else.
- Add `@radoslavirha/tsed-health` to `tsed/mongoose`'s **peer** and **dev** dependencies.
  Peer, not runtime: an app using `tsed-mongoose` without health checks should not be forced
  to install the health packages. Consider `peerDependenciesMeta.optional` if that turns out
  to matter in practice.
- The check needs `HEALTH_CHECKS` (a value) and `HealthCheck` / `HealthCheckResult` /
  `HealthStatus` from `@radoslavirha/tsed-health`. `HEALTH_CHECKS` and `HealthStatus` are
  runtime values — `import type` will not do.
- `tsed/mongoose` already has `globalSetup` for testcontainers, so `mongoose.spec.ts` should
  run unchanged. It is the reason this move is safe: the spec proves against a **real**
  MongoDB that `readyState` is genuinely `1` on a live connection and genuinely drops to `0`
  on close. That premise is what the check's `critical: true` rests on, and it must survive
  the move intact.
- Delete `TestMongoServer.ts` from `tsed/health` — it exists only to host that spec.

## Step 3 — `iot-miniservers`: switch over

- `pnpm-workspace.yaml` catalog: add `@radoslavirha/health` and `@radoslavirha/tsed-health`;
  bump `@radoslavirha/tsed-mongoose`.
- Change every app dependency from `workspace:*` to `catalog:`.
- Rewrite the four import sites — all of them re-export or import the same symbol:

  ```diff
  - export { MongoHealthCheck } from '@radoslavirha/tsed-health/mongoose';
  + export { MongoHealthCheck } from '@radoslavirha/tsed-mongoose';
  ```

  | File | Kind |
  | --- | --- |
  | `apis/qr-manager-api/src/health/index.ts` | re-export (registers it) |
  | `apis/qr-manager-api/src/health/Health.integration.spec.ts` | import |
  | `apis/miot-bridge-api/src/health/index.ts` | re-export (registers it) |
  | `apis/miot-bridge-api/src/health/Health.integration.spec.ts` | import |

- Delete `packages/health/` and `packages/tsed-health/`, and their two entries in
  `.github/paths-filter-packages.yaml`.
- No changesets for the deleted packages — both are `private: true`.
- Update `docs/KNOWLEDGE.md` (both rows), `AGENTS.md` (the Health checks section names the
  subpath), and the app READMEs if they reference it.

## Open question — does `tsed-health` still need testcontainers?

Once `MongoHealthCheck` leaves, `tsed/health` has no Mongo-specific code, and
`@tsed/testcontainers-mongo` + `mongoose` in its devDeps are justified only if we still want
a **real-I/O test of the registry itself**: that the per-check `AbortSignal` genuinely
cancels an in-flight query, which the current `sleep()`-based specs cannot prove because a
`setTimeout` ignores signals in a way real drivers do not.

`packages/resilience` here does exactly that — throwaway mongoose model, real container, no
mongoose runtime dependency — so there is precedent either way. Decide at migration time;
dropping it is the smaller package, keeping it is the stronger guarantee.

## Verification

- `pnpm run verify` green in both repos.
- `apis/interactive-map-feeder-api` has **no** `mongoose` anywhere in its resolved tree — it
  is the app that proves the optional-dependency story actually worked:
  `pnpm --filter interactive-map-feeder-api why mongoose` should find nothing.
- `/health` on both Mongo-backed APIs still lists `mongodb` among its checks. A check that
  loses its `type: HEALTH_CHECKS` tag in the move resolves normally and is silently never
  evaluated — the app would report healthy having checked nothing. The existing
  "Should register exactly the expected checks" assertions are what catch it; make sure they
  survive.
- `mongoose.spec.ts` still runs against a real container in its new home.

## What not to do

- **Do not re-duplicate the check per app.** It was two files differing only in comments,
  both tested against a mocked `readyState`. That is what this whole line of work removed.
- **Do not make `tsed-health` depend on `mongoose` at runtime.** If the subpath is ever
  reintroduced, it stays an optional peer.
- **Do not drop `TestHealthProvider`.** Without an override, `HealthCheckService` cannot be
  resolved at all — the failure is `Given token is undefined`, which reads like a circular
  dependency and wastes an afternoon.
