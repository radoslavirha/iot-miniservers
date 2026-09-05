---
"qr-manager-ui": minor
---

Log in through Authentik: the header shows who you are, and the session survives a reload.

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
