# App Section Template

The `onboard-to-homelab` skill reads this to discover deployment metadata without parsing code.

## Configuration Compatibility Rule

All configuration changes must be backward compatible for rolling deployments.

- A new ConfigMap may be applied before all old pods are replaced.
- During rollout, old and new application versions may run concurrently.
- Do not require strict rejection of unknown future keys at runtime if that would block old pods.
- Additive changes are preferred; remove legacy keys only after all workloads run a compatible version.

## Required externalApis ConfigMap shape

Update deployment ConfigMaps before rolling new application images. During rollout, old and new
pods run together and must both parse the same config.

`interactive-map-feeder-api`:

```json
{
  "externalApis": {
    "CHMI_PORTAL": {
      "baseURL": "https://intranet.chmi.cz",
      "resilience": {
        "timeout": { "ms": 10000 },
        "retry": { "count": 2, "backoffMs": 500 },
        "circuitBreaker": {}
      },
      "logging": {
        "enabled": true,
        "stack": false
      },
      "retriableStatusCodes": [500, 502, 503, 504, 429, 408]
    },
    "CHMI_OPENDATA": {
      "baseURL": "https://opendata.chmi.cz",
      "resilience": {
        "timeout": { "ms": 10000 },
        "retry": { "count": 2, "backoffMs": 500 },
        "circuitBreaker": {}
      },
      "logging": {
        "enabled": true,
        "stack": false
      },
      "retriableStatusCodes": [500, 502, 503, 504, 429, 408]
    }
  }
}
```

`miot-bridge-api`:

```json
{
  "externalApis": {
    "MIOT_SPEC": {
      "baseURL": "https://miot-spec.org/miot-spec-v2",
      "resilience": {
        "timeout": { "ms": 10000 },
        "retry": { "count": 2, "backoffMs": 500 },
        "circuitBreaker": {}
      },
      "logging": {
        "enabled": true,
        "stack": false
      },
      "retriableStatusCodes": [500, 502, 503, 504, 429, 408]
    }
  }
}
```

Known enum keys are required. Unknown extra keys are tolerated and stripped at runtime for
rolling-deployment compatibility.

---

## App: <app-name>

Brief description of what this app does.

### Homelab deployment metadata

- **Docker Hub image:** `radoslavirha/<image-name>`
- **Helm values key:** `apps.<appKey>` (the key under `apps:` in helm values, e.g. `miot-bridge-api`)
- **ArgoCD app name:** `<app-name>-iot`
- **HTTP port:** 4000 (or whatever the app listens on)
- **UDP port:** 4000 (omit line if no UDP)
- **Traefik UDP entrypoints:** `production=udp-<app>-prod`, `sandbox=udp-<app>-sbx` (omit if no UDP)

### Secret groups

Each group becomes one ExternalSecret in each namespace (production + sandbox).

```
group: mqtt
  OpenBao path suffix: <app-name>-emqx
  keys:
    SECRET_MQTT_<APP>_USERNAME  ← mqtt-username
    SECRET_MQTT_<APP>_PASSWORD  ← mqtt-password

group: mongodb
  OpenBao path suffix: <app-name>-mongodb
  keys:
    SECRET_MONGODB_DATABASE     ← mongodb-database
    SECRET_MONGODB_USERNAME     ← mongodb-username
    SECRET_MONGODB_PASSWORD     ← mongodb-password
```

Omit this section entirely if the app has no secrets.

### Config structure notes

Describe any non-obvious config.json fields that the agent should know about when generating
the ConfigMap template. E.g.:
- Which fields use VAR_* cluster variables vs hardcoded values
- Any fields that differ meaningfully between production and sandbox beyond the standard patterns
- Fields that should be omitted or left as empty strings in the template

---

## Example (filled in for miot-bridge-api)

## App: miot-bridge-api

MQTT-to-MongoDB bridge for Loxone IoT miniserver data ingestion.

### Homelab deployment metadata

- **Docker Hub image:** `radoslavirha/miot-bridge-api`
- **Helm values key:** `apps.miot-bridge-api`
- **ArgoCD app name:** `miot-bridge-api`
- **HTTP port:** 4000
- **UDP port:** 4000
- **Traefik UDP entrypoints:** `production=udp-miot-prod`, `sandbox=udp-miot-sbx`

### Secret groups

```
group: mqtt
  OpenBao path suffix: miot-bridge-api-emqx
  keys:
    SECRET_MQTT_MIOT_BRIDGE_USERNAME  ← mqtt-username
    SECRET_MQTT_MIOT_BRIDGE_PASSWORD  ← mqtt-password

group: mongodb
  OpenBao path suffix: miot-bridge-api-mongodb
  keys:
    SECRET_MONGODB_DATABASE     ← mongodb-database
    SECRET_MONGODB_USERNAME     ← mongodb-username
    SECRET_MONGODB_PASSWORD     ← mongodb-password
```

### Config structure notes

- `udp.notifications.address` is a hardcoded Loxone miniserver IP — use `192.168.1.140:50450`
- `mqtt.topicPrefix` differs: production=`iot/`, sandbox=`iot/{{ NAMESPACE }}/`
- `polling` block is identical across envs — no template vars needed
