---
"qr-manager-ui": minor
---

Carry the signed-in user's token, and survive its expiry.

All six calls in the QR code client route through one `request()` seam that attaches
`Authorization: Bearer` from the auth context. The seam exists because headers previously flowed only
through the JSON helper, which `list()` and `remove()` never called — putting the token there would
have authenticated four calls of six and left `GET /qr-codes` and `DELETE /qr-codes/:id` anonymous.

The token getter is injected into this one client rather than installed on global `fetch`, and is read
per request rather than captured, so a client built without a getter stays bare and a changed token is
picked up without rebuilding anything.

**This is now a security change, which it was not when the seam first landed:** `qr-manager-api`
verifies the header, so an unauthenticated request no longer returns anything.

The callback route is now `<AuthCallback>` from `@radoslavirha/ui-auth` — this app supplies how it
navigates, its basename and its home route, and the single-exchange guard and `returnTo` handling come
from the package. Session renewal, expiry-aware tokens and the `401` banner arrive through the same
packages.
