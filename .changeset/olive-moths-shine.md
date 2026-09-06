---
"qr-manager-ui": minor
---

Calls to qr-manager-api now carry the signed-in user's access token.

All six calls route through one request seam that attaches `Authorization: Bearer` from the auth
context. The seam exists because headers used to flow only through the JSON helper, which `list()` and
`remove()` never called — putting the token there would have authenticated four calls of six and left
`GET /qr-codes` and `DELETE /qr-codes/:id` anonymous.

The token getter is injected into this one client rather than installed on global `fetch`, and is read
per request rather than captured, so a client built without a getter stays bare and a changed token is
picked up without rebuilding anything.

**This is not a security change.** The API does not verify the header yet, so an unauthenticated
request still returns everything; that arrives when the API-side work lands. What it delivers is a
verified end-to-end human token.

Verified in a real browser against the live IdP, since unit tests cannot see redirects, cookies or the
IdP. Three things it deliberately does not fix, all now recorded in the auth design doc: nothing renews
the token once it expires, `getAccessToken()` does not check expiry, and a 401 currently classifies as
a healthy backend.
