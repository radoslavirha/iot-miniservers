---
"@radoslavirha/http-provider": minor
---

Map credentials to headers by name, not by templating.

A transport entry now names the credential it carries instead of interpolating it into a string:

```jsonc
// before
{ "name": "Authorization", "value": "Bearer {{value}}" }
// after
{ "name": "Authorization", "credential": "value", "prefix": "Bearer " }
```

`credential` matches a key the auth strategy returned — for `token-exchange` those are the `as` names
from `tokenExtractor` — so any field of any token response reaches any header without a code change,
and two entries put an access token in one header and a refresh token in another. `prefix` and
`suffix` wrap the value; `suffix` exists for the cookie shape (`session=<t>; Path=/`) and little else.
Static entries keep the plain `value` field they always had.

**Why remove the templating.** It expressed exactly one thing more — two credentials inside a single
value — that no configuration has ever used: every strategy in this package returns a single `value`,
and multi-credential extraction appears only in test files. What it cost was a placeholder syntax that
a config renderer downstream may claim as its own. These files are rendered by Jinja2, whose `{{ }}`
is that syntax, and whose default for an unknown name is the empty string — so `Bearer {{value}}`
would have rendered as `Bearer `, producing a `401` from the far end that looks exactly like a genuine
refusal. Naming the credential in its own field leaves nothing for any renderer, present or future, to
consume. If a value ever genuinely needs two credentials, a template field can be added beside this
one; that is additive, where the wrong delimiter is not.

An absent or blank credential now throws instead of being sent as a bare prefix, so the same failure
is loud and names the entry and the credential it wanted.

Breaking for any configured `transport`, of which there are none — the two built-in defaults
(`kubernetes-service-account`, `jwt-self-signed`) already supplied the `Bearer ` header and were
updated in place.
