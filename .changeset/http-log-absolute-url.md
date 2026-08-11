---
'@radoslavirha/tsed-http-provider': patch
---

Log the full outbound URL, base included.

Axios keeps `baseURL` and `url` apart on the config until the adapter runs, so the
interceptor logged a bare path (`/files/portal/docs/...`) with no host. Lines from
different providers were indistinguishable and could not be traced back to a target.

`resolveUrl()` now joins the two the way axios does: one separator regardless of the
slashes on either side, an already-absolute `url` wins over `baseURL`, and an empty `url`
falls back to `baseURL` alone.
