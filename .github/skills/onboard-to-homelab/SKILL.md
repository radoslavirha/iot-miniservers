---
name: onboard-to-homelab
description: Scaffold full ArgoCD/homelab deployment for a new iot-miniservers app. Use when user says "onboard", "add to homelab", "create homelab deployment", "deploy new app", or starts describing a new app they want running on server2.
---

# Onboard App to Homelab

Scaffold full ArgoCD deployment in the homelab repo for a new app in this monorepo.
Opens a PR in `radoslavirha/homelab` with all required files.

## Step 1 — Identify the app

Determine which app to onboard:
- If user named an app (e.g. "onboard new-sensor-api"), use that.
- Otherwise, infer from current working directory or ask the user.
- App directory: `apps/<app-name>/` in this repo.

## Step 2 — Read app context from this repo

Read the following files (all relative to `apps/<app-name>/`):

1. **AGENTS.md** — description, Docker Hub image name, secret group names, Traefik UDP entrypoint names, config structure notes
2. **Dockerfile** — `EXPOSE` lines (HTTP + UDP ports)
3. **config.schema.json** (or `config.example.json`) — full config structure for ConfigMap template generation
4. **src/** (scan for `process.env.SECRET_*` or env var references) — discover required secret keys

From these, extract:
- `APP_NAME`: kebab-case app name (e.g. `new-sensor-api`)
- `APP_KEY`: key used in helm values `apps.<APP_KEY>` — check AGENTS.md or infer from app directory name
- `ARGOCD_APP_NAME`: `<APP_NAME>-iot` (e.g. `new-sensor-api-iot`)
- `APPSET_NAME`: PascalCase filename (e.g. `NewSensorApiIot`)
- `DOCKER_IMAGE`: Docker Hub repo from AGENTS.md (e.g. `radoslavirha/new-sensor`)
- `HTTP_PORT`: from Dockerfile EXPOSE (default: 4000)
- `UDP_PORT`: from Dockerfile EXPOSE if present — omit all UDP config if absent
- `SECRET_GROUPS`: list of credential groups, each with:
  - `name`: group identifier (e.g. `mqtt`, `mongodb`)
  - `secret_name`: K8s secret name `<APP_NAME>-<group>-credentials`
  - `bao_path_suffix`: OpenBao path suffix from AGENTS.md (e.g. `new-sensor-api-emqx`)
  - `keys`: list of `{ secretKey, property }` pairs discovered from code + AGENTS.md

If anything is ambiguous or missing from the above sources, ask the user before proceeding.

## Step 3 — Read homelab template patterns via GitHub MCP

Read these files from `radoslavirha/homelab` (branch: `main`) to use as structural templates:

1. `gitops/argocd-manifests/apps/apps/MiotBridgeApiIot.yaml` — ApplicationSet structure
2. `gitops/helm-values/apps/miot-bridge-api-iot/base.yaml` — base values structure
3. `gitops/helm-values/apps/miot-bridge-api-iot/production.yaml` — production config template pattern
4. `gitops/helm-values/apps/miot-bridge-api-iot/sandbox.yaml` — sandbox config template pattern
5. `gitops/k8s-manifests/server2/miot-bridge-api-iot/production/ExternalSecret.mqtt.yaml` — ExternalSecret structure
6. `docs/architecture.md` — technology stack table (to append a new row)

## Step 4 — Generate all files

Use Step 3 templates as structural guides. Substitute the new app's values everywhere. Think through each file before generating — raise questions early.

### A. ArgoCD ApplicationSet
**File:** `gitops/argocd-manifests/apps/apps/<APPSET_NAME>.yaml`

Copy MiotBridgeApiIot.yaml. Substitute:
- `metadata.name` → `<ARGOCD_APP_NAME>`
- `template.metadata.name` → `<ARGOCD_APP_NAME>-{{cluster}}-{{env}}`
- `helm.releaseName` → `<ARGOCD_APP_NAME>`
- All `miot-bridge-api-iot` references in valueFiles → `<ARGOCD_APP_NAME>`
- k8s-manifests path → `gitops/k8s-manifests/{{cluster}}/<ARGOCD_APP_NAME>/{{env}}`
- **If app has no secrets:** remove the third `sources` block (k8s-manifests)

### B. Helm base values
**File:** `gitops/helm-values/apps/<ARGOCD_APP_NAME>/base.yaml`

```yaml
# <ARGOCD_APP_NAME> — shared base values

apps:
  <APP_KEY>:
    image:
      repository: <DOCKER_IMAGE>
      tag: "0.1.0"          # GitHub Actions bumps this on every release
      pullPolicy: Always
    replicas: 1
    resources:
      requests:
        cpu: 250m
        memory: 250Mi
      limits:
        cpu: 500m
        memory: 500Mi
    labels:
      component: api
      partOf: iot
    services:
      http:
        enabled: true
        protocol: TCP
        port: 80
        targetPort: <HTTP_PORT>
      # include udp block only if UDP_PORT found:
      udp:
        enabled: true
        protocol: UDP
        port: <UDP_PORT>
        targetPort: <UDP_PORT>
    ingress:
      enabled: true
      serviceRef: http
      pathName: <APP_NAME>
    # include udpIngress only if UDP:
    udpIngress:
      enabled: true
      serviceRef: udp
      # entrypoint defined per-env
    # include secretRefs only if SECRET_GROUPS non-empty:
    secretRefs:
      - name: <APP_NAME>-<group>-credentials
        keys:
          - SECRET_<GROUP>_<APP>_<FIELD>
          # ... one entry per key in the group
    templates:
      config:
        file: production.json
        path: /home/app/config
        # content defined per-env
```

### C. Helm production values
**File:** `gitops/helm-values/apps/<ARGOCD_APP_NAME>/production.yaml`

Generate `apps.<APP_KEY>.templates.config.content` as inline JSON using the config schema from Step 2.

Template variable conventions (follow miot-bridge pattern exactly):
- Port values: `{{ CONTAINER_PORT }}`, `{{ CONTAINER_UDP_PORT }}`
- App identity: `{{ APPLICATION }}`, `{{ COMPONENT }}`, `{{ PATH_NAME }}`, `{{ APPLICATION_GROUP }}`, `{{ NAMESPACE }}`
- Cluster vars: `{{ VAR_PROTOCOL }}`, `{{ VAR_PUBLIC_DOMAIN }}`, `{{ VAR_MQTT_URL }}`, `{{ VAR_MONGODB_URL }}`
- Secrets: `{{ SECRET_<GROUP>_<APP>_<FIELD> }}` — must match keys in `secretRefs`
- Production publicURL: `{{ VAR_PROTOCOL }}://{{ COMPONENT }}.{{ VAR_PUBLIC_DOMAIN }}/{{ APPLICATION_GROUP }}/{{ PATH_NAME }}`
- MQTT clientId: `<APP_NAME>-production`
- MQTT topicPrefix: `{{ APPLICATION_GROUP }}/`
- OTel debug: omit (false by default)
- If UDP: `udpIngress.entrypoint: <UDP_ENTRYPOINT_PRODUCTION>` from AGENTS.md

### D. Helm sandbox values
**File:** `gitops/helm-values/apps/<ARGOCD_APP_NAME>/sandbox.yaml`

Same as production with these sandbox differences:
- publicURL: `{{ VAR_PROTOCOL }}://{{ VAR_SUBDOMAIN }}.{{ COMPONENT }}.{{ VAR_PUBLIC_DOMAIN }}/...`
- MQTT clientId: `<APP_NAME>-sandbox`
- MQTT topicPrefix: `{{ APPLICATION_GROUP }}/{{ NAMESPACE }}/`
- OTel `debug: true`
- If UDP: `udpIngress.entrypoint: <UDP_ENTRYPOINT_SANDBOX>` from AGENTS.md

### E. ExternalSecrets
**Files per secret group × 2 envs:**
- `gitops/k8s-manifests/server2/<ARGOCD_APP_NAME>/production/ExternalSecret.<group>.yaml`
- `gitops/k8s-manifests/server2/<ARGOCD_APP_NAME>/sandbox/ExternalSecret.<group>.yaml`

Copy ExternalSecret.mqtt.yaml structure. Per file substitute:
- `metadata.name` + `target.name` → `<APP_NAME>-<group>-credentials`
- `metadata.namespace` → `production` or `sandbox`
- `data[].remoteRef.key` → `server2/<env>/<bao_path_suffix>`
- `data[].secretKey` / `data[].remoteRef.property` → from the group's key list

**Skip this entire section if no SECRET_GROUPS.**

### F. docs/architecture.md row
Read the current technology stack table in `docs/architecture.md`. Append a row following the existing format:

```
| <APP_DESCRIPTION> | server2 | ArgoCD (AppSet) | [`radoslavirha/<IMAGE_NAME>`](https://hub.docker.com/r/radoslavirha/<IMAGE_NAME>) | [base](gitops/helm-values/apps/<ARGOCD_APP_NAME>/base.yaml) · [prod](gitops/helm-values/apps/<ARGOCD_APP_NAME>/production.yaml) · [sbx](gitops/helm-values/apps/<ARGOCD_APP_NAME>/sandbox.yaml) | — |
```

## Step 5 — Create branch + push all files via GitHub MCP

1. Create branch in `radoslavirha/homelab`: `feat/onboard-<ARGOCD_APP_NAME>` (base: `main`)
2. Push each file via `create_or_update_file`:
   - Commit message per file: `feat: scaffold <ARGOCD_APP_NAME> — <filename>`
   - Or batch into fewer commits if the MCP tool supports multi-file commits
3. Confirm all files are pushed before opening PR

## Step 6 — Open PR in radoslavirha/homelab

- **Title:** `feat: onboard <ARGOCD_APP_NAME> to server2`
- **Body:**

```markdown
## Onboard <ARGOCD_APP_NAME>

Scaffolded by agent from `radoslavirha/iot-miniservers`.

### Files generated
- `gitops/argocd-manifests/apps/apps/<APPSET_NAME>.yaml`
- `gitops/helm-values/apps/<ARGOCD_APP_NAME>/base.yaml`
- `gitops/helm-values/apps/<ARGOCD_APP_NAME>/production.yaml`
- `gitops/helm-values/apps/<ARGOCD_APP_NAME>/sandbox.yaml`
- `gitops/k8s-manifests/server2/<ARGOCD_APP_NAME>/production/ExternalSecret.*.yaml`
- `gitops/k8s-manifests/server2/<ARGOCD_APP_NAME>/sandbox/ExternalSecret.*.yaml`
- `docs/architecture.md` (new row)

### TODO before first ArgoCD sync — seed OpenBao secrets

```sh
# production
bao kv put secret/server2/production/<bao_path_suffix_1> <key1>=<value> <key2>=<value>
bao kv put secret/server2/production/<bao_path_suffix_2> ...

# sandbox
bao kv put secret/server2/sandbox/<bao_path_suffix_1> ...
bao kv put secret/server2/sandbox/<bao_path_suffix_2> ...
```

### Notes
- Image tag `"0.1.0"` is a placeholder — GitHub Actions will overwrite on first release
- Verify UDP Traefik entrypoint names before merge
```

## Notes
- Never generate secrets or real credentials — only the ExternalSecret K8s manifests that reference OpenBao paths
- If the app config schema is complex or ambiguous, show the generated JSON template to the user for review before pushing
- Image tag is always `"0.1.0"` — do not try to detect or query a real version
