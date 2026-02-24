# AGENTS.md — AI Agent Instructions

## Repository Overview

This is a **pnpm monorepo** containing small independent Node.js APIs built with **Ts.ED** framework.

## Tech Stack

- **Runtime**: Node.js 24+
- **Package manager**: pnpm 10+ (workspaces)
- **Language**: TypeScript with `@radoslavirha/config-typescript` (ESM, `.js` extensions in imports)
- **Framework**: Ts.ED with `@radoslavirha/tsed-*`
- **Testing**: Vitest with `@radoslavirha/config-vitest`
- **Linting**: ESLint with `@radoslavirha/config-eslint`
- **Versioning**: Changesets

## Package Registry

All `@radoslavirha/*` packages are hosted on **GitHub Packages** (`npm.pkg.github.com`), not the public npm registry. The root `.npmrc` configures this scope.

- `NODE_AUTH_TOKEN` must be set in the environment before running `pnpm install`, it's in `.env`
- `shared-workspace-lockfile=false` is intentional — required for per-API Docker builds

Always use [toolkit-hub](https://github.com/radoslavirha/toolkit-hub) where possible and avoid creating own logic if already exist in toolkit-hub. All `@radoslavirha/*` libraries are provided there.

## Monorepo Structure

```
apis/<api-name>/
  src/
    global/
      endpoints/          # External API/data source wrappers, not HTTP controllers.
        <API group>/
          dto/            # DTO models for endpoints.
          *Endpoint.ts    # Endpoint service which accepts/returns only DTOs. SINGLETON scoped when possible.
      mappers/            # Global mapper services for mapping Ts.ED schema models and DTOs. Never use services, global endpoints/stores. SINGLETON scoped when possible.
      models/             # App-level models (e.g. ConfigModel). Models can be organised to folders.
      services/           # App-level services (e.g. ConfigService). SINGLETON scoped when possible.
      storage/
        <storage group>/  # E.g. mongo, other databases,...
          dto/            # DTO models for storage repositories.
          *Repository.ts  # Repository service which accepts/returns only DTOs. SINGLETON scoped when possible.
      ModelGroups.ts      # Groups used in `@Groups()` decorator from Ts.ED. Groups should be defined on Controller endpoints (request/response models) and in Models. If `@Groups()` is used in child model, parent model should use `@ForwardGroups()` decorator on property which uses child model.
      ...                 # There still may be something API specific.
    v1/
      controllers/        # Ts.ED controllers. Every endpoint has own handler. SINGLETON scoped when possible.
      handlers/           # Business logic handlers. Handler can use Services/Mappers. Should avoid using global endpoints/stores if possible. SINGLETON scoped when possible.
      mappers/            # Mapper services for mapping Ts.ED schema models and DTOs. Never use services, global endpoints/stores. SINGLETON scoped when possible.
      models/             # Application version specific models, request/response models, etc. Models can be organised to folders.
      services/           # Services with business logic. Use mappers, other services, endpoints, stores. (SINGLETON scoped when possible)
      ...                 # There still may be something API specific.
    Server.ts
    index.ts
```

## Coding Conventions

### General

- Always use **ESM** imports with explicit `.js` extensions (e.g. `import { Foo } from './Foo.js'`)
- Files from `src/global` can't import from `src/{v1, v2,...}`.
- Avoid constructing DTOs and calling endpoints/repositories from handler. Delegate DTO construction to services.
- Use `@radoslavirha/*` packages from [toolkit-hub](https://github.com/radoslavirha/toolkit-hub)

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

### Mappers

- Always do bi-directional mapping between DTO <-> Model.
- Should extend `MappingUtils` from `@radoslavirha/utils`
- Export all from `mappers/index.ts`

### Services & Handlers

- Services contain reusable, stateless logic
- Handlers orchestrate services for a specific use case and map to controller actions
- Export all from `services/index.ts` and `handlers/index.ts`

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
   | `src/global/models/ConfigModel.ts` | Extends `BaseConfig`; add API-specific config fields here |
   | `src/global/models/index.ts` | Barrel export |
   | `src/global/services/ConfigService.ts` | Standard `ConfigProvider<ConfigModel>` — identical across APIs |
   | `src/Server.ts` | Mount `SwaggerController` at `/` |
   | `src/index.ts` | Bootstrap entrypoint — identical across APIs |

2. New workspace members are auto-discovered via `apis/*` glob in `pnpm-workspace.yaml` — no changes needed there.
3. Run `pnpm install` from the repo root (requires `NODE_AUTH_TOKEN` in env).
4. Add a `.README.hbs` template (README is generated via `docs.js`).

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
