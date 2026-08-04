# @radoslavirha/tsed-resilience

Ts.ED request cancellation: a `@RequestSignal()` parameter decorator that injects an
`AbortSignal` tied to the HTTP request lifecycle. The signal aborts when the client
disconnects, so abandoned requests stop doing outbound HTTP / database work.

Pairs with [`@radoslavirha/resilience`](../resilience) — inject the signal here, pass it as the
parent signal to a resilience policy's `execute(fn, signal)` downstream.

## 🚀 Quick Reference for AI Agents

```ts
import { RequestSignal } from '@radoslavirha/tsed-resilience';

@Controller('/')
@Scope(ProviderScope.SINGLETON)
export class RedirectController {
  constructor(private readonly handler: RedirectHandler) {}

  @Get('/:slug')
  public redirect(
    @PathParams('slug') slug: string,
    @RequestSignal() signal: AbortSignal
  ) {
    return this.handler.execute(slug, signal);
  }
}
```

## Why a decorator and not a provider

A request-scoped provider (`@Scope(ProviderScope.REQUEST)`) **cannot** be constructor-injected
into a `SINGLETON` controller — Ts.ED resolves a singleton's dependencies once at startup, and
[the singleton scope wins](https://tsed.dev/docs/injection-scopes.html), so every request would
share one instance. Making the controller request-scoped instead would force the whole
dependency chain to be request-scoped.

`@RequestSignal()` sidesteps that entirely: it is resolved by Ts.ED's **parameter pipeline** on
every request, so it works unchanged in a `SINGLETON` controller — which is what this repo's
conventions require.

## Threading the signal down

Controllers are the only layer that can read the signal. Services and repositories are
`SINGLETON`, so accept it as an explicit optional argument and pass it along:

```ts
// handler
public async execute(slug: string, signal?: AbortSignal): Promise<RedirectResult> {
  return this.qrCodeService.getBySlug(slug, signal);
}

// repository — hand it to a resilience policy as the *parent* signal
public async findBySlug(slug: string, signal?: AbortSignal) {
  return this.policy.execute(
    (lookupSignal) => this.model
      .findOne({ slug }, null, { signal: lookupSignal, maxTimeMS: 2000 })
      .lean()
      .exec(),
    signal
  );
}
```

Per-operation **deadlines belong in the policy**, not in the signal —
`createResiliencePolicy({ timeout: { ms } })` derives its own timeout signal from the request
signal, so a timeout and a client disconnect both abort the same call.

## API

| Export | Purpose |
|---|---|
| `RequestSignal()` | Parameter decorator injecting the request-lifecycle `AbortSignal`. |
| `getRequestSignal(ctx)` | Same signal from a `PlatformContext` — for middlewares/filters that already hold one. |
| `RequestSignalPipe` | The pipe backing the decorator. Exported for testing and DI introspection. |

The `AbortController` is memoised on the `PlatformContext`, so every call within a request
returns the same signal and it is garbage-collected with the context.

## When the signal aborts

It is bound to the Node request's `aborted` and `close` events:

- **Client disconnects mid-flight** → `aborted` fires, then `close`; the signal aborts while the
  handler is still running, cancelling in-flight work.
- **Normal request** → since Node 16 `close` fires only *after* the response completes, so the
  signal never aborts work that is still needed.

Requires Node.js ≥ 24 (native `AbortController` / `AbortSignal`).
