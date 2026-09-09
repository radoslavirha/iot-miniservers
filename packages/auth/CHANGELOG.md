# @radoslavirha/auth

## 0.2.0

### Minor Changes

- [#100](https://github.com/radoslavirha/iot-miniservers/pull/100) [`8eff9a3`](https://github.com/radoslavirha/iot-miniservers/commit/8eff9a3fc7c6aea685ad23d70158346f9c1903d6) Thanks [@radoslavirha](https://github.com/radoslavirha)! - Inbound authentication, split into a framework-free half and a Ts.ED half.
  
  `@radoslavirha/auth` decides: `Principal`, the verification-outcome vocabulary, a JWT verifier over
  static or JWKS keys, and the Zod config schema. It reads no request and imports no framework — a
  transport extracts the credential and applies the decision, which is what lets the same verifier serve
  HTTP today and MQTT or a queue later.
  
  `@radoslavirha/tsed-auth` wires that into a request: the guard, `@Authenticate` / `@Anonymous` /
  `@RequireRoles` / `@CurrentPrincipal`, OpenAPI security metadata, and a SuperTest helper for
  integration suites.
  
  `@RequireRoles('qr-manager.admin')` is the authorization half. A missing role is `403` rather than
  `401` — the credential is good, so re-authenticating cannot help — and the comparison is an exact
  string match with no hierarchy. It lives in the same endpoint store entry as the auth method rather
  than in a second middleware, so one guard runs both checks in the right order.
  
  It works on a class, a method, or both, and stacking is **"or" within one decorator, "and" between
  them** — a method can only ever narrow what its class allowed. That reading is enforced by the shape,
  not by convention: Ts.ED concatenates arrays when merging endpoint options, so a flat list would have
  turned a class `reader` plus a method `admin` into one "any of" set and let a reader through the
  admin-only route. Each decorator's roles are stored in their own inner array so the same concatenation
  produces the safe meaning instead.
  
  In the OpenAPI document it emits a `403` whose description names the roles. Putting them in the
  security requirement instead — `{ BEARER_JWT: ['qr-manager.admin'] }` — would render in Swagger UI and
  be invalid: the spec requires that array to be empty for a scheme of `type: http`.
  
  **A route can admit several methods**, and each verifier finds its own credential:
  
  ```ts
  @Authenticate(AuthMethod.Idp, AuthMethod.ApiKey)   // either
  ```
  
  They are tried in the order listed and the first that verifies wins. A verifier that finds no
  credential of its own steps aside rather than refusing, so "no API key present" cannot reject a caller
  who sent a perfectly good bearer token. `ITokenVerifier.extract(source)` is what makes that possible —
  a mechanism owns where its credential travels, so adding an API-key verifier needs no change to any
  transport. The transport supplies a `CredentialSource`, which knows only how to answer "what is header
  X".
  
  **When every method fails, the reason is folded by severity, not taken from the last one tried.** An
  `indeterminate` outcome wins outright and answers `503`; then any reason other than `missing`; then
  `missing`. Without that ordering a JWKS outage followed by "no key present" would answer `401`,
  telling a caller with a valid token to fix it while the real fault is an outage they cannot see. Every
  named method is also resolved before any runs, so a typo in the second cannot hide behind the first
  succeeding.
  
  Three decisions worth knowing before using it:
  
  - **`@Authenticate(...)` takes at least one method**, and they name *callers*, not a mechanism. How a
    credential is checked is the `type` inside that entry's configuration. So an API can admit its
    people on one route and a device fleet on another even though both arrive as bearer JWTs. A
    method-level decorator **replaces** the class-level one rather than adding to it, so widening a
    route is always written on the route, in full — never an emergent property of two decorators
    meeting.
  - **The names belong to the service.** It declares its own enum and feeds it to
    `createAuthConfigSchema`, so a deployment that never configured a method fails to parse at boot
    naming the missing key, rather than answering 500 on the first guarded request.
  - **There is no way to switch it off.** No mode, no `enabled` flag, no permissive verifier type —
    every such state is one where a forgotten key in a values file leaves a service up, healthy and
    unauthenticated.
  
  Import `createAuthConfigSchema` from `@radoslavirha/auth`, not from the Ts.ED wrapper that re-exports
  it: the wrapper's barrel also carries `AuthenticationService`, whose `@Injectable()` runs on import, so
  a pure schema import would register a DI provider that every unit test then has to satisfy.
