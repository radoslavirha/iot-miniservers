---
"homelab-dashboard-ui": minor
"qr-manager-ui": minor
---

Serve the UIs from nginx-unprivileged as UID 101 on port 8080

Both images move from `nginx:1.29-alpine`, whose master process starts as root,
to `nginxinc/nginx-unprivileged:1.29-alpine`. They were the last containers in
the estate still running as root — the APIs have run as UID 1000 with an
enforced `runAsNonRoot` since 0.13.0 / 0.25.0 / 0.8.0.

**Breaking for deployment:** nginx now binds 8080, because a non-root process
cannot bind a port below 1024. The Service `targetPort` in
`homelab:gitops/helm-values` must move with the image — the two are one change,
not two. Nothing else moves: the probe path is still `/healthz`, the entrypoint
pipeline, its config validation and `STOPSIGNAL SIGQUIT` are unchanged, and
`NGINX_BASE_PATH` still selects the sub-path.
