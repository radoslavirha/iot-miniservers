---
name: update-docs
description: Regenerate agent-consumable README.md for apps and rebuild docs/KNOWLEDGE.md. Use when: new app added, controller/service/config changed, or onboard-to-homelab completed.
---

# Update Docs

Maintains lean, agent-consumable docs: per-app `README.md` and the central `docs/KNOWLEDGE.md`.
Focus: **what each app does, what it connects to, what it exposes**. No ports, no versions, no docker, no dev setup.

## Trigger

`/update-docs [app-name?]`

- No arg → all apps + KNOWLEDGE.md
- `app-name` → that app only, then refresh KNOWLEDGE.md

---

## Step 1 — Collect metadata per app

### APIs (`apis/<app>/`)

| File | Extract |
|------|---------|
| `package.json` | `name`, `description` |
| `src/controllers/*.ts` | Routes: HTTP method decorator + path string + `@Description` value |
| `src/endpoints/**/*.ts` | `BASE_URL` constants → external system |
| `src/services/Mqtt*.ts` | Topic patterns, inbound/outbound direction, payload shape |
| `src/services/Udp*.ts` | Payload shape, protocol notes |

### UIs (`ui/<app>/`)

| File | Extract |
|------|---------|
| `package.json` | `name`, `description` |
| `src/api/*.ts` | Which API endpoints are called |
| `src/runtime/RuntimeConfig.ts` | Config keys + types |

### Packages (`packages/<pkg>/`)

| File | Extract |
|------|---------|
| `package.json` | `name`, `description` |

---

## Step 2 — Write per-app README.md

Overwrite `README.md` in each app dir.
**Rules: no badges, no ports, no versions, no docker, no dev setup, no prose padding.**

### API format

```markdown
# {name}

{2-3 sentence description of purpose and responsibilities}

## Consumed By

{bullet list — who calls this API and how}

## External Dependencies

| System | Protocol | Condition | Purpose |
|--------|----------|-----------|---------|
{one row per external system}

## REST API

| Method | Path | Description |
|--------|------|-------------|
{one row per route}

## {MQTT — only if present}

Topic table + payload shape.

## {UDP — only if present}

Payload shape, response behavior.

## Shared Package

{only if app uses packages/ from this repo}
```

### UI format

```markdown
# {name}

{one sentence purpose}

## API Dependencies

| API | Config key | Operations |
|-----|------------|------------|

## Runtime Config

| Key | Description |
|-----|-------------|
```

---

## Step 3 — Rebuild docs/KNOWLEDGE.md

Overwrite `docs/KNOWLEDGE.md`. Update `Last updated` date. Structure:

1. One-line repo description
2. **Apps** table: Name | Type | Purpose
3. **Shared Packages** table: Package | Purpose
4. **Communication** — Mermaid `graph LR` (apps + external systems + labeled edges)
5. **External Dependencies** table: App | System | Protocol | Condition | Purpose

---
