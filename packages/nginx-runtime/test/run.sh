#!/usr/bin/env bash
# Asserts the entrypoint guard's behaviour against a real nginx image.
#
# Confirms the load-bearing assumption that the stock nginx entrypoint runs
# /docker-entrypoint.d/*.sh under `set -e`, so a failing hook aborts the start
# before nginx binds. If that ever stops being true, this fails loudly rather
# than leaving a guard that silently does nothing.
#
# Requires Docker. Not part of `pnpm run test`.
set -euo pipefail

cd "$(dirname "$0")/.."

IMAGE="nginx-runtime-test:local"
CONTAINER="nginx-runtime-test-run"
SENTINEL="s3cr3t-sentinel-value"
WORK="$(mktemp -d)"
cleanup() {
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    docker rmi -f "$IMAGE" >/dev/null 2>&1 || true
    rm -rf "$WORK"
}
trap cleanup EXIT

pass=0
fail=0
ok()  { printf '  \033[32mPASS\033[0m %s\n' "$1"; pass=$((pass + 1)); }
bad() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=$((fail + 1)); }

cat > "$WORK/Dockerfile" <<'EOF'
FROM nginx:1.29-alpine
RUN apk add --no-cache jq
COPY healthz.conf /etc/nginx/snippets/healthz.conf
COPY 05-validate-runtime-config.sh /docker-entrypoint.d/
COPY default.conf /etc/nginx/conf.d/default.conf
RUN chmod +x /docker-entrypoint.d/05-validate-runtime-config.sh
EOF

# Mirrors a real UI: an SPA catch-all that would happily swallow /healthz if the
# location were a prefix match rather than an exact one.
cat > "$WORK/default.conf" <<'EOF'
server {
    listen 80 default_server;
    server_name _;
    root /usr/share/nginx/html;
    include /etc/nginx/snippets/healthz.conf;
    location / { try_files $uri $uri/ /index.html; }
}
EOF

cp conf.d/healthz.conf "$WORK/healthz.conf"
cp docker-entrypoint.d/05-validate-runtime-config.sh "$WORK/05-validate-runtime-config.sh"

echo "building $IMAGE"
docker build -q -t "$IMAGE" "$WORK" >/dev/null

# NOTE: deliberately no --rm. A container that exits with --rm is deleted before
# `docker logs` can read it, which silently turns every failure assertion green.
start() {
    docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
    docker run -d --name "$CONTAINER" "$@" >/dev/null 2>&1 || true
    sleep 3
    LOGS="$(docker logs "$CONTAINER" 2>&1 || true)"
    RUNNING="$(docker inspect -f '{{.State.Running}}' "$CONTAINER" 2>/dev/null || echo false)"
}

config_at() { printf '%s' "$2" > "$WORK/$1"; echo "$WORK/$1"; }

echo
echo "case: valid JSON config"
CFG=$(config_at config.json "{\"apiBaseURL\":\"http://example.test\",\"apiKey\":\"$SENTINEL\"}")
start -v "$CFG:/usr/share/nginx/html/config.json:ro" "$IMAGE"
[ "$RUNNING" = "true" ] && ok "container stays up" || bad "container should stay up"
grep -q 'present and parseable' <<<"$LOGS" && ok "guard logs success" || bad "guard should log success"
grep -q "$SENTINEL" <<<"$LOGS" && bad "SENTINEL LEAKED INTO LOGS" || ok "no config value in logs"

echo
echo "case: config file absent"
start "$IMAGE"
[ "$RUNNING" = "true" ] && bad "container should NOT stay up" || ok "container exits"
grep -q 'not found' <<<"$LOGS" && ok "log names the missing path" || bad "log should name the path"

echo
echo "case: config present but not JSON"
CFG=$(config_at broken.json '{ this is not json')
start -v "$CFG:/usr/share/nginx/html/config.json:ro" "$IMAGE"
[ "$RUNNING" = "true" ] && bad "container should NOT stay up" || ok "container exits"
grep -q 'not valid JSON' <<<"$LOGS" && ok "log says not valid JSON" || bad "log should say not valid JSON"

echo
echo "case: /healthz is an exact match"
CFG=$(config_at ok.json '{"ok":true}')
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
docker run -d --name "$CONTAINER" -p 18080:80 -v "$CFG:/usr/share/nginx/html/config.json:ro" "$IMAGE" >/dev/null
sleep 3
BODY="$(curl -fsS http://localhost:18080/healthz || echo FAILED)"
# Not a 404 check: the SPA catch-all serves index.html for unknown paths, so the
# real question is whether the probe body leaks past the exact-match location.
OTHER="$(curl -fsS http://localhost:18080/healthzzz || echo FAILED)"
LOGLINES="$(docker logs "$CONTAINER" 2>&1 | grep -c 'GET /healthz ' || true)"
docker rm -f "$CONTAINER" >/dev/null 2>&1 || true
[ "$BODY" = "ok" ] && ok "/healthz returns ok" || bad "/healthz returned '$BODY'"
[ "$OTHER" != "ok" ] && ok "/healthzzz does NOT hit the probe (exact match)" || bad "/healthzzz returned 'ok' — prefix match"
[ "$LOGLINES" = "0" ] && ok "/healthz is not access-logged" || bad "/healthz appeared in the access log $LOGLINES times"

echo
echo "passed: $pass  failed: $fail"
[ "$fail" -eq 0 ]
