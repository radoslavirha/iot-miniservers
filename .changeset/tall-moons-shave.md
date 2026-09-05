---
"qr-manager-ui": minor
---

Sign-in is now required to see the application, and session renewal no longer uses an iframe.

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
