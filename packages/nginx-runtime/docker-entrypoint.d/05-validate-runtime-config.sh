#!/bin/sh
# Generic guard: the runtime config must exist and be parseable JSON.
#
# This is NOT the real gate. Schema validation runs in the validating
# initContainer the chart generates from `templates.<name>.validate`, against
# the app's own Zod schema. This hook exists so a bare `docker run` (no
# initContainer) fails loudly instead of serving a blank page, and as defence
# in depth if an app is ever deployed without opting in.
#
# Keep this file schema-free. The moment it grows per-app knowledge, the
# duplication the design avoids is back.
#
# Runs from the stock nginx entrypoint (/docker-entrypoint.d, sorted order,
# `set -e`), so a non-zero exit aborts before nginx binds. Numbered 05 so it
# runs before 20-envsubst-on-templates.sh and any *.envsh that reads the config.
#
# NEVER print config values — homelab-dashboard-ui's config.json holds a secret.
set -eu

CONFIG_PATH="${RUNTIME_CONFIG_PATH:-/usr/share/nginx/html/config.json}"

fatal() { echo "[nginx-runtime] FATAL: $*" >&2; exit 1; }

[ -f "$CONFIG_PATH" ] \
    || fatal "$CONFIG_PATH not found — the chart mounts it from templates.config."

jq -e . "$CONFIG_PATH" >/dev/null 2>&1 \
    || fatal "$CONFIG_PATH is not valid JSON."

echo "[nginx-runtime] runtime config present and parseable ($CONFIG_PATH)"
