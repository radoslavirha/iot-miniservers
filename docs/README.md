# Documentation

## Development

This document describes the process for running these APIs on your local computer.

### Prerequisites

- node.js > 24
- pnpm > 11.26

### Getting started

Create `.env` and add your PAT for GiHub packages. You'll need to use it before installing like: `NODE_AUTH_TOKEN=XXX pnpm install`

## Docker

### Local build

Create `.npmrc.docker` in root. This is just `.npmrc` with replaced env variable with auth token for private npm packages.

Every app is a stage in the single root `Dockerfile`, so builds run from the repo root and
pick the app with `--target`:

```sh
docker build -t {image}:{tag} --secret id=npmrc,src=.npmrc.docker --target {app} .
docker run {image}:{tag}
```

`{app}` is the stage name — the app's directory name (`qr-manager-api`, `qr-manager-ui`, …),
plus `{app}-config-validator` for the UIs.

### Image rules

All apps are stages in the one root `Dockerfile`, so these hold for every image:

- API stages build `FROM runtime-base` (Node runtime only), never `FROM base` (which has pnpm).
- `runtime-base` owns `USER 1000`, `WORKDIR /home/app` and `NODE_ENV=production` — app stages do not repeat them, and copy with `--chown=1000:1000`.
- `CMD` keeps the OpenTelemetry preload (`--import /home/app/dist/otel/instrument.js`). Without it traces and log `trace_id`s vanish silently.
- Build-only packages stay in `devDependencies`, since `pnpm deploy --prod` copies `dependencies` into the image. `@swc/helpers` is the deliberate exception — `.swcrc` sets `externalHelpers: true`.
- `dist/` carries no source maps and no compiled tests (`sourceMaps: false`, `--ignore '**/*.spec.ts'`).
- The npm auth token is only ever a build secret (`--mount=type=secret,id=npmrc`), never `ARG` or `ENV`.

Nothing checks this in CI on purpose: one Dockerfile and few hands on it do not justify a build step that can fail for its own reasons on every PR. The cluster is the backstop — pods run non-root with a read-only root filesystem, so an image that regains root fails to start rather than running privileged.

Reference point, from the 2026-09 slimming: `qr-manager-api` went 462MB → 332MB once the package manager, the TypeScript compiler and 72 source-map/spec files stopped being shipped. An image far off that size is worth a look.
