# @radoslavirha/http-provider

## 0.2.2

### Patch Changes

- [`8046bc5`](https://github.com/radoslavirha/iot-miniservers/commit/8046bc5e20911838609caef053f1a5d209c3cd82) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update dependencies
- Updated dependencies [[`8046bc5`](https://github.com/radoslavirha/iot-miniservers/commit/8046bc5e20911838609caef053f1a5d209c3cd82)]:
  - @radoslavirha/resilience@0.2.1

## 0.2.1

### Patch Changes

- [`b14ef8c`](https://github.com/radoslavirha/iot-miniservers/commit/b14ef8cedc63a488bc7dbfb62791601135129443) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Enable the `@radoslavirha/utils` reuse lint rules in every workspace that depends on `utils`.
  
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

- [`b14ef8c`](https://github.com/radoslavirha/iot-miniservers/commit/b14ef8cedc63a488bc7dbfb62791601135129443) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Use `@radoslavirha/utils` guards instead of hand-written ones in backend code.
  
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

## 0.2.0

### Minor Changes

- [#54](https://github.com/radoslavirha/iot-miniservers/pull/54) [`830cac2`](https://github.com/radoslavirha/iot-miniservers/commit/830cac2c4aac6a671b4ad9b4c80046e2d07b1d0d) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Route every outbound HTTP call through configured, logged clients.

  **`@radoslavirha/http-provider`**

  `factory.get(key)` now returns an `HttpClient` — this package's own transport-neutral contract —
  instead of an `AxiosInstance`. **This changes the public return type.** Axios is an
  implementation detail: auth, resilience and configuration are already this package's concerns, so
  exposing a third-party client's API as ours tied every consumer to it and made the transport
  impossible to change. A single internal adapter is now the only place that speaks axios.

  Client methods resolve to the **response body**, options are transport-neutral (`headers`,
  `params`, `signal`, `responseType: 'json' | 'text' | 'binary'`), and `raw` remains as an escape
  hatch for integrations and tests.

  The package stays framework-agnostic and gains **no** logging. Instead it exposes an
  `onInstanceCreated(instance, key, role)` hook, called for each new client _before_ auth and
  resilience interceptors attach. Ordering is the point: axios runs response interceptors in
  registration order, so anything registered through the hook observes a raw failure before the
  401 auth handler recovers it. The token-exchange auth call now runs through the provider's
  resilience policy instead of bare axios, and is surfaced through the hook with `role: 'auth'`.

  **`@radoslavirha/tsed-http-provider`** (new package)

  Injectable `HttpProviderService` that builds clients from `externalApis` configuration and adds
  what the framework-agnostic core leaves out:

  - **Logging** — one line per outbound exchange, scoped per API (`HTTP_CLIENT:<key>`), attached
    through the hook. Redaction is delegated to `@radoslavirha/redaction`, sharing the
    `{ enabled, redactPaths }` vocabulary with `tsed-logger`'s inbound `requests` section;
    redactors compile once per API, never per request. Auth headers are redacted by default and
    non-textual responses log as `[[ BINARY ]]`.
  - **Failure translation** — a response interceptor maps transport failures onto Ts.ED
    exceptions: circuit open to `ServiceUnavailable`, timeout or cancellation to `GatewayTimeout`,
    upstream error or unreachable host to `BadGateway`, keeping the original as `origin`. It is
    attached _after_ the auth interceptor, so a 401 still reaches the auth retry untranslated.
    Previously an external outage surfaced as a raw axios stack in a 500.
  - **Client resolution** — an `@InjectHttpClient(key)` property decorator, built on Ts.ED's
    `@Inject(token, transform)`.

  `externalApis` parsing requires listed enum keys and intentionally tolerates unknown extra keys
  at runtime for rolling-deployment compatibility (extra keys are stripped after parsing).

  `Logger` is resolved from the DI container, so subclasses pass only configuration. Endpoint
  services therefore need no base class, no constructor and no try/catch, and never name an HTTP
  library. Deserialization stays a separate concern — endpoints call `Serializer` from
  `@radoslavirha/tsed-common` directly.

  **APIs**

  - `interactive-map-feeder-api`: ČHMÚ base URLs moved from hardcoded strings into `externalApis`
    (`CHMI_PORTAL`, `CHMI_OPENDATA` — two distinct hosts). Transport wrappers now live under
    `src/v1/endpoints/chmi` as `ChmiPortalEndpoint` and `ChmiRadarEndpoint`, and
    `RadarService`/`RadarImageService` depend on those endpoint wrappers instead of transport-owning
    services.
  - `miot-bridge-api`: `MiotSpecV2Endpoint` reads its base URL from `externalApis.MIOT_SPEC`;
    `specUrl()` still returns an absolute URL, now composed from the client's configured `baseURL`.
    The pre-existing `http` config section keeps its original meaning (notification settings) and
    is untouched.

  Deployment note: `interactive-map-feeder-api` and `miot-bridge-api` need the new `externalApis`
  block added to their ConfigMaps before rollout. Logging defaults are metadata-only (`enabled: true`
  with payload sections disabled unless explicitly enabled).

- [#54](https://github.com/radoslavirha/iot-miniservers/pull/54) [`ccb17cc`](https://github.com/radoslavirha/iot-miniservers/commit/ccb17cc3238db60ecd521ce7606bd2687c580603) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Add transport-agnostic resilience (timeout, retry, circuit breaker) with AbortSignal support.

  - `@radoslavirha/resilience`: new package. cockatiel-backed `createResiliencePolicy` /
    `ResiliencePolicyFactory` wrapping any `(signal) => Promise<T>`, composed as
    retry → circuit breaker → timeout, plus `combineSignals` and re-exported error guards
    (`isBrokenCircuitError`, `isTaskCancelledError`).
  - `@radoslavirha/tsed-resilience`: new package. A `@RequestSignal()` parameter decorator that
    injects an `AbortSignal` tied to the HTTP request lifecycle, usable from `SINGLETON`
    controllers, plus `getRequestSignal(ctx)` for middlewares.
  - `@radoslavirha/http-provider`: **config shape changed** — `axios-retry` and the `retry` entry
    are replaced by an optional `resilience` section (timeout + retry + circuit breaker). Retry is
    now **opt-in** (`retry.count` defaults to `0`, previously `3`), and the retriable statuses
    moved from `retry.statusCodes` to a top-level `retriableStatusCodes` (default
    `[500, 502, 503, 504]`). The factory parses each entry through `HttpProviderEntrySchema`, so
    Zod supplies every default.
  - `qr-manager-api`: wires the redirect path (`RedirectController` → `QrCodeService` →
    `QrCodeMongoRepository.findBySlug`) through a resilience policy + `maxTimeMS`, cancelled by
    the request-lifecycle signal.

### Patch Changes

- Updated dependencies [[`ccb17cc`](https://github.com/radoslavirha/iot-miniservers/commit/ccb17cc3238db60ecd521ce7606bd2687c580603)]:
  - @radoslavirha/resilience@0.2.0

## 0.1.3

### Patch Changes

- [`4a34a89`](https://github.com/radoslavirha/iot-miniservers/commit/4a34a892fa02d4d44307e756a9cab77c1e68256a) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

## 0.1.2

### Patch Changes

- [`422cfcf`](https://github.com/radoslavirha/iot-miniservers/commit/422cfcf17880bbd18b824b20592cac85e007ec88) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages

## 0.1.1

### Patch Changes

- [`8bb6799`](https://github.com/radoslavirha/iot-miniservers/commit/8bb679916e23e64df4dd97643f1494e01ef710c2) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Update packages
