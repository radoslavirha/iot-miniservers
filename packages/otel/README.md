# @radoslavirha/otel

OpenTelemetry bootstrap and telemetry helpers: SDK startup and time-boxed shutdown, tracer/meter
accessors, span wrappers for the entry points OTel does not instrument on its own, and the
reusable `job.*` metric set for scheduled work.

> Designed with zero framework coupling so it can graduate to `toolkit-hub` unchanged. It knows
> about OpenTelemetry and nothing else — no Ts.ED, no express, no transport client.

## 🚀 Quick Reference for AI Agents

```ts
// src/otel/instrument.ts — preloaded via `node --import ./dist/otel/instrument.js dist/index.js`
import { openTelemetry } from '@radoslavirha/otel';

openTelemetry.init({ otel: config.otel, service, version });
```

```ts
import { runJob, recordJobSkip, withEntryPointSpan, withClientSpan } from '@radoslavirha/otel';

// scheduled work (timer, cron, startup task) → root span + job.* metrics from one call
await runJob({ name: JOB_POLL, tracer: POLLER_TRACER, spanName: SPAN_TICK }, async ({ recordItem }) => { … });

// inbound traffic (UDP datagram, queue message) → root span only; it is not a job
await withEntryPointSpan({ name: SPAN_UDP_COMMAND, tracer: UDP_TRACER, kind: SpanKind.CONSUMER }, (span) => …);

// outbound call over an uninstrumented protocol (miot UDP, raw dgram, fetch)
await withClientSpan({ name: SPAN_MIOT_GET, tracer: MIOT_TRACER }, () => …);
```

Full guidance on *which* wrapper an entry point needs lives in the repo's
`instrument-entry-point` skill and in [AGENTS.md](../../AGENTS.md#instrumenting-entry-points).

## Dependency policy — do not add dependencies to this package

**The dependency list in `package.json` is a budget, not a starting point.** Treat adding a
runtime dependency here as a change that needs a reason strong enough to write down, not a
routine step while implementing a feature.

Using what is *already* declared is fine and carries no such bar — `@radoslavirha/utils` is a
current dependency and its guards are used freely across this package.

Why this package specifically:

- **It is preloaded before application code.** `instrument.ts` runs via `node --import`, ahead of
  the app's own entrypoint. A dependency that throws, or that pulls in something with a side
  effect at import time, fails the process before there is an app to report the failure.
- **It is in every app and in every hot path.** The span and metric wrappers wrap the work
  itself, so weight here is weight everywhere, on every request, tick and message.
- **A fault here is self-concealing.** Instrumentation is the thing you debug other outages
  *with*. When it breaks, the traces, metrics and `trace_id`-bearing log lines you would use to
  find the break are the casualties, so the failure surfaces as silence rather than an error.
- **It is bound for `toolkit-hub`.** Every dependency added here is one an unrelated consumer
  inherits later.

### Instrumenting something this package has no dependency on

Pass the instrumentation in from the app — `init` takes `extraInstrumentations`, and the
dependency stays in the app's `package.json`:

```ts
// apis/<api>/src/otel/instrument.ts — @opentelemetry/instrumentation-mongoose is the API's dep
import { MongooseInstrumentation } from '@opentelemetry/instrumentation-mongoose';
import { openTelemetry } from '@radoslavirha/otel';

openTelemetry.init({
    otel: config.otel,
    service,
    version,
    extraInstrumentations: [new MongooseInstrumentation()]
});
```

The same instinct applies to helpers, not just instrumentations. `withMqttPublishSpan` /
`withMqttConsumeSpan` are MQTT-shaped but take a plain `Record<string, string | string[]>`
carrier rather than an MQTT.js message, which is why MQTT tracing exists here with no `mqtt`
dependency. If a new helper seems to need a client type, take the plain data it carries instead.

## Configuration (`OtelConfigSchema`, Zod)

| Field | Meaning |
|---|---|
| `debug` | Enable OTel SDK debug logging via `DiagConsoleLogger`. |
| `traces` / `metrics` / `logs` | Per-signal `{ enabled, exporter: { url } }`. |

Each signal is a discriminated union: `enabled: true` **requires** `exporter.url`, so a signal
cannot be switched on with nowhere to send it. Omitting a section disables that signal.

## API

| Export | Purpose |
|---|---|
| `openTelemetry`, `OpenTelemetryService` | SDK bootstrap (`init`) and time-boxed `shutdown`. |
| `DEFAULT_OTEL_SHUTDOWN_MS` | Final-flush budget; counts against `terminationGracePeriodSeconds`. |
| `getTracer`, `getMeter` | Scoped tracer/meter accessors. |
| `withSpan`, `withEntryPointSpan`, `withClientSpan`, `recordSpanError` | Span wrappers. |
| `runJob`, `recordJobSkip` + `JOB_*` / `METRIC_JOB_*` / `ATTR_JOB_*` | Scheduled-work spans and metrics. |
| `withMqttPublishSpan`, `withMqttConsumeSpan`, `extractMqttContext` | MQTT spans and W3C context over MQTT 5 user properties. |
| `IGNORED_TRACE_PATHS`, `isIgnoredTracePath` | Probe-traffic exclusion — health endpoints stay out of traces. |

## Testing

`pnpm run test` — Vitest, no collector or daemon required.
