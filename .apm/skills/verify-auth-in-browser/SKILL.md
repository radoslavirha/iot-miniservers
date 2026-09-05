---
name: verify-auth-in-browser
description: Verify an OIDC login flow by actually running it in a browser against the real IdP, instead of reasoning about it. Use when changing anything in packages/ui-auth, a UI's auth wiring, an Authentik blueprint, or when a login, logout, silent-renew or redirect behaviour is claimed to work. Also use before writing "verified" about any auth change.
---

# Verify auth in a browser

Auth in this repo has been wrong four times, and **every single time it was a thing that could have
been checked in under a minute and was assumed instead**:

| Assumed | Reality | The check that would have caught it |
| --- | --- | --- |
| Hidden-iframe silent renew works | `X-Frame-Options: DENY` on every Authentik response | `curl -sI https://auth.irha.cz \| grep -i x-frame` |
| The IdP gate keeps people out of the app | It gates tokens, not pages; the app was fully usable signed out | Open the app without signing in |
| Skipping the probe on the callback fixes the loop | It did, and replaced it with a permanent `Loading…` | Sign in and watch |
| One `Log out` ends the session | It ran the *provider* flow, which preserves the session | `prompt=none` after logout |

The tests passed for all four. **Unit tests cannot see redirects, framing, cookies, or the IdP.**

## The rule

Do not write "verified", "works", or "fixed" about an auth change until you have run it. If you
cannot run it, say which specific thing is unverified and why — never let it read as proven.

## How to run it

### 1. Local dev against the real IdP — the default

`http://localhost:5173/callback` is a **registered redirect URI on sandbox applications only**
(`homelab` → `authentik-blueprints/templates/configmap.yaml`, gated on `stage == "sandbox"`). So
local development does the real flow against the real IdP.

```bash
pnpm --filter=<ui> dev          # http://localhost:5173
```

`public/config.json` already carries the localhost redirect URIs. It is not a bypass: localhost is a
secure context, PKCE is real, the token is the same token.

**Never point a UI's local config at a production client**, and never add a loopback redirect URI to a
production application — anything running on a developer's machine could then complete a production
login.

### 2. Driving it with Playwright

```bash
npx --yes playwright@latest install chromium
```

Authentik's flow UI is web components, so:

- **Everything must be `:visible`.** The identification stage carries hidden `username`, `password`
  and `code` inputs for autofill. `input[type="password"]` matches a hidden one and silently does
  nothing. Use `input[name="password"]:visible`.
- **`innerText` on `body` returns "Powered by authentik"** — the form is in shadow DOM. Do not use
  page text to decide whether a stage rendered; query for the input.
- Advance stages by clicking the `Log in` button, not by pressing Enter.

Count **main-frame navigations** — that is how a redirect loop shows up, and nothing else reveals it:

```js
const nav = [];
page.on('framenavigated', f => f === page.mainFrame() && nav.push(f.url()));
```

A healthy sign-in is **one** navigation to the callback. Four means a loop that happened to
terminate; the user sees it as "never ending".

### 3. Against a deployed environment

Point Playwright at the deployed URL. Note the version actually running before drawing conclusions —
`git show origin/main:ui/<ui>/package.json | grep version` against the image tag in `homelab`. Testing
a fix that is not deployed yet proves nothing.

**Do not** try to serve a local build from the deployed hostname. It was attempted: it needs a
self-signed cert, `--host-resolver-rules`, and disabling Chromium's Local Network Access checks, and
it still fails because Playwright follows cross-origin redirects internally without re-invoking
`route` handlers — so the redirect back from the IdP is silently served by the *real* deployed app and
you test the wrong build. Use local dev (1) instead. That is what the registered localhost URI is for.

## What to check, every time

1. **Anonymous visitor** — sign-in page, none of the app, and it *settles*. No loop, no permanent
   `Loading…`.
2. **Sign in** — lands on the app, header shows `preferred_username`, **one** callback navigation.
3. **Reload** — still signed in, no typing.
4. **`localStorage`** — `oidc.<state>` during login is fine; **a `user` entry holding tokens is a bug**.
   `await page.evaluate(() => Object.keys(localStorage))`.
5. **Log out** — returns to the app AND ends the IdP session. Prove the second half:
   `prompt=none` afterwards must return `error=login_required`, not a code.
6. **Console** — a clean run has no errors. `X-Frame-Options` and CORS failures appear only here.

## Checking the IdP directly

Faster than a browser for anything about the IdP itself, and it catches a whole class of assumption:

```bash
curl -sI https://auth.irha.cz/ | grep -i x-frame                    # framing
curl -s  https://auth.irha.cz/application/o/<client>/.well-known/openid-configuration \
  | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['scopes_supported'], d['grant_types_supported'])"
curl -sI -H 'Origin: https://<app-host>' https://auth.irha.cz/application/o/token/ | grep -i access-control
```

The full headless login recipe — flow executor, stage walking, the `query=` wrapping trap — is in
`docs/superpowers/specs/2026-09-04-authentik-integration-contract.md` under *Reproducing the
verification*. It is genuinely useful for token and claim checks. It **cannot** see framing, cookie
policy, or anything React does, which is exactly how the iframe mistake survived.

## Recording what you find

A surprise goes into the contract's *What is NOT verified* section, with the command that proves it.
That is how the next person avoids assuming the same thing.
