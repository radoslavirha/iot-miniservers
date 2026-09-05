---
"qr-manager-ui": patch
---

Fix the app hanging on "Loading…" instead of showing the sign-in page.

The provider skips its SSO probe while a callback is in flight and waits for the user-loaded event
instead. When the callback finds no session that event never arrives, so the provider never settled
and the app showed a permanent spinner where the sign-in page belongs. The callback now reports that
outcome, and local development points at `http://localhost:5173/callback`, which is registered on the
sandbox applications so `pnpm dev` can complete a real login.
