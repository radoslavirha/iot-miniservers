# @radoslavirha/ui-kit

## 1.1.0

### Minor Changes

- [#100](https://github.com/radoslavirha/iot-miniservers/pull/100) [`8eff9a3`](https://github.com/radoslavirha/iot-miniservers/commit/8eff9a3fc7c6aea685ad23d70158346f9c1903d6) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Keep a browser session alive, and stop reporting a dead one as healthy.
  
  Three defects that only showed up in a browser, all of which passed the test suite:
  
  - **Nothing renewed the token.** `automaticSilentRenew` is off — correctly, it uses a hidden iframe and
    Authentik sets `X-Frame-Options: DENY` — but nothing replaced it, so a tab open past the 30-minute
    lifetime held a dead token. Renewal is now a top-level `prompt=none` redirect scheduled a minute
    before expiry, and it returns the user to the page they were on rather than the landing route.
  - **`getAccessToken()` did not check expiry**, so the request seam attached that dead token.
  - **A `401` classified as a healthy backend.** `classifyResponse` mapped every 4xx to `client-error`,
    which is right for a validation error and wrong for an expired session: the user saw a green banner
    and a raw failure string with nothing prompting a re-login. 401 and 403 are now an `unauthorized`
    outcome and surface as `unauthenticated`, with banner copy that says to sign in again rather than
    claiming a retry is coming.
  
  `<AuthCallback>` moves into `@radoslavirha/ui-auth`. It takes `navigate` as a **prop** rather than
  calling `useNavigate()` internally, because a single-screen app should not have to adopt a router to
  get a login. It owns the single-exchange guard, the `returnTo` handling and the basename stripping —
  all three are things every frontend would otherwise reimplement, and the exchange guard is invisible
  without a browser because the first exchange succeeds and the user still lands signed in.
  
  `@radoslavirha/ui-kit` gains the `unauthenticated` banner state, deliberately worded apart from
  `degraded`: nothing is broken and nothing is retrying, so "having problems — retrying" would be a lie
  that makes the user wait for a recovery that cannot come.

### Patch Changes

- Updated dependencies [[`8eff9a3`](https://github.com/radoslavirha/iot-miniservers/commit/8eff9a3fc7c6aea685ad23d70158346f9c1903d6)]:
  - @radoslavirha/ui-runtime@0.3.0

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
