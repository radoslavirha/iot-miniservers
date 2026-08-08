# @radoslavirha/nginx-runtime

## 0.2.0

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
