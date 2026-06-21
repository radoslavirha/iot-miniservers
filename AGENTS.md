# AGENTS.md — AI Agent Instructions

All agentic tools (skill, instruction, agents,..) must be added to `.apm` folder. Never update/add skills/instructions/agents `.github`/`.claude` (GitHub actions and related files allowed). Example Structure:
```
repository/
+-- apm.yml // do not modify
+-- .apm/
|   +-- skills/
|   |   +-- example-skill/
|   |       +-- SKILL.md
|   +-- agents/
|   |   +-- example.agent.md
|   +-- instructions/
```

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
    otel/                 # OpenTelemetry bootstrap (`instrument.ts`) + per-API OTel config.
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
   | `src/Server.ts` | Mount `SwaggerController` at `/` plus controllers from `controllers/index.ts` |
   | `src/index.ts` | Bootstrap entrypoint — identical across APIs |
   | `src/otel/instrument.ts` | OTel SDK preload (loaded via `node --import` in `start:prod`) |

2. New workspace members are auto-discovered via `apis/*` glob in `pnpm-workspace.yaml` — no changes needed there.
3. Run `pnpm install` from the repo root (requires `NODE_AUTH_TOKEN` in env).
4. Add a `.README.md`.
5. Add a `Dockerfile` stage in the root `Dockerfile` following the `qr-manager-api` pattern (deps → build → final image with `pnpm start:prod`).

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

## Versioning & Changesets

- Uses `@changesets/cli` for versioning
- Create a changeset: `pnpm changeset`
- Follows [Semantic Versioning](http://semver.org/)

## Deploy

Follow [deployment guide](./docs/Deployment.md)