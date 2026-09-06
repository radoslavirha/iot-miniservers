# @radoslavirha/tsed-auth

Ts.ED wiring for [`@radoslavirha/auth`](../auth): the request guard, the endpoint decorators, and the
injectable `Principal`.

The core package **decides**; this one reads a header, throws the right exception, and makes the
result injectable. Keeping the split is what lets all three auth modes be tested without a server.

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

That is all. Left to itself it builds a `JwtVerifier` over whichever key sources the configuration
implies — inline rows, JWKS rows, or a mix.

## Protecting routes

```ts
@Controller('/qr-codes')
@Authenticate()
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

`@CurrentPrincipal()` yields `Principal | undefined` and never a stand-in. In `disabled`, and in
`permissive` with no credential, there genuinely is nobody — and a fabricated subject in an audit
column is worse than an empty one, because later it cannot be told from a real one.

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
