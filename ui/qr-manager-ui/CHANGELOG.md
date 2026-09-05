# qr-manager-ui

## 0.10.0

### Minor Changes

- [#95](https://github.com/radoslavirha/iot-miniservers/pull/95) [`18e0eed`](https://github.com/radoslavirha/iot-miniservers/commit/18e0eed4fc18bebe654d472e27437b2f9e01642c) Thanks [@radoslavirha](https://github.com/radoslavirha)! - One Log out button, and it really logs you out.
  
  There were two — *Log out* and *Sign out everywhere* — because RP-initiated logout ran the provider
  invalidation flow, which deliberately leaves the IdP session alive. *Log out* followed by *Log in*
  signed you straight back in with no prompt, which on a shared browser is not a logout at all, and the
  second button existed to paper over it.
  
  The fix is IdP-side rather than another button: the providers now use the session invalidation flow,
  which runs the logout stage and then honours `post_logout_redirect_uri`. So one button ends the SSO
  session across every application and returns you to the app.
  
  This also removes the last hardcoded IdP hostname from `@radoslavirha/ui-auth` — it now takes
  everything from runtime config, as the rest of the package already did.
  
  Requires the matching `homelab` blueprint change; the flow binding lives there.

## 0.9.0

### Minor Changes

- [#93](https://github.com/radoslavirha/iot-miniservers/pull/93) [`f7c88a9`](https://github.com/radoslavirha/iot-miniservers/commit/f7c88a97f39232fbeef1dd669fd2c71c87fa7982) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Sign-in is now required to see the application, and session renewal no longer uses an iframe.
  
  Two findings from the first run in a real browser, which is what P1.F1 existed to do.
  
  **Authentik sets `X-Frame-Options: DENY` on every response**, so the hidden-iframe silent renew could
  never have worked here. The failure is intermittent by nature — a `302` passes through a frame
  unblocked, so it breaks only where Authentik actually renders a page: the login flow, and the
  *Permission denied* page shown to a user outside the application's group. Recovery and renewal are now
  top-level `prompt=none` redirects. That is also what makes SSO work: signed in at another application,
  the redirect returns a code and no login form is ever shown. `login_required` is treated as "no
  session" rather than an error, so a first-time visitor gets a sign-in page instead of an error screen.
  
  **The application was fully usable while signed out.** Access was supposed to be decided at the IdP,
  but the IdP decides who can obtain a token, not who can open the page, and nothing forced a login.
  An anonymous visitor now gets a sign-in page and none of the admin UI, its navigation included.
  
  This is a usability change, not a security one: the API still verifies nothing, so an unauthenticated
  request continues to return everything until the API-side work lands.
  
  Also rejects a `clientId` containing an empty template segment. The values files are shared across
  clusters, so the client id is rendered per deployment; jinja renders an undefined variable as an empty
  string, which turned a missing variable into a well-formed but unknown client id that reached the IdP
  instead of failing at deploy time.

## 0.8.0

### Minor Changes

- [#91](https://github.com/radoslavirha/iot-miniservers/pull/91) [`f325810`](https://github.com/radoslavirha/iot-miniservers/commit/f3258104a10cf30595429e97bf2ca8673d004131) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Log in through Authentik: the header shows who you are, and the session survives a reload.
  
  Authorization code + PKCE against the per-application issuer, as a public client with no secret. The
  access token is held in memory only — there is no refresh token to store, and a 300-second token in
  `localStorage` would hand an XSS the whole session for nothing. A reload re-obtains one silently with
  `prompt=none` against the IdP's session cookie; every silent request is bounded by a timeout, because
  a user with a valid session but no group membership gets a `200` HTML page that never redirects.
  
  Logout offers two actions on purpose. RP-initiated logout returns to the app with the Authentik
  session still alive, so *Log out* followed by *Log in* would sign you straight back in with no prompt;
  *Sign out everywhere* goes to the IdP's invalidation flow and is the one that ends the session.
  
  **The `auth` block in `config.json` is now required.** A UI that renders without login is a UI nobody
  notices is unprotected, so the validating initContainer refuses to start one — which makes this a
  coupled release: the `homelab` values must carry the block before this image rolls.
  
  No API call changed. An unauthenticated request still returns everything; attaching the bearer token
  is the next piece of work.

## 0.7.2

### Patch Changes

- [`8046bc5`](https://github.com/radoslavirha/iot-miniservers/commit/8046bc5e20911838609caef053f1a5d209c3cd82) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update dependencies
- Updated dependencies [[`8046bc5`](https://github.com/radoslavirha/iot-miniservers/commit/8046bc5e20911838609caef053f1a5d209c3cd82)]:
  - @radoslavirha/ui-kit@1.0.1
  - @radoslavirha/ui-runtime@0.2.1

## 0.7.1

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

## 0.7.0

### Minor Changes

- [`85e81bf`](https://github.com/radoslavirha/iot-miniservers/commit/85e81bf0dd6e3b6f06d841a0f1f59a255e936fd8) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Release validator image for frontends

## 0.6.0

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

## 0.5.2

### Patch Changes

- [`4a34a89`](https://github.com/radoslavirha/iot-miniservers/commit/4a34a892fa02d4d44307e756a9cab77c1e68256a) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

- Updated dependencies [[`4a34a89`](https://github.com/radoslavirha/iot-miniservers/commit/4a34a892fa02d4d44307e756a9cab77c1e68256a)]:
  - @radoslavirha/ui-kit@0.2.2

## 0.5.1

### Patch Changes

- [`422cfcf`](https://github.com/radoslavirha/iot-miniservers/commit/422cfcf17880bbd18b824b20592cac85e007ec88) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

- Updated dependencies [[`422cfcf`](https://github.com/radoslavirha/iot-miniservers/commit/422cfcf17880bbd18b824b20592cac85e007ec88)]:
  - @radoslavirha/ui-kit@0.2.1

## 0.5.0

### Minor Changes

- [`aeff188`](https://github.com/radoslavirha/iot-miniservers/commit/aeff188f97952da65227e41d36e7fec2626f8cb2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update dependencies

### Patch Changes

- Updated dependencies [[`aeff188`](https://github.com/radoslavirha/iot-miniservers/commit/aeff188f97952da65227e41d36e7fec2626f8cb2)]:
  - @radoslavirha/ui-kit@0.2.0

## 0.4.2

### Patch Changes

- [`8bb6799`](https://github.com/radoslavirha/iot-miniservers/commit/8bb679916e23e64df4dd97643f1494e01ef710c2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

- Updated dependencies [[`8bb6799`](https://github.com/radoslavirha/iot-miniservers/commit/8bb679916e23e64df4dd97643f1494e01ef710c2)]:
  - @radoslavirha/ui-kit@0.1.1

## 0.4.1

### Patch Changes

- [`1a62d86`](https://github.com/radoslavirha/iot-miniservers/commit/1a62d86c15bd2e8a1feb0fdfb6d458af4c5e71fb) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Image URL fixes

## 0.4.0

### Minor Changes

- [`c56b2cf`](https://github.com/radoslavirha/iot-miniservers/commit/c56b2cf66db88c2c69cce85d2686a009ca42289f) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Nginx routing trouble

## 0.3.0

### Minor Changes

- [`62e9e05`](https://github.com/radoslavirha/iot-miniservers/commit/62e9e05d40755a69d8aa76632d95d801d1fc28ec) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Adjustments in models

## 0.2.2

### Patch Changes

- [`fb8c47d`](https://github.com/radoslavirha/iot-miniservers/commit/fb8c47dff5e38bd92f06295230b0dc1b883c411b) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Fix ingress routing

## 0.2.1

### Patch Changes

- [`6a21d27`](https://github.com/radoslavirha/iot-miniservers/commit/6a21d27ec7dae43558bb78e832e0c92dcfc3c2cc) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Test deploy

## 0.2.0

### Minor Changes

- [`e77d857`](https://github.com/radoslavirha/iot-miniservers/commit/e77d8576a2b70d8f06fd357c74fe436fc4676b74) Thanks [@radoslavirha](https://github.com/radoslavirha)! - test relase
