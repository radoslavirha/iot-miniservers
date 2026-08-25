#!/bin/sh
# UNIFI_HOST and SECRET_UNIFI_API_KEY are consumed by the nginx template
# (proxy_pass and proxy_set_header). They are NOT in config.json, so the
# validating initContainer cannot check them — this is where that fail-fast
# property lives for them instead.
#
# Runs after 05-validate-runtime-config.sh and before
# 20-envsubst-on-templates.sh, which is what substitutes both values into
# default.conf.template. The 10- prefix is what keeps that ordering.
#
# Never print the values.
set -eu

fatal() { echo "[homelab-dashboard-ui] FATAL: $*" >&2; exit 1; }

[ -n "${UNIFI_HOST:-}" ] || fatal "UNIFI_HOST is empty — set it in the app's env: block."
[ -n "${SECRET_UNIFI_API_KEY:-}" ] || fatal "SECRET_UNIFI_API_KEY is empty — check the secretRef and that ESO synced it."

echo "[homelab-dashboard-ui] Unifi proxy configuration present"
