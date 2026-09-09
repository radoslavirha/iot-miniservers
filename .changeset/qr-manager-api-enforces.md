---
"qr-manager-api": minor
---

`/qr-codes` now requires a verified caller.

An unauthenticated `GET /qr-codes` answers `401` instead of returning every record. This is the first
API in the repo to actually verify the tokens the frontend had already been sending.

`@Authenticate(AuthMethod.Idp)` sits on the controller class, not on each method, so a route added
tomorrow is protected the moment it is written. Two routes stay open, each for a reason that is written
next to it: `GET /r/:slug` is the printed-QR redirect, scanned by an anonymous phone camera, and
`GET /qr-codes/:id/image` is loaded by `<img src>`, which cannot send a header.

A refused request answers `401`, and one whose token could not be verified answers `503` — a JWKS fetch
that failed is our problem, not the caller's, and unlike `401` it is worth retrying. Neither says why.

Credential headers are no longer written to the log. That is now the default in
`@radoslavirha/tsed-logger`, so this service configures nothing.
