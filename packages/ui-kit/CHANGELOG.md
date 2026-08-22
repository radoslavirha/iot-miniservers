# @radoslavirha/ui-kit

## 1.0.1

### Patch Changes

- [`8046bc5`](https://github.com/radoslavirha/iot-miniservers/commit/8046bc5e20911838609caef053f1a5d209c3cd82) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update dependencies
- Updated dependencies [[`8046bc5`](https://github.com/radoslavirha/iot-miniservers/commit/8046bc5e20911838609caef053f1a5d209c3cd82)]:
  - @radoslavirha/ui-runtime@0.2.1

## 1.0.0

### Minor Changes

- [`09a3ba1`](https://github.com/radoslavirha/iot-miniservers/commit/09a3ba182730cf56a5a680e3784cb7bb85218722) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Health check for frontends

- [`09a3ba1`](https://github.com/radoslavirha/iot-miniservers/commit/09a3ba182730cf56a5a680e3784cb7bb85218722) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Add health checks and runtime-config validation to the frontends.

  Both nginx images now expose an exact-match `/healthz` for the Kubernetes probes,
  shared from the new `@radoslavirha/nginx-runtime` package so the four nginx
  config files cannot drift.

  Each UI's runtime config is now described by a single Zod schema, used in two
  places from the same source file: the browser (`loadRuntimeConfig`) and a
  standalone validator bundle run as an initContainer before nginx starts. A
  config the app cannot use now fails the pod instead of producing a Ready pod
  serving a blank page.

  Behaviour changes worth noting on rollout:

  - The images no longer ship the development `public/config.json`. A ConfigMap
    that fails to mount is now a hard failure rather than silently serving
    localhost defaults.
  - `homelab-dashboard-ui` validates `unifi.apiKey`, which nothing checked before,
    and its `/healthz` is an exact match rather than a prefix.
  - `homelab-dashboard-ui` uses the stock nginx entrypoint pipeline instead of a
    custom `ENTRYPOINT`, restoring the base image's own init steps.
  - Both apps show a single banner when their backend is unreachable or failing,
    derived from real request outcomes. A 4xx does not raise it.

### Patch Changes

- Updated dependencies [[`09a3ba1`](https://github.com/radoslavirha/iot-miniservers/commit/09a3ba182730cf56a5a680e3784cb7bb85218722), [`09a3ba1`](https://github.com/radoslavirha/iot-miniservers/commit/09a3ba182730cf56a5a680e3784cb7bb85218722)]:
  - @radoslavirha/ui-runtime@0.2.0

## 0.2.2

### Patch Changes

- [`4a34a89`](https://github.com/radoslavirha/iot-miniservers/commit/4a34a892fa02d4d44307e756a9cab77c1e68256a) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

## 0.2.1

### Patch Changes

- [`422cfcf`](https://github.com/radoslavirha/iot-miniservers/commit/422cfcf17880bbd18b824b20592cac85e007ec88) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

## 0.2.0

### Minor Changes

- [`aeff188`](https://github.com/radoslavirha/iot-miniservers/commit/aeff188f97952da65227e41d36e7fec2626f8cb2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update dependencies

## 0.1.1

### Patch Changes

- [`8bb6799`](https://github.com/radoslavirha/iot-miniservers/commit/8bb679916e23e64df4dd97643f1494e01ef710c2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages
