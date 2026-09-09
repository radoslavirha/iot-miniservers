---
"interactive-map-feeder-api": minor
---

One trust domain, not two.

The LaskaKit map logs in against the same identity provider as a person does, from its own Authentik
application. From this API's side that is not a different kind of authentication — it is the same
bearer JWT from a neighbouring issuer. So `AuthMethod.Device` is gone, its config entry is folded into
`auth.IDP.trustedIssuers` as a second row, and the map's route carries no decorator of its own.

**Why the original shape was wrong.** A trust domain answers "do we believe this signature"; it was
being used to answer "what kind of thing is calling", which is authorization. The cost showed up in
scaling: because a domain is named in code and every guarded route names a domain, onboarding device
number two would have needed a change in this repo — a deployment of the thing being consumed, to admit
a consumer. As an issuer row it is configuration, per environment, and costs nothing.

Restricting the map's route to the map is still available and is now in the right place:
`@RequireRoles` on a role its service account holds. It is not currently wanted — every route here
reads public ČHMÚ data, and what the token buys is that the surface is not anonymous and that a leaked
credential is revocable at the IdP, which follows from the map having its own application rather than
from how this API is configured.

The integration tests changed with it: the map's issuer is now admitted on all four routes, and the
refusals that matter — no credential, forged signature, wrong audience, expired, non-bearer scheme —
are unchanged.
