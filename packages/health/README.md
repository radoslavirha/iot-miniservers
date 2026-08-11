# @radoslavirha/health

Framework-agnostic health checking: a check contract, a registry that evaluates checks
concurrently under per-check deadlines, and an `application/health+json` report.

No Ts.ED, no HTTP, no transport. The Ts.ED endpoints live in
[`@radoslavirha/tsed-health`](../tsed-health); this package holds the semantics.

## 🚀 Quick Reference for AI Agents

```ts
import { HealthRegistry, HealthStatus, type HealthCheck } from '@radoslavirha/health';

const mongo: HealthCheck = {
  name: 'mongodb',
  critical: true,                       // a fail here removes the pod from Endpoints
  check: (signal) => ({ status: HealthStatus.Pass })
};

const registry = new HealthRegistry([mongo], { checkTimeoutMs: 2000, cacheTtlMs: 1000 });

const { ready } = await registry.evaluate();   // gate for /health/ready
const report = await registry.report();        // { status, checks }
```

## `critical` is the whole design

Every check declares whether it gates readiness:

| `critical` | A `fail` means | Use for |
| --- | --- | --- |
| `true` | `/health/ready` returns 503; the pod leaves the Service's Endpoints | dependencies without which this pod can do nothing — its own database, its own broker |
| `false` | the report degrades to `warn`; readiness is **unaffected** | anything you cannot fix by restarting or rescheduling this pod — third-party APIs above all |

Failing readiness on a third-party outage converts someone else's incident into an outage
of yours: your pods leave Endpoints, and the upstream recovers on its own schedule either
way. Report it, alert on it, do not act on it in the cluster.

Roll-up follows from that:

```text
ready  = every critical check is not `fail`
status = 'fail'  if any critical check failed
         'warn'  if anything warned, or a non-critical check failed
         'pass'  otherwise
```

`fail` is reserved for critical failures, so a degraded upstream answers **200** with
`"status":"warn"` — visible to a dashboard, invisible to kubelet.

## Guarantees

- **`evaluate()` never rejects.** A check that throws or hangs becomes a `fail` for that
  check alone; the others still report. A probe that receives no body tells you nothing.
- **A thrown error never reaches the body.** Only `error.name` is surfaced, never
  `error.message` — a mongoose connection error's message embeds the connection URI.
  Enforced by the registry, not trusted to each check.
- **Checks run concurrently.** Wall time is the slowest check, not the sum, so three 2 s
  checks cannot exceed a 3 s `readinessProbe.timeoutSeconds`.
- **`detail` is truncated** to 120 characters, and unknown result fields are stripped.
- **Results are shared.** A single-flight TTL cache means three probes plus a human on
  `/health` do not each start their own pass over the same checks.

## Configuration

| Field | Default | Notes |
| --- | --- | --- |
| `checkTimeoutMs` | `2000` | Per-check deadline; expiry yields `fail` / `timeout`. Keep below `readinessProbe.timeoutSeconds`. |
| `cacheTtlMs` | `1000` | Result reuse window. Keep below the shortest probe `periodSeconds`. `0` disables. |
| `exposeDetail` | `true` | When `false`, the report omits the per-check breakdown entirely. |

Every field is defaulted, so `{}` is valid.

## Built-in checks

- **`breakerCheck(name, breaker, { critical })`** — reports an existing circuit breaker's
  state. `Closed → pass`, `HalfOpen → warn`, `Open`/`Isolated` → `fail`. Defaults to
  non-critical.

An empty registry is legal and reports `pass`, so an app with genuinely no dependencies
registers nothing.

`breakerCheck` takes a `CircuitStateLike` from
[`@radoslavirha/resilience`](../resilience) — cockatiel's `CircuitBreakerPolicy` satisfies
it directly. The mapping is keyed off the real `CircuitState` enum rather than mirrored
numeric values, so a cockatiel renumbering cannot silently turn every open circuit into a
`pass`.

That is the only reason this package depends on `@radoslavirha/resilience`, and it costs
nothing in practice: **anyone who needs `breakerCheck` already has a circuit breaker, and
therefore already has resilience.**

## Why health does not *run through* the resilience package

Depending on it for a type is one thing. Health checks must **not** execute through a
`ResiliencePolicy`:

1. **Retry double-counts.** `readinessProbe.failureThreshold` *is* the retry, owned by
   kubelet at the right layer. Retrying inside the check delays the true signal and can
   push the response past `timeoutSeconds`, at which point the `detail` is lost to a
   bodyless probe timeout.
2. **A breaker in a probe is meaningless and harmful.** A sampling breaker needs a
   meaningful request rate; a readiness probe supplies ~0.2/s. And if the breaker is shared
   with the real traffic path, probe traffic starts tripping the breaker that guards
   production requests — the probe becomes a cause of outages.
3. **Timeout is the only primitive a probe wants**, and the registry needs its own anyway
   (per-check, always-on, producing `fail` rather than rejecting).

The reverse direction is where the value is: reading a breaker that already guards real
traffic is the cheapest possible signal about an external dependency. It issues no request,
adds no load to a service that may already be struggling, and an idle upstream reports
`pass` rather than raising a false alarm.
