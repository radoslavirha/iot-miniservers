# Align OTel SDK with k8s-monitoring Migration

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update the `@radoslavirha/otel` package and all app helm values to align with the homelab k8s-monitoring migration (see `homelab: docs/superpowers/plans/2026-05-18-k8s-monitoring-migration.md`). Drop OTLP log exporting in favour of structured stdout logs collected by Alloy podLogs — while preserving trace-log correlation via `trace_id` embedded in JSON log output. Remove `HostMetrics` (superseded by k8s-monitoring node/pod metrics). Update OTLP exporter URLs to the new alloy-receiver service.

**Prerequisite:** homelab k8s-monitoring migration must be deployed first (alloy-receiver service live on each cluster).

**Architecture:**

```
App (Node.js)
  WinstonInstrumentation  ──► injects trace_id + span_id into every Winston log record
  Winston JSON stdout     ──► Alloy podLogs DaemonSet collects, parses JSON, extracts trace_id
  OTLPTraceExporter       ──► alloy-receiver:4318/v1/traces  (unchanged role)
  OTLPMetricExporter      ──► alloy-receiver:4318/v1/metrics (custom app metrics only)
  OTLPLogExporter         ──► REMOVED (podLogs replaces this pipeline)
  HostMetrics             ──► REMOVED (k8s-monitoring covers node/container level)
```

**Trace-log correlation preserved:** `WinstonInstrumentation` remains active (tied to `tracesEnabled`). It injects `trace_id`/`span_id` into Winston log records before they reach any transport. Winston's JSON transport writes those fields to stdout. Alloy `podLogs` pipeline parses JSON and stores `trace_id` as Loki structured metadata. Grafana derived field links Loki log row → Tempo trace.

**Logger format prerequisite:** The apps use `@radoslavirha/tsed-logger`. Confirm it outputs JSON format to stdout in production (Ts.ED Logger defaults to JSON when `NODE_ENV=production` or when a JSON transport is configured). If not, add `winston.format.json()` transport explicitly — tracked in step 2.

---

## Signal decisions

| Signal | Before | After | Reason |
|--------|--------|-------|--------|
| Traces | OTLP → otel-collector:4318 | OTLP → alloy-receiver:4318 | URL change only |
| Custom metrics | OTLP → otel-collector:4318 | OTLP → alloy-receiver:4318 | URL change only |
| Logs | OTLP → otel-collector:4318 | stdout JSON → podLogs | Simpler pipeline, no extra OTLP hop |
| Node/host metrics | `@opentelemetry/host-metrics` | k8s-monitoring hostMetrics | Avoid duplication; SDK level dropped |
| k8s.namespace.name | — | Auto from k8s-monitoring | Replaces `environment` attribute |
| `environment` attr | Per-namespace OTel collector | Dropped | Namespace name is identical |

---

## Auto-instrumentation note (future)

Industry standards for zero-SDK instrumentation in Kubernetes:

| Approach | How | Langs | Traces | Metrics | Logs |
|----------|-----|-------|--------|---------|------|
| **OTel Operator** | Injects SDK via init container + `NODE_OPTIONS` env var | Java, Node, Python, .NET, Go | ✓ | ✓ | ✓ |
| **Grafana Beyla (eBPF)** | DaemonSet hooks at kernel/TLS level, no SDK needed | All | ✓ | ✓ (RED) | ✗ |
| **Pixie (eBPF, CNCF)** | Similar to Beyla, broader (SQL, HTTP bodies) | All | ✓ | ✓ | partial |

For these apps: SDK is already present and well-integrated — OTel Operator would be redundant. **Beyla** adds value for pods WITHOUT SDK (MongoDB, EMQX, Traefik) by providing RED metrics and basic HTTP/gRPC traces. Enable via `autoInstrumentation.beyla` in k8s-monitoring (homelab side). No changes needed in this repo for Beyla — it works at the network layer. Track Beyla enablement as a homelab-side task.

---

## Steps

### 1. Verify logger JSON output format

