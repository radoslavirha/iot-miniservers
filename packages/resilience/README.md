# @radoslavirha/resilience

Transport-agnostic resilience for Node.js: **timeout, retry and circuit breaker**, composed via
[cockatiel](https://github.com/connor4312/cockatiel) and threaded through a native
`AbortSignal`. The core wraps any `(signal) => Promise<T>`, so it works for HTTP (axios/fetch),
the MongoDB driver / mongoose, queues, UDP — anything that accepts an `AbortSignal` (or that you
simply want bounded by a timeout and protected by a breaker).

> Designed with zero framework coupling so it can graduate to `toolkit-hub` unchanged. For a
> Ts.ED request-lifecycle signal to feed in as the parent, see `@radoslavirha/tsed-resilience`.

## 🚀 Quick Reference for AI Agents

```ts
import { createResiliencePolicy, isBrokenCircuitError } from '@radoslavirha/resilience';

const policy = createResiliencePolicy(
  { timeout: { ms: 2000 }, retry: { count: 2, backoffMs: 200 }, circuitBreaker: {} },
  { shouldHandle: (e) => isTransient(e) }   // optional: scope failures for retry + breaker
);

// `signal` aborts on timeout (or when the parent signal aborts) — forward it to the transport
const data = await policy.execute((signal) => fetch(url, { signal }));
```

## Configuration (`ResilienceConfigSchema`, Zod)

| Section | Field | Default | Meaning |
|---|---|---|---|
| `timeout` | `ms` | `5000` | Per-call budget; aborts the signal and rejects with `TaskCancelledError`. |
| `retry` | `count` | `0` | Additional attempts after the first (`0` disables retry). |
| `retry` | `backoffMs` | `250` | Constant delay between attempts. |
| `circuitBreaker` | `halfOpenAfterMs` | `10000` | Wait before a trial call after opening. |
| `circuitBreaker` | `threshold` | `0.5` | Error ratio (0..1) that opens the circuit. |
| `circuitBreaker` | `samplingDurationMs` | `10000` | Trailing window for the ratio. |
| `circuitBreaker` | `minimumThroughput` | `5` | Min calls/sec before the breaker can open. |

Every section is **optional — omitting one disables that policy entirely**. Pass `{}` for a
section to enable it with all defaults (`{ circuitBreaker: {} }`). Note that `retry` defaults to
`count: 0`, so `{ retry: {} }` enables the section but still performs no retries — set `count`
explicitly.

`createResiliencePolicy` parses its input, so config may be written in the schema's *input*
shape (defaulted fields omitted). Parsing is idempotent — config already parsed at load time by
your own Zod schema passes through unchanged.

## Composition order

Policies compose as **retry → circuit breaker → timeout**, with the timeout innermost:

```text
retry( breaker( timeout( yourFn(signal) ) ) )
```

Consequences worth knowing:

- The timeout applies **per attempt**, not to the whole retry sequence.
- The breaker observes each individual attempt, so a retry storm trips it as intended.
- Because retry is outermost, it sees `BrokenCircuitError` from the breaker. With the default
  `handleAll` predicate that error **is retried**, which is rarely what you want — pass a
  `shouldHandle` that returns `false` for it (a transport-specific predicate normally does so
  naturally, since a `BrokenCircuitError` is not a transport error).

### `shouldHandle` — the transport seam

`shouldHandle` decides which errors count as failures for **both** retry and the breaker. It
defaults to handling every error. It remains active for breaker accounting when retry is disabled.
This is the seam that keeps the package transport-agnostic:

```ts
import axios from 'axios';

createResiliencePolicy(config, {
  // only network errors and 5xx are transient; 404 and BrokenCircuitError are not
  shouldHandle: (e) => axios.isAxiosError(e) && (e.response === undefined || e.response.status >= 500)
});
```

### Lifecycle hooks

Plain callbacks, no logger or framework dependency — wire them to your own telemetry:

```ts
createResiliencePolicy(config, {
  hooks: {
    onBreak:    () => logger.warn('circuit opened'),
    onReset:    () => logger.info('circuit closed'),
    onHalfOpen: () => logger.info('circuit half-open'),
    onTimeout:  () => logger.warn('operation timed out'),
    onRetry:    ({ attempt, delay }) => logger.info({ attempt, delay }, 'retrying')
  }
});
```

## Named policies — `ResiliencePolicyFactory`

A circuit breaker is only useful when its state is **shared** across calls, so resolve a
long-lived policy per dependency rather than building one per call:

```ts
enum Dep { SpecApi = 'spec-api', Db = 'db' }

const factory = new ResiliencePolicyFactory<Dep>({
  [Dep.SpecApi]: { timeout: { ms: 5000 }, circuitBreaker: {} },
  [Dep.Db]:      { timeout: { ms: 2000 } }
});

await factory.get(Dep.SpecApi).execute((signal) => http.get(url, { signal }));
```

Policies are created lazily and cached per key. `get()` throws for an unconfigured key.

## Cancellation

`execute(fn, parentSignal?)` gives `fn` a signal combining the per-attempt timeout and
`parentSignal`, so it aborts when either does. Forward that inner signal — and only that one —
to the transport:

```ts
await policy.execute(
  (signal) => fetch(url, { signal }),   // ✅ already covers the parent signal
  requestSignal
);
```

An already-aborted parent skips `fn` and rejects with `TaskCancelledError`. If the parent aborts
in flight or during retry backoff, execution rejects immediately and no later attempt starts.
Parent cancellation is request control flow: it is not retried, does not count toward the circuit
breaker while closed, and does not invoke `onTimeout`. A cancelled half-open probe leaves the
breaker open because it cannot establish dependency recovery. A policy deadline remains a timeout,
so it continues to follow the configured retry and breaker rules.

### `combineSignals`

For merging signals **outside** a policy (where no derivation happens for you),
`combineSignals(...signals)` wraps the native `AbortSignal.any`. It returns `undefined` when
given none — so the result can be forwarded straight into APIs that treat `signal: undefined`
as "no signal" — and returns the single signal unchanged when given one.

```ts
const signal = combineSignals(requestSignal, userSignal);
await fetch(url, { signal });
```

## Using with mongoose

cockatiel's timeout rejects the **caller**, but only the driver `signal` + `maxTimeMS` stop the
query **server-side** — pass both:

```ts
private readonly policy = createResiliencePolicy({ timeout: { ms: 2000 }, circuitBreaker: {} });

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

`lookupSignal` already aborts when the caller's `signal` does, so there is no need to combine
the two.

## Errors

- `isBrokenCircuitError(e)` — the circuit is open and the call was short-circuited.
- `isTaskCancelledError(e)` — a timeout (or an aborted parent signal) cancelled the operation.

Both are re-exported from cockatiel (`BrokenCircuitError`, `TaskCancelledError`) so consumers
never need to import it directly. Prefer the type guards over `instanceof`.
