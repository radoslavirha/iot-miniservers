# @radoslavirha/tsed-resilience

Ts.ED request-scoped cancellation: a `RequestCancellation` provider that exposes an
`AbortSignal` tied to the HTTP request lifecycle. The signal aborts when the client
disconnects, so abandoned requests stop doing outbound HTTP / database work.

Pairs with [`@radoslavirha/resilience`](../resilience) — read the signal here, thread it into a
resilience policy's `execute((timeoutSignal) => ...)` downstream.

## 🚀 Quick Reference for AI Agents

```ts
import { RequestCancellation } from '@radoslavirha/tsed-resilience';

@Controller('/')
@Scope(ProviderScope.SINGLETON)
export class RedirectController {
  constructor(
    private readonly cancellation: RequestCancellation,   // request-scoped, resolved per request
    private readonly handler: RedirectHandler
  ) {}

  @Get('/:slug')
  redirect(@PathParams('slug') slug: string) {
    // request-lifecycle signal + a 2s per-operation timeout
    return this.handler.execute(slug, this.cancellation.withTimeout(2000));
  }
}
```

`RequestCancellation` is `@Scope(ProviderScope.REQUEST)`. Repositories/services are usually
`SINGLETON`, so resolve the signal at the request-scoped layer (controller/handler) and pass it
down as an explicit `signal?: AbortSignal` argument rather than injecting the provider into a
singleton.

### API

- `signal: AbortSignal` — aborts on client disconnect (`close`/`aborted` on the Node request).
- `withTimeout(ms): AbortSignal` — `signal` combined with `AbortSignal.timeout(ms)` (native,
  Node ≥ 24); aborts on **either** disconnect or timeout.
- `abort(reason?)` — manually abort (idempotent).
