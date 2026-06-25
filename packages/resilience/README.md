# @radoslavirha/resilience

Transport-agnostic resilience for Node.js: **timeout, retry and circuit breaker**, composed via
[cockatiel](https://github.com/connor4312/cockatiel) and threaded through a native
`AbortSignal`. The core wraps any `(signal) => Promise<T>`, so it works for HTTP (axios/fetch),
the MongoDB driver / mongoose, queues, UDP — anything that accepts an `AbortSignal` (or that you
simply want bounded by a timeout and protected by a breaker).

> Designed with zero framework coupling so it can graduate to `toolkit-hub` unchanged. For a
> Ts.ED request-scoped cancellation signal, see `@radoslavirha/tsed-resilience`.

## 🚀 Quick Reference for AI Agents

```ts
import { createResiliencePolicy, combineSignals, isBrokenCircuitError } from '@radoslavirha/resilience';

const policy = createResiliencePolicy(
  { timeout: { ms: 2000 }, retry: { count: 2, backoffMs: 200 }, circuitBreaker: {} },
  { shouldHandle: (e) => isTransient(e) }   // optional: scope failures for retry + breaker
);

// `signal` aborts on timeout (or when a parent signal aborts) — forward it to the transport
const data = await policy.execute((signal) => fetch(url, { signal }));
```

### Configuration (`ResilienceConfigSchema`, Zod)

| Section | Field | Default | Meaning |
|---|---|---|---|
| `timeout` | `ms` | `5000` | Per-call budget; aborts the signal and rejects with `TaskCancelledError`. |
| `retry` | `count` | `0` | Additional attempts after the first (`0` disables retry). |
| `retry` | `backoffMs` | `250` | Constant delay between attempts. |
| `circuitBreaker` | `halfOpenAfterMs` | `10000` | Wait before a trial call after opening. |
| `circuitBreaker` | `threshold` | `0.5` | Error ratio (0..1) that opens the circuit. |
| `circuitBreaker` | `samplingDurationMs` | `10000` | Trailing window for the ratio. |
| `circuitBreaker` | `minimumThroughput` | `5` | Min calls/sec before the breaker can open. |

All sections are optional; omit one to disable that policy. Composition order is
**retry → circuit breaker → timeout** (timeout innermost).

### Named policies — `ResiliencePolicyFactory`

A circuit breaker is only useful when its state is **shared** across calls, so resolve a
long-lived policy per dependency rather than building one per call:

```ts
const factory = new ResiliencePolicyFactory({
  'spec-api': { timeout: { ms: 5000 }, circuitBreaker: {} },
  'db':       { timeout: { ms: 2000 } }
});
await factory.get('spec-api').execute((signal) => http.get(url, { signal }));
```

### Combining signals

`combineSignals(...signals)` merges a request-lifecycle signal with a per-operation timeout via
the native `AbortSignal.any` (returns `undefined` when none are given, the single signal when one
is given):

```ts
const signal = combineSignals(requestSignal, AbortSignal.timeout(2000));
```

### Using with mongoose

cockatiel's timeout rejects the **caller**, but only the driver `signal` + `maxTimeMS` stop the
query **server-side** — pass both:

```ts
private readonly policy = createResiliencePolicy({ timeout: { ms: 2000 }, circuitBreaker: {} });

async findBySlug(slug: string, signal?: AbortSignal) {
  return this.policy.execute((timeoutSignal) =>
    this.model.findOne({ slug }, null, {
      signal: combineSignals(signal, timeoutSignal),
      maxTimeMS: 2000
    }).lean());
}
```

### Errors

- `isBrokenCircuitError(e)` — the circuit is open and the call was short-circuited.
- `isTaskCancelledError(e)` — a timeout (or aborted parent signal) cancelled the operation.
