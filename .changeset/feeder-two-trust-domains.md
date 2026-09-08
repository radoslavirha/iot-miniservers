---
"interactive-map-feeder-api": minor
---

Admit people and the LaskaKit map, separately.

Every route now requires a bearer token, across two trust domains that are not interchangeable: `IDP`
on the three routes a person uses, `DEVICE` on the single route the map polls. A person's token is
refused on the map's route and the map's token everywhere else.

**The map has no credential yet, so its route answers `401` until one is issued.** The runbook is in
this API's README: an Authentik confidential client with `client_credentials`, a service account bound
to its group, and — in the same change, not as a follow-up — moving the ESPHome request to TLS. Over
cleartext the `client_secret` crosses the LAN on every refresh, so whoever captures one refresh mints
tokens indefinitely and a short token lifetime buys nothing.

Nothing here is protecting a secret; every route reads public ČHMÚ data. What the split protects is the
other direction: the map's credential lives in flash on a board on a cleartext LAN hop, so it is the
one most likely to leak, and it reaches exactly one endpoint — including whatever is added later.

The device's token carries `aud` and `iss` of its **own** client rather than this API's, and the API
trusts that pair explicitly. No Authentik scope mapping, and no role claim is read.
