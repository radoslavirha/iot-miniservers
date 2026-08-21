# AGENTS.md — AI Agent Instructions

All agentic tools (skill, instruction, agents,..) authored **in this repository** must be added to the `.apm` folder. Example Structure:
```
repository/
+-- apm.yml            // APM manifest - edit only via the `apm` CLI
+-- apm.lock.yaml      // resolved commits - generated, committed
+-- .apm/              // repo-authored sources - tracked in git
|   +-- skills/
|   |   +-- example-skill/
|   |       +-- SKILL.md
|   +-- agents/
|   |   +-- example.agent.md
|   +-- instructions/
```

`apm install` deploys those sources, plus every installed toolkit-hub plugin, into
`.agents/`, `.claude/` and `.github/instructions/`. **Those three directories are generated
and gitignored — never edit a file in them.** APM refuses to manage a file it did not write,
so the edit is lost on the next `apm install`/`apm update` and never reaches anyone else.
Change the source under `.apm/` (or the upstream toolkit-hub plugin) and redeploy instead.
Run `apm install` after cloning to materialise them.

## Repository Overview

This is a **pnpm monorepo** containing small independent Node.js APIs built with **Ts.ED** framework.

## Tech Stack

- **Runtime**: Node.js 24+
- **Package manager**: pnpm 11+ (workspaces)
- **Language**: TypeScript with `@radoslavirha/config-typescript` (ESM, `.js` extensions in imports)
- **Framework**: Ts.ED with `@radoslavirha/tsed-*`
- **Testing**: Vitest with `@radoslavirha/config-vitest`
- **Linting**: ESLint with `@radoslavirha/config-eslint`
- **Versioning**: Changesets

## Package Registry

All `@radoslavirha/*` packages are hosted on **GitHub Packages** (`npm.pkg.github.com`), not the public npm registry. The root `.npmrc` configures this scope.

- `NODE_AUTH_TOKEN` must be set in the environment before running `pnpm install`, it's in `.env`

