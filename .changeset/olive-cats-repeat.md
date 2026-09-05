---
"qr-manager-ui": minor
---

One Log out button, and it really logs you out.

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
