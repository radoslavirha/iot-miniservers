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

Always use [toolkit-hub](https://github.com/radoslavirha/toolkit-hub) where possible and avoid creating own logic if already exist in toolkit-hub. There are all libraries with `@radoslavirha` prefix.

## Monorepo Structure

```
apis/<api-name>/
  src/
    global/
      models/         # App-level models (e.g. ConfigModel)
      services/       # App-level services (e.g. ConfigService)
      ...
    v1/
      controllers/    # Ts.ED controllers
      handlers/       # Business logic handlers (SINGLETON scoped)
      mappers/        # Mapper services for mapping Ts.ED schema models and DTOs
      services/       # Services (SINGLETON scoped)
      models/         # Ts.ED schema models
    Server.ts
    index.ts
```

## Coding Conventions

### General
- Always use **ESM** imports with explicit `.js` extensions (e.g. `import { Foo } from './Foo.js'`)

### Dependency Injection (Ts.ED)
- **Controllers**: `@Controller`, `@Scope(ProviderScope.SINGLETON)`
- **Handlers**: `@Injectable`, `@Scope(ProviderScope.SINGLETON)`
- **Services**: `@Service`, `@Scope(ProviderScope.SINGLETON)`
- Inject dependencies via constructor parameters

### Models
- Decorate all properties with `@tsed/schema` decorators: `@Property(String)`, `@Required`, `@Description`, `@Example`
- Use `@AdditionalProperties(false)` on all model classes
- Export all models from `models/index.ts`

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
   | `config/localhost.json` | Set `server.httpPort` and `publicURL` |
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
- uses `@radoslavirha/tsed-configuration` for loading server configuration.

## Versioning & Changesets

- Uses `@changesets/cli` for versioning
- Create a changeset: `pnpm changeset`
- Follows [Semantic Versioning](http://semver.org/)

## Do Not

- Do **not** omit `.js` extensions in imports
- Do **not** use CommonJS (`require`, `module.exports`)
- Do **not** add fields to models without `@tsed/schema` decorators
- Do **not** add logic directly in controllers — delegate to handlers and services
- Do **not** add `sharp` to a new API unless it actually needs image processing
- Do **not** forget `.swcrc` when scaffolding a new API — it is required and not auto-generated