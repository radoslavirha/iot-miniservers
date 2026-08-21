---
'@radoslavirha/miot-device': patch
'@radoslavirha/otel': patch
'@radoslavirha/http-provider': patch
'@radoslavirha/tsed-http-provider': patch
'interactive-map-feeder-api': patch
'miot-bridge-api': patch
'qr-manager-api': patch
---

Enable the `@radoslavirha/utils` reuse lint rules in every workspace that depends on `utils`.

The rules flag a hand-written check that the toolkit already provides a type predicate for —
`=== null`, `=== undefined`, `typeof x === 'string' | 'boolean' | 'number' | 'function'`,
`instanceof Date`, `Array.isArray`, `JSON.parse(JSON.stringify(...))` — and a `lodash` import that
should come from `utils` instead. Each message names the replacement and what it narrows to.

They ship from `@radoslavirha/utils/eslint`, **not** `@radoslavirha/config-eslint`, so that a rule
and the method it recommends are released together and a project can never be advised to call
something its installed version lacks. Nothing needed installing — `utils` is already a dependency
at the required version everywhere the rules are now enabled; this is wiring only:

```js
import PreferUtils from '@radoslavirha/utils/eslint';

export default config(...Config, ...PreferUtils);
```

Enabled in the seven workspaces that depend on `utils`, and deliberately not in the four that do
not (`health`, `resilience`, `tsed-resilience`, `ui-*`), where the rules would only produce noise.
The ruleset already excludes `*.spec.ts`: `expect(Array.isArray(x)).toBe(true)` is asserting a raw
fact about a value, and routing it through a toolkit guard would partly test the toolkit.

Every finding is fixed rather than suppressed, so the baseline is **zero warnings** and
`--max-warnings 0` passes today. That is the point of doing it this way: the rules are graded
`warn` because a raw check is occasionally the clearer choice, but a permanently-warning baseline
makes the next real finding invisible and forces every reader to re-derive which of the standing
warnings were deliberate. A clean baseline keeps the signal, and leaves the option of enforcing it.
