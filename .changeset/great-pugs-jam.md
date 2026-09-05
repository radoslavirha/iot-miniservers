---
"qr-manager-ui": patch
---

Fix an infinite redirect loop between the sign-in page and "Signing in…".

Signing in cleared the per-tab marker that says "the IdP has already been asked whether a session
exists". So when Authentik redirected back with an authorization code, the provider mounted, saw no
user in memory and no marker, and immediately redirected to `authorize?prompt=none` — **before the
callback handler could exchange the code**. That bounced back to the callback, and round it went.

The provider now recognises that a page load carrying `code` or `error` IS the return leg of a
redirect, and stays out of the way while the callback completes. It also honours its own cancellation
flag before navigating, so the discarded half of a StrictMode double-invoke cannot redirect the page
out from under the live one.
