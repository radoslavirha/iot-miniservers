---
'@radoslavirha/miot-device': patch
'@radoslavirha/otel': patch
'@radoslavirha/http-provider': patch
'@radoslavirha/tsed-http-provider': patch
'miot-bridge-api': patch
'qr-manager-api': patch
---

Use `@radoslavirha/utils` guards instead of hand-written ones in backend code.

Every package here already depends on `@radoslavirha/utils`, but a number of call sites still
wrote the check by hand: `!== undefined`, `typeof x === 'string'`, `typeof x === 'function'`,
`Array.isArray(x)`. The toolkit ships type predicates for all of them, so the hand-written form is
a second implementation of something the dependency already provides — and the place the
difference shows is narrowing, which the predicates carry and an ad-hoc check only reproduces by
accident.

All raw guards in the packages that depend on `utils` are now replaced, so the repo is clean under
the reuse rules adopted alongside this change. `ui/*` is out of scope — those bundles do not
depend on `utils` — as are `health`, `resilience` and `tsed-resilience`, which do not either.

Two of the replacements are not the obvious ones, and both would have been behaviour changes:

- **`MiotTransport.callAction` keeps its explicit branches** rather than collapsing into
  `ArrayUtils.toArray`, which looks like a drop-in and is not: `toArray` maps `null` to `[]`, where
  the existing code wraps it as `[null]` and sends it to the device as an action argument.
- **`resolveUrl` keeps its `=== ''` comparisons.** `CommonUtils.isEmpty` covers both cases in one
  call but returns a plain `boolean`, not a type predicate, so folding the two together would have
  dropped the narrowing that the following `ABSOLUTE_URL.test(url)` depends on.

One site needed restructuring rather than substitution. In `attachRequestLogging`, TypeScript
narrows `requestConfig` itself through `requestConfig?._logStartedAt === undefined` — a special
rule for optional-chain comparisons that a user-defined predicate does not get. Hoisting the value
to a local gives the narrowing something to attach to, and shortens the expression.
