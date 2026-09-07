# @radoslavirha/tsed-auth

Ts.ED wiring for [`@radoslavirha/auth`](../auth): the request guard, the endpoint decorators, and the
injectable `Principal`.

The core package **decides**; this one reads a header, throws the right exception, and makes the
result injectable. Keeping the split is what lets every outcome be tested without a server.

## Wiring it into a service

`AuthenticationService` takes configuration through its constructor, the same contract `Logger`,
`HttpProviderService` and `HealthCheckService` carry. **The override is mandatory** — Ts.ED reads
`design:paramtypes` and cannot resolve a plain config object, so resolving it without one fails with
"Given token is undefined".

```ts
@Injectable({ token: AuthenticationService, scope: ProviderScope.SINGLETON })
export class AuthProvider extends AuthenticationService {
    public constructor(configService: ConfigService) {
        super(configService.config.auth);
    }
}
```

That is all. Left to itself it builds one verifier per configured entry, chosen by that entry's
`type` — today a `JwtVerifier` over whichever key sources the configuration implies, inline rows, JWKS
rows, or a mix.

Declare the config with the methods the routes actually ask for, and a deployment that forgot one
fails at boot naming `auth.IDP`, rather than answering 500 on the first guarded request:

```ts
// apis/<api>/src/models/config/AuthMethod.enum.ts — the service's own names
export enum AuthMethod { Idp = 'IDP' }

// apis/<api>/src/models/config/ConfigModel.ts
auth: createAuthConfigSchema(Object.values(AuthMethod))
```

## Protecting routes

```ts
@Controller('/qr-codes')
@Authenticate(AuthMethod.Idp)
export class QrCodeController {
    @Get('/')
    list(@CurrentPrincipal() principal: Principal | undefined) { … }

    @Get('/:slug')
    @Anonymous()
    resolve() { … }
}
```

**Put `@Authenticate()` on the class, not on methods.** Ts.ED's `UseAuth` decorates every method of
the class it sits on, so a route added tomorrow is protected the moment it is written. Applying it
method by method is the arrangement where the next route is one forgotten decorator away from being
public. `@Anonymous()` is then a visible, per-route opt-out sitting next to the thing it opens.

**The method argument is required, and it names callers rather than a mechanism.**
`AuthMethod.Idp` is *which set of callers* the endpoint admits; how their credentials are checked is
the `type` inside that entry's config. So an endpoint can admit a deployment's people without also
admitting its cluster's ServiceAccount tokens, even though both arrive as JWTs — which one `jwt` key
could not express.

`AuthMethod` is the **service's own** enum, declared beside `ExternalApi` and for the same reason: a
shared package cannot know which callers a deployment admits. The decorator takes a plain `string`;
using the enum at both the decorator and `createAuthConfigSchema` is what keeps the two in step.

`@CurrentPrincipal()` yields `Principal | undefined` and never a stand-in. It is `undefined` on an
`@Anonymous()` route, which is the only place a request reaches a handler unverified.

## What lands in the OpenAPI document

The decorators emit the documentation themselves, so there is nothing to keep in step by hand:

```jsonc
"/qr-codes": {
    "get": {
        "security": [{ "BEARER_JWT": [] }],
        "responses": { "401": { … }, "503": { … } }
    }
},
"/qr-codes/{slug}": {
    "get": { "security": [] }        // @Anonymous()
}
```

All of it is standard OpenAPI 3 — a `security` requirement, an empty one as the operation-level
override, and ordinary response codes. **No vendor extensions**: a test asserts the generated document
contains no `x-` key, so any generator or client can read it.

`@Anonymous()` emits `security: []` rather than simply omitting the requirement, because omission
inherits the document-level default. The empty array is OpenAPI's own way to say "this operation needs
nothing", and it is what stops Swagger UI offering a padlock on a route that ignores it.

**The scheme itself is declared once, by the app**, not here. Operations only reference it:

```ts
// apis/<api>/src/index.ts
security: [SwaggerSecurityScheme.BEARER_JWT]   // replaces `security: []`
```

Both sides use `SwaggerSecurityScheme.BEARER_JWT` from `@radoslavirha/tsed-swagger` — the same value,
not two matching literals — so an operation cannot reference a scheme the document never defined.

That puts `components.securitySchemes.BEARER_JWT` — `{ type: http, scheme: bearer, bearerFormat: JWT }`
— into the document, and Swagger UI's **Authorize** button starts sending `Authorization: Bearer …`.

## Integration tests

`authenticateBearerJwt` mints a valid token and points an agent's every request at it, so a suite needs
no token variable and no per-call `.set`:

```ts
let request: SuperTest.Agent;   // anonymous
let api: SuperTest.Agent;       // authenticated

beforeEach(async () => {
    request = SuperTest.agent(PlatformTest.callback());
    api = await authenticateBearerJwt(SuperTest.agent(PlatformTest.callback()));
});

await api.get('/qr-codes').expect(200);
await request.get('/qr-codes').expect(401);
```

**Build the agent with `SuperTest.agent(app)`, not `SuperTest(app)`.** Only the former is a persistent
agent carrying default headers; the latter has no `set` at all, and the helper has nothing to attach to.

It mutates and returns that agent, because that is exactly what `agent.set` does — so give the
authenticated and anonymous cases their own agents. Two agents against one callback is cheap, and which
is which stays visible at the call site.

**Named for the mechanism, not for authentication in general.** A second mechanism gets its own
function beside this one rather than a discriminator added to this one: mechanisms differ in what they
mint *and* where it goes, and a bare `authenticate` would have to lie about one of them.

The token comes from `mintTestToken`'s defaults, which are deliberately the same issuer, audience and
secret a service's `config/test.json` inline-key row uses — so a suite that copies that row needs no
arguments, and the two cannot drift apart. Vary the caller with
`authenticateBearerJwt(agent, { subject: 'someone' })`. For a token you already hold — a real one
captured from a browser, or a deliberately broken one — no helper is needed:
`agent.set('Authorization', \`Bearer ${token}\`)`.

## Three things worth knowing

**A refusal tells the caller nothing.** The verifier's `detail` — a JOSE error, the audience that did
not match — is for operators, and handing it over tells an attacker which part of their forgery to
fix next. Leaving it out of the message is not enough: Ts.ED's exceptions **append an inner
exception's message to their own**, so passing it as `innerException` puts it straight back on the
wire. A test pins that. The detail stays on the `AuthDecision` for whoever wants to log it.

**`indeterminate` answers `503`, not `401`.** Every other reason is a statement about the credential;
that one is a statement about us. A `401` when our own JWKS fetch timed out blames a token that was
never the problem, and is not retriable.

**A non-bearer `Authorization` header reads as no credential.** `Basic …` reaching the JWT verifier
would be counted as `invalid`, which looks like an attack rather than a client using the wrong scheme.
The scheme match is case-insensitive, because clients do send `bearer`.

## Scripts

```bash
pnpm build   # tsc --noEmit && tsdown
pnpm test    # vitest run, with coverage
pnpm lint    # eslint .
```
