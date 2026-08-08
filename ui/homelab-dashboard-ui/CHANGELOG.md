# homelab-dashboard-ui

## 0.4.1

### Patch Changes

- [`c286c71`](https://github.com/radoslavirha/iot-miniservers/commit/c286c71d13b0675e51cb812eeb68a821600e4291) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Declare a numeric UID in the config-validator images.

  The validator stages used `USER node`. Kubernetes verifies `runAsNonRoot: true`
  against the image's configured user and cannot map a username to a UID — that
  mapping lives in the image's `/etc/passwd`, which the kubelet does not read — so
  it fails closed:

  ```text
  CreateContainerConfigError: container has runAsNonRoot and image has
  non-numeric user (node), cannot verify user is non-root
  ```

  This blocked the first `validate: true` sync on both sandbox clusters. `USER 1000`
  is the same user (`node` in `node:*-alpine`), stated in the form Kubernetes can
  verify, so the image satisfies `runAsNonRoot` without the chart having to supply
  `runAsUser`.

  No behaviour change outside Kubernetes: the validator still runs as uid 1000 and
  still works under a read-only root filesystem.

## 0.4.0

### Minor Changes

- [`85e81bf`](https://github.com/radoslavirha/iot-miniservers/commit/85e81bf0dd6e3b6f06d841a0f1f59a255e936fd8) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Release validator image for frontends

## 0.3.0

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
  - @radoslavirha/ui-kit@1.0.0
  - @radoslavirha/ui-runtime@0.2.0

## 0.2.2

### Patch Changes

- [`4a34a89`](https://github.com/radoslavirha/iot-miniservers/commit/4a34a892fa02d4d44307e756a9cab77c1e68256a) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

- Updated dependencies [[`4a34a89`](https://github.com/radoslavirha/iot-miniservers/commit/4a34a892fa02d4d44307e756a9cab77c1e68256a)]:
  - @radoslavirha/ui-kit@0.2.2

## 0.2.1

### Patch Changes

- [`422cfcf`](https://github.com/radoslavirha/iot-miniservers/commit/422cfcf17880bbd18b824b20592cac85e007ec88) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

- Updated dependencies [[`422cfcf`](https://github.com/radoslavirha/iot-miniservers/commit/422cfcf17880bbd18b824b20592cac85e007ec88)]:
  - @radoslavirha/ui-kit@0.2.1

## 0.2.0

### Minor Changes

- [`aeff188`](https://github.com/radoslavirha/iot-miniservers/commit/aeff188f97952da65227e41d36e7fec2626f8cb2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update dependencies

### Patch Changes

- Updated dependencies [[`aeff188`](https://github.com/radoslavirha/iot-miniservers/commit/aeff188f97952da65227e41d36e7fec2626f8cb2)]:
  - @radoslavirha/ui-kit@0.2.0

## 0.1.2

### Patch Changes

- [`a5bbc53`](https://github.com/radoslavirha/iot-miniservers/commit/a5bbc53ab986ad918f45dfd875d18021f4027443) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix nginx

## 0.1.1

### Patch Changes

- [`8bb6799`](https://github.com/radoslavirha/iot-miniservers/commit/8bb679916e23e64df4dd97643f1494e01ef710c2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

- Updated dependencies [[`8bb6799`](https://github.com/radoslavirha/iot-miniservers/commit/8bb679916e23e64df4dd97643f1494e01ef710c2)]:
  - @radoslavirha/ui-kit@0.1.1