- [ ] Check `@radoslavirha/tsed-logger` configuration in each app's production config
- [ ] Confirm `"logger": { "level": "info" }` block produces JSON to stdout (not pretty-printed text)
- [ ] If not JSON: update `LoggerProvider` in each app to explicitly use Winston JSON transport. Example:

```ts
import winston from 'winston';

const jsonTransport = new winston.transports.Console({
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    )
});
```

- [ ] Verify that `WinstonInstrumentation` correctly hooks into the logger and `trace_id`/`span_id` appear in stdout JSON during a traced request

### 2. Remove HostMetrics from `OpenTelemetryService`

- [ ] In `packages/otel/src/OpenTelemetryService.ts`:
  - Remove the `appendHostMetrics()` call from `initSDK()`
  - Remove the `if (ObjectUtils.isEnabled(config.metrics)) { this.appendHostMetrics(); }` block
  - Remove `import { HostMetrics } from '@opentelemetry/host-metrics'`
  - Remove `import { metrics } from '@opentelemetry/api'` if no longer used elsewhere

### 3. Default logs to disabled in helm values

The `logs` config in `OtelConfig` stays fully supported — OTLP log exporting can be re-enabled at any time by setting `logs.enabled: true` in the app helm values. This keeps the door open for debugging or fallback scenarios.

- [ ] In each app's helm values (homelab repo, step 5 below): set `logs.enabled: false` with a comment explaining it can be re-enabled
- [ ] No changes to `OtelConfig.ts` schema — `logs` field remains first-class

### 4. Verify `WinstonInstrumentation` trace injection still works when logs disabled

`WinstonInstrumentation.disableLogSending: !logsEnabled` — existing logic is correct as-is. When `logs.enabled: false`, the instrumentation still injects `trace_id`/`span_id` into Winston records (controlled by `enabled: tracesEnabled`), but skips the OTLP log send. No code change needed here.

- [ ] Confirm via integration test or manual check: with `logs.enabled: false` and `traces.enabled: true`, verify `trace_id` appears in stdout JSON logs during a traced request

### 5. Update OTLP exporter URLs — homelab helm values (homelab repo change)

> These changes are in the `homelab` repo — cross-reference with homelab migration step 8.

Replace `http://otel-collector-opentelemetry-collector:4318` → `http://k8s-monitoring-alloy-receiver.monitoring.svc.cluster.local:4318` in all 6 app production/sandbox helm values files:

- [ ] `gitops/helm-values/apps/miot-bridge-api/production.yaml` — traces + metrics URLs
- [ ] `gitops/helm-values/apps/miot-bridge-api/sandbox.yaml` — traces + metrics URLs
- [ ] `gitops/helm-values/apps/qr-manager-api/production.yaml`
- [ ] `gitops/helm-values/apps/qr-manager-api/sandbox.yaml`
- [ ] `gitops/helm-values/apps/interactive-map-feeder-api/production.yaml`
- [ ] `gitops/helm-values/apps/interactive-map-feeder-api/sandbox.yaml`

Also disable (not remove) the `logs` block in each app's otel config in helm values:

```json
// Disable — podLogs handles logs; re-enable for debugging if needed
"logs": {
    "enabled": false,
    "exporter": {
        "url": "http://k8s-monitoring-alloy-receiver.monitoring.svc.cluster.local:4318/v1/logs"
    }
}
```

> Keep the exporter URL present so re-enabling (`"enabled": true`) works without needing to look up the URL.

### 6. Remove `@opentelemetry/host-metrics` dependency

- [ ] In `packages/otel/package.json`: remove `@opentelemetry/host-metrics` dependency
- [ ] Run `pnpm install` to update lockfile

### 7. Update documentation

- [ ] Update `docs/KNOWLEDGE.md`: reflect new OTel signal routing table; document that logs go via podLogs, trace_id correlation preserved via JSON stdout; note HostMetrics removal
- [ ] Update `packages/otel/README.md` (if exists): update usage example, note logs config deprecated
- [ ] Update any deployment docs referencing `otel-collector-opentelemetry-collector` service name