Always use [toolkit-hub](https://github.com/radoslavirha/toolkit-hub) where possible and avoid creating own logic if already exist in toolkit-hub. All `@radoslavirha/*` libraries are provided there.

### Catalog updates are automated

`renovate.json` keeps the `@radoslavirha/*` entries in the `pnpm-workspace.yaml` catalog
moving on their own — **do not hand-bump them**. Renovate opens one grouped `toolkit-hub` PR,
and patch/minor merge themselves once the `Verify workspace` CI job is green. Majors wait for
a review. Every other dependency in this repo is still a deliberate manual bump.

Two things there are load-bearing and easy to break:

- The rule carries an explicit `registryUrls`. Renovate attaches a package file's `.npmrc` to
  `package.json` files only, so without it the catalog entries get looked up on
  `registry.npmjs.org` and every one of them 404s — silently, as "no updates found".
- `rangeStrategy` is `bump`, so a release inside the existing range (`^0.5.7` -> `0.5.8`) still
  moves the catalog entry. The default `replace` would touch only `pnpm-lock.yaml`.

Local `packages/*` are also named `@radoslavirha/*`, but they are consumed as `workspace:*`
and Renovate skips them.

## Toolkit-hub Agent Skills

Every toolkit package this repo depends on ships its own skill, installed from the
`toolkit-hub` APM marketplace. **Read the skill before writing code against a package** —
they document the current API, including renames the old shapes leave traps behind for.

| Skill | Read it when |
| --- | --- |
| `adopting-toolkit-hub` | adding/updating/removing a `@radoslavirha/*` dependency, or an install returns 401/404 from GitHub Packages |
| `building-a-tsed-service` | starting a new service — which packages a shape needs, layer order, bootstrap sequence |
| `using-utils` | any null/undefined/empty guard, `buildModel*`, `MappingUtils` |
| `using-tsed-platform` | `Server` class, `Platform.bootstrap`, middleware, `BaseHandler` |
| `using-tsed-configuration` | config schema, adding a config value, `ConfigProvider` |
| `using-tsed-common` | `BaseModel`, `Serializer`, `JSONSchemaValidator` / `ZodValidator` |
| `using-tsed-mongoose` | documents, mappers, repositories, refs and populated fields |
| `using-tsed-swagger` | OpenAPI versions, security schemes, `SwaggerProvider` |
| `using-tsed-logger` | injecting `Logger`, `child()` scopes, subclassing the toolkit logger |
| `using-redaction` | logging anything that may carry secrets |
| `using-config-eslint` / `-typescript` / `-vitest` / `-tsdown` | adding or changing a package's `eslint.config.mjs`, `tsconfig.json`, `vitest.config.ts`, `tsdown.config.ts` |

Repo-local skills live in `.apm/skills/`: `add-workspace-member`, `instrument-entry-point`,
`onboard-to-homelab`, `update-docs`.

Managing them:

```bash
apm install                                    # deploy everything in apm.yml
apm marketplace browse toolkit-hub             # see the full plugin catalog
apm install <name>@toolkit-hub --target claude,copilot
apm update                                     # move unpinned deps forward
```

Dependencies are intentionally unpinned, so `apm install` warns about drift — `apm.lock.yaml`
pins the resolved commit, and guidance should not lag the code it describes.

## Monorepo Structure

```text
apis/<api-name>/
  src/
    controllers/          # Ts.ED HTTP controllers — one file per resource. SINGLETON scoped when possible.
    endpoints/            # External API/data source wrappers (not HTTP controllers).
      <API group>/
        dto/              # DTO models for endpoints.
        *Endpoint.ts      # Endpoint service that accepts/returns only DTOs. SINGLETON scoped when possible.
    handlers/             # Per-endpoint business logic. Orchestrate services/mappers. SINGLETON scoped when possible.
    mappers/              # Bi-directional mapper services (DTO ↔ model). Never use services or endpoints. SINGLETON scoped when possible.
    models/               # Ts.ED schema models, enums, request/response types. Use sub-folders to group (`config/`, etc.).
    services/             # Reusable, stateless business logic. Includes ConfigService, storage facades, etc. SINGLETON scoped when possible.
    storage/
      <storage group>/    # Per backend + entity (e.g. `qr-mongo/`, `device-local-storage/`).
        dto/              # DTO models for storage repositories.
        *Repository.ts    # Repository service that accepts/returns only DTOs. SINGLETON scoped when possible.
    otel/                 # OpenTelemetry bootstrap (`instrument.ts`), per-API OTel config, and `telemetry.ts` — the span names, tracer scopes, `job.name` values and app attribute keys this API emits.
    ModelGroups.ts        # Groups used in `@Groups()` decorator. Groups belong on Controller endpoints (request/response models) and Models. If `@Groups()` is used in a child model, the parent model must use `@ForwardGroups()` on that property.
    Server.ts
    index.ts
```

There is no `v1/` folder and no API version prefix in routes — all controllers mount at `/`. Versioning is handled at the package level via Changesets, not inside route paths.

```text
ui/<ui-name>/
  src/
    api/                  # Typed REST clients consumed by pages/components.
    components/           # Presentational React components.
    pages/                # Route components — orchestrate api/ clients and components/.
    runtime/              # Runtime config bootstrap (loaded from `public/config.json`, replaced by ConfigMap in k8s).
    App.tsx               # Root component with router definitions.
    main.tsx              # Awaits runtime config, mounts <App />.
    styles.css
  public/
    config.json           # Dev defaults; production replaced by mounted ConfigMap.
  index.html              # Bootstrap script that fetches /config.json before any JS.
  nginx.conf              # Production nginx config — SPA fallback + no-cache for /config.json.
```

## Coding Conventions

### General

- Always use **ESM** imports with explicit `.js` extensions (e.g. `import { Foo } from './Foo.js'`)
- Avoid constructing DTOs and calling endpoints/repositories from handlers. Delegate DTO construction to services.
- Use `@radoslavirha/*` packages from [toolkit-hub](https://github.com/radoslavirha/toolkit-hub)
- always use class member visibility modifiers

### Dependency Injection (Ts.ED)

- **Controllers**: `@Controller`, `@Scope(ProviderScope.SINGLETON)`
- **Handlers**: `@Injectable`, `@Scope(ProviderScope.SINGLETON)`
- **Services**: `@Service`, `@Scope(ProviderScope.SINGLETON)`
- Inject dependencies via constructor parameters.

### Models

- Decorate all properties with `@tsed/schema` decorators: `@Property(String)`, `@Required`, `@Description`, `@Example`
- Use `@AdditionalProperties(false)` on all model classes
- Export all models from `models/index.ts`
- DTO models do not need `@Description` decorator, use JSDoc.
- Endpoint request/response models follow CamelCase `{Resource}{HTTP Method}{Request/Response}` convention
- always build models using `CommonUtils.buildModelStrict` / `CommonUtils.buildModelPartial` / `CommonUtils.buildModelCore` from `@radoslavirha/utils` (`buildModelStrict` for fully-defined models, `buildModelPartial` for partial/patch-like data, `buildModelCore` only for shared low-level model-building helpers)

### Enums

- Enum **values are always `UPPER_SNAKE_CASE`**. Members and the type stay `PascalCase`:

  ```ts
  export enum ExternalApi {
      ChmiPortal = 'CHMI_PORTAL',
      ChmiOpendata = 'CHMI_OPENDATA'
  }
  ```

- One enum per file, named `<Name>.enum.ts`.
- **Exception — DTO enums.** Enums under `endpoints/*/dto/` and `storage/*/dto/` mirror an
  external wire format, so their values must match that format exactly, whatever its casing
  (e.g. `MiotSpecV2PropertyAccessDTO.Read = 'read'`, because miot-spec.org sends `read`).
  The internal model enum it maps to still uses `UPPER_SNAKE_CASE`
  (`MiotSpecV2PropertyAccess.Read = 'READ'`).
- A few older enums still carry lowercase values (e.g. `DataSources.Radar = 'radar'`,
  `SwaggerDocs.API = 'api'`); they predate this rule and are migrated opportunistically, not in
  bulk, since values are part of the external contract (routes, config keys, stored data).

### Mappers

- Always do bi-directional mapping between DTO <-> Model.
- Extend `MappingUtils` from `@radoslavirha/utils`
- Export all from `mappers/index.ts`

### Services & Handlers

- Services contain reusable, stateless logic
- Handlers orchestrate services for a specific use case and map to controller actions
- Export all from `services/index.ts` and `handlers/index.ts`
- avoid constructing models, delegate to mappers

### Controllers

- One controller file per resource
- Use `@Docs(version)` for Swagger grouping
- Use `@Returns(...)` with proper content types
- Export from `controllers/index.ts`

## Testing

- Framework: **Vitest**
- Unit test files: `*.spec.ts` co-located with source files
- Integration tests: `*.integration.spec.ts` using `PlatformTest` from `@tsed/platform-http/testing`
- Run tests: `pnpm test` inside the API directory

## Adding a New API

1. Create `apis/<api-name>/` with the following required files — all must be present or the API will not start:

   | File | Notes |
   |---|---|
   | `package.json` | Set `name`, `description`; keep all `@radoslavirha/*` and `@tsed/*` at the same versions as other APIs; |
   | `tsconfig.json` | Extends `@radoslavirha/config-typescript/tsconfig.json`; set `composite: false` |
   | `eslint.config.mjs` | Usually identical across all APIs |
   | `nodemon.json` | Usually identical across all APIs |
   | `.swcrc` | Usually identical across all APIs |
   | `vitest.config.ts` | Usually identical across all APIs |
   | `config/localhost.json` | Set `server.httpPort` |
   | `config/test.json` | Set `server.httpPort` |
   | `src/models/config/ConfigModel.ts` | Extends `BaseConfig`; add API-specific config fields here |
   | `src/services/ConfigService.ts` | Standard `ConfigProvider<ConfigModel>` — identical across APIs |
   | `src/Server.ts` | Mount `SwaggerController` and `HealthController` at `/` plus controllers from `controllers/index.ts` |
   | `src/index.ts` | Bootstrap entrypoint — identical across APIs |
   | `src/health/index.ts` | Health checks — see [Health checks](#health-checks) |
   | `src/otel/instrument.ts` | OTel SDK preload (loaded via `node --import` in `start:prod`) |

2. New workspace members are auto-discovered via `apis/*` glob in `pnpm-workspace.yaml` — no changes needed there.
3. Run `pnpm install` from the repo root (requires `NODE_AUTH_TOKEN` in env).
4. Add a `.README.md`.
5. Add a `Dockerfile` stage in the root `Dockerfile` following the `qr-manager-api` pattern (deps → build → final image with `pnpm start:prod`).

## Health checks

Every API exposes `/health/live`, `/health/ready` and `/health` via `HealthController` from
`@radoslavirha/tsed-health`. Full guidance is in that package's
[README](./packages/tsed-health/README.md); the rules that matter when adding an API:

- **Do not write your own MongoDB check.** `@radoslavirha/tsed-health/mongoose` ships one —
  re-export it from the app's health barrel, which is what registers it:

  ```ts
  export { MongoHealthCheck } from '@radoslavirha/tsed-health/mongoose';
  ```

  It sits behind a subpath because `mongoose` and `@tsed/mongoose` are *optional* peers, so
  an app with no database never resolves them. Write a check in the app only when the
  dependency is genuinely app-specific (`MqttHealthCheck` in `miot-bridge-api`); anything a
  second app would duplicate belongs in the package.
- **Tag every app-local check with `@Injectable({ type: HEALTH_CHECKS })`** and import the
  `src/health/index.ts` barrel from `Server.ts` for its side effect. A check with a bare
  `@Injectable()` resolves normally but is invisible to `injectMany` — the app then reports
  healthy having checked nothing. Assert the expected check names in an integration test;
  asserting that `/health` returns 200 does not catch it.
- **Mount `HealthController` at `/`**, never under a version prefix — the probe path must be
  identical across apps or the Helm chart's probe block stops being copy-paste.
  `interactive-map-feeder-api` mounts its own controllers at `/v1` and health still at `/`.
- **Mind mount order against catch-all routes.** `qr-manager-api`'s `RedirectController` is
  `@Controller('/')` with `@Get('/:slug')`, which matches `/health` too. `HealthController`
  must come first in the `mount` array. `/health/live` and `/health/ready` are two segments
  and keep working either way, so a reorder leaves every probe green while `/health`
  silently becomes a slug lookup.
- **Set `critical` deliberately.** `true` only for dependencies without which this pod can
  do nothing (its own database, its own broker). `false` for anything you cannot fix by
  restarting or rescheduling this pod — third-party APIs above all, since failing readiness
  on their behalf turns someone else's outage into ours.
- **A dependency disabled by config must report `pass`.** Returning `fail` leaves a
  correctly-configured deployment permanently NotReady, silently, with no restart and no
  error log — liveness is shallow by design and will not catch it.
- **Never put a URL, hostname, credential or stack trace in `detail`** — `/health` is
  readable by anything that can reach the pod.
- **Drain on SIGTERM** with `createShutdownHandler(platform)` in `index.ts`. Do not register
  it for `beforeExit`: that fires when the event loop empties, not on a signal.
- Add `health: HealthConfigSchema.optional()` to `ConfigModel`, and a `HealthProvider`
  overriding the `HealthCheckService` token to supply it.

Probe traffic is excluded from traces in `packages/otel` and from request logs by
`@radoslavirha/tsed-logger`'s `requests.ignorePaths` default — no per-API wiring needed.

## Instrumenting Entry Points

HTTP and MQTT already root their own traces. **Anything else that starts work must root one
itself** — a timer, a poller, a socket listener, a queue consumer, a `$onInit` task. Skipping it
breaks two things silently: every auto-instrumented call underneath becomes its own parentless
trace, and every log line underneath loses `trace_id` — `WinstonInstrumentation` reads it off the
active span, so a log with no trace context is a missing span, never a logger problem.

**Scheduled work — a timer, cron or startup task — uses `runJob`, which emits the span *and* the
`job.*` metrics from one call:**

```ts
import { runJob, recordJobSkip, withEntryPointSpan, withClientSpan } from '@radoslavirha/otel';

// scheduled work → span + metrics
await runJob({ name: JOB_POLL_DEVICE_PROPERTIES, tracer: POLLER_TRACER_NAME, spanName: SPAN_POLL_TICK },
    async ({ recordItem }) => { … });

// inbound traffic (UDP datagram, queue message) → span only, it is not a job
await withEntryPointSpan({ name: SPAN_UDP_COMMAND, tracer: UDP_TRACER_NAME, kind: SpanKind.CONSUMER }, (span) => …);

// outbound call over an uninstrumented protocol (miot UDP, raw `dgram`, `fetch`)
await withClientSpan({ name: SPAN_MIOT_GET_PROPERTIES, tracer: MIOT_TRACER_NAME }, () => …);
```

Metrics matter more than traces for a cron, because a cron is deterministic and an error that
recurs every tick shows up in any of them. Three reusable instruments — `job.run.duration`
(Histogram, `s`), `job.run.skips` and `job.run.items` (Counters) — all keyed by a **bounded,
static** `job.name`. **Traces are head-sampled, metrics never are:** a run passed
`suppressTrace: true` emits no span and still records its duration and outcome.

**Outbound miot calls use `withMiotCallSpan`, which emits the CLIENT span *and*
`miot.client.call.duration` from one call** — the same pairing as `runJob`, and for a stronger
reason: the poller swallows device faults into back-off, so a device that has been refusing a
property for a week produces no failing span and no failing job outcome. miIO is JSON-RPC over UDP,
so it uses the RPC conventions as they are — `rpc.system.name`, `rpc.method`,
`rpc.response.status_code` (a **string**), and `error.type` for the outcome
(`timeout` / `device_error` / `transport_error` / `rejected_locally`, absent on success). A bulk
read can succeed while refusing individual properties; those land on `miot.property.rejections`,
keyed by the code and by `miot.property.source` = `spec` | `override`, which is what says whether a
refused entry is the published spec's fault or ours.

**Span attribute types are a repo-local rule: identifiers are strings, quantities are numbers.**
Every identifier goes through `identifierAttribute()` from `src/otel/telemetry.ts` —
`miot.device.id`, `miot.device.storage_id`, `miot.siid`/`piid`/`aiid` — while counts, intervals and
ports stay numeric. A numeric identifier reaches Tempo as an `intValue` and crashes any Grafana
table panel that `select()`s it, because the attribute is sparse across a trace's spans.

**`packages/otel` takes no new dependencies.** Its dependency list is a budget, not a starting
point — it is preloaded before app code via `node --import`, sits in every app's hot path, and
conceals its own faults when it breaks (the traces and `trace_id`-bearing logs you would debug it
with are the casualties). Using what it already declares is unrestricted. To instrument something
it has no dependency on, pass the instrumentation in from the app via `init`'s
`extraInstrumentations` and keep the dependency in the app's `package.json` — the way
`MongooseInstrumentation` is wired. See [its README](./packages/otel/README.md#dependency-policy--do-not-add-dependencies-to-this-package).

Full conventions — span kinds, naming, name constants in `src/otel/telemetry.ts`, attribute types,
the metric set and its cardinality budget, why the namespace is `job.*` and not `faas.*`, which
metrics a self-rescheduling vs fixed-rate scheduler can honestly emit, and the assertions a test
must make — are in `.apm/skills/instrument-entry-point/SKILL.md`.

## Adding a New UI

1. Create `ui/<ui-name>/` with at minimum:

   | File | Notes |
   | --- | --- |
   | `package.json` | React + Vite. Keep React/router versions consistent across UIs. |
   | `tsconfig.json` | `module: ESNext`, `jsx: react-jsx`. |
   | `vite.config.ts` | `base` reads from `process.env.VITE_BASE_PATH` for proxy mounts. |
   | `vitest.config.ts` | jsdom environment, coverage thresholds. |
   | `eslint.config.mjs` | Re-exports `@radoslavirha/config-eslint`. |
   | `index.html` | Inline script that fetches `/config.json` BEFORE the bundle and exposes the promise as `window.__APP_CONFIG_PROMISE__`. |
   | `public/config.json` | Dev defaults. In Kubernetes this file is replaced by a mounted ConfigMap. |
   | `nginx.conf` | SPA fallback to `index.html`; serve `/config.json` with `Cache-Control: no-store`. |
   | `src/runtime/RuntimeConfig.ts` | `loadRuntimeConfig()` + Zod-equivalent runtime validation. |
   | `src/main.tsx` | Awaits `loadRuntimeConfig()` then renders `<App />`. |

2. New workspaces are auto-discovered via `ui/*` glob in `pnpm-workspace.yaml`.
3. Add a `Dockerfile` stage in the root `Dockerfile` following the `qr-manager-ui` pattern (build with Vite → copy `dist/` into nginx image).

## Server configuration

- uses [config](https://www.npmjs.com/package/config) library
  - `config/` directory structure comes from this library, files may differ except `custom-environment-variables.json`
  - `NODE_ENV` value when running server from `package.json` should match filename. `NODE_ENV=localhost {command to start server}` will require `config/localhost.json` file.
  - `config/test.json` exists for tests as testing frameworks usually set `NODE_ENV=test`
  - `config/custom-environment-variables.json` is not mandatory, it's only for advanced usage when [config](https://www.npmjs.com/package/config) can use/replace environment variable in json file during runtime.
- uses `@radoslavirha/tsed-configuration` for loading server configuration.

### Configuration backward compatibility (repository-wide rule)

- Treat configuration as a versioned contract across all apps and packages.
- All config changes must be backward compatible for rolling deployments.
- Assume a new ConfigMap can be applied before all old pods are replaced.
- During rollout, old and new versions may run concurrently.
- Prefer additive config changes; remove legacy keys only after all workloads run a compatible version.
- Do not enforce runtime strict rejection of unknown future keys when it can block older running versions.

## Versioning & Changesets

- Uses `@changesets/cli` for versioning
- Create a changeset: `pnpm changeset`
- Follows [Semantic Versioning](http://semver.org/)

## Deploy

Follow [deployment guide](./docs/Deployment.md)