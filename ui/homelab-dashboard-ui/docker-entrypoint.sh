#!/bin/sh
set -e

CONFIG=/usr/share/nginx/html/config.json
TEMPLATE=/etc/nginx/nginx.conf.template
OUTPUT=/etc/nginx/conf.d/default.conf

# Prefer an explicit env var; otherwise derive from config.json (single source of truth).
if [ -z "$UNIFI_HOST" ]; then
  if [ ! -f "$CONFIG" ]; then
    echo "ERROR: $CONFIG not found. Mount it via ConfigMap or bind-mount." >&2
    exit 1
  fi
  UNIFI_HOST=$(jq -r '.unifi.host // empty' "$CONFIG")
fi

if [ -z "$UNIFI_HOST" ]; then
  echo "ERROR: unifi.host missing from $CONFIG and UNIFI_HOST env var not set." >&2
  exit 1
fi

echo "[homelab-dashboard-ui] proxying Unifi API via $UNIFI_HOST"

export UNIFI_HOST
envsubst '${UNIFI_HOST}' < "$TEMPLATE" > "$OUTPUT"

exec nginx -g 'daemon off;'
