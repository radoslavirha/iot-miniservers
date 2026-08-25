ARG BUILD_FROM=node:24-trixie-slim

# hadolint ignore=DL3006
FROM $BUILD_FROM AS base

LABEL maintainer="radoslav.irha@gmail.com"
ENV LANG=C.UTF-8
RUN npm install -g pnpm@11

FROM base AS deps

WORKDIR /usr/src/app
COPY . .
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    pnpm install --frozen-lockfile
RUN pnpm --filter './packages/**' run build

# ─── interactive-map-feeder-api ────────────────────────────────────────────────────
FROM deps AS build-interactive-map-feeder-api

RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    pnpm --filter=interactive-map-feeder-api run build && \
    pnpm deploy --filter=interactive-map-feeder-api --prod /prod/interactive-map-feeder-api

FROM base AS interactive-map-feeder-api

COPY --from=build-interactive-map-feeder-api /prod/interactive-map-feeder-api /home/app
WORKDIR /home/app
ENV NODE_ENV=production
CMD ["node", "--import", "@swc-node/register/esm-register", "--import", "/home/app/dist/otel/instrument.js", "dist/index.js"]

# ─── miot-bridge-api ───────────────────────────────────────────────────────────────
FROM deps AS build-miot-bridge-api

RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    pnpm --filter=miot-bridge-api run build && \
    pnpm deploy --filter=miot-bridge-api --prod /prod/miot-bridge-api

FROM base AS miot-bridge-api

COPY --from=build-miot-bridge-api /prod/miot-bridge-api /home/app
WORKDIR /home/app
ENV NODE_ENV=production
CMD ["node", "--import", "@swc-node/register/esm-register", "--import", "/home/app/dist/otel/instrument.js", "dist/index.js"]

# ─── qr-manager-api ────────────────────────────────────────────────────────────
FROM deps AS build-qr-manager-api

RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    pnpm --filter=qr-manager-api run build && \
    pnpm deploy --filter=qr-manager-api --prod /prod/qr-manager-api

FROM base AS qr-manager-api

COPY --from=build-qr-manager-api /prod/qr-manager-api /home/app
WORKDIR /home/app
ENV NODE_ENV=production
CMD ["node", "--import", "@swc-node/register/esm-register", "--import", "/home/app/dist/otel/instrument.js", "dist/index.js"]

# ─── homelab-dashboard-ui ──────────────────────────────────────────────────────
FROM deps AS build-homelab-dashboard-ui

RUN pnpm --filter=homelab-dashboard-ui run build

FROM nginx:1.29-alpine AS homelab-dashboard-ui

RUN apk add --no-cache jq=1.8.1-r0

# dist/ carries no config.json: vite.config.ts sets build.copyPublicDir false so
# the development config — placeholder API key included — never enters the image.
COPY --from=build-homelab-dashboard-ui /usr/src/app/ui/homelab-dashboard-ui/dist /usr/share/nginx/html
COPY packages/nginx-runtime/conf.d/healthz.conf /etc/nginx/snippets/healthz.conf
COPY packages/nginx-runtime/docker-entrypoint.d/05-validate-runtime-config.sh /docker-entrypoint.d/
COPY ui/homelab-dashboard-ui/docker-entrypoint.d/10-require-unifi-env.sh /docker-entrypoint.d/
# The stock entrypoint renders /etc/nginx/templates/*.template into conf.d.
COPY ui/homelab-dashboard-ui/nginx.conf.template /etc/nginx/templates/default.conf.template
RUN chmod +x /docker-entrypoint.d/05-validate-runtime-config.sh /docker-entrypoint.d/10-require-unifi-env.sh
EXPOSE 80
# ENTRYPOINT / CMD / STOPSIGNAL are inherited from the base image on purpose:
# STOPSIGNAL SIGQUIT is what makes nginx shut down gracefully instead of
# dropping in-flight requests, and the stock entrypoint keeps nginx as PID 1.
# See rule F4 in docs/superpowers/specs/2026-08-06-iot-app-health-checks-frontend.md.

# ─── homelab-dashboard-ui-config-validator ─────────────────────────────────────
FROM deps AS build-homelab-dashboard-ui-validator

RUN pnpm --filter=homelab-dashboard-ui run build:validator

FROM node:24-alpine AS homelab-dashboard-ui-config-validator

COPY --from=build-homelab-dashboard-ui-validator \
     /usr/src/app/ui/homelab-dashboard-ui/dist-validator/validate-config.js /app/validate-config.js
# Reads one file and exits — nothing here needs root.
#
# Numeric UID, NOT `node`. Kubernetes verifies runAsNonRoot against the image's
# configured user, and cannot map a username to a UID — that mapping lives in
# the image's /etc/passwd, which the kubelet does not read. With `USER node` it
# fails closed: CreateContainerConfigError "container has runAsNonRoot and image
# has non-numeric user (node), cannot verify user is non-root", and the pod never
# leaves Init. 1000 is the node user in node:*-alpine.
USER 1000
ENTRYPOINT ["node", "/app/validate-config.js"]
# Local-run convenience only. In-cluster the chart supplies the path as an arg,
# derived from templates.<name>.file — never hardcode a filename here.
CMD ["/config/config.json"]

# ─── qr-manager-ui ─────────────────────────────────────────────────────────────
FROM deps AS build-qr-manager-ui

RUN pnpm --filter=qr-manager-ui run build

FROM nginx:1.29-alpine AS qr-manager-ui

RUN apk add --no-cache jq=1.8.1-r0

# dist/ carries no config.json: vite.config.ts sets build.copyPublicDir false so
# the development config never enters the image. A ConfigMap that fails to mount
# is therefore a hard failure, not a pod quietly serving localhost defaults.
COPY --from=build-qr-manager-ui /usr/src/app/ui/qr-manager-ui/dist /usr/share/nginx/html
COPY packages/nginx-runtime/conf.d/healthz.conf /etc/nginx/snippets/healthz.conf
COPY packages/nginx-runtime/docker-entrypoint.d/05-validate-runtime-config.sh /docker-entrypoint.d/
# Template is processed at container start by the nginx image's built-in
# envsubst entrypoint. Set NGINX_BASE_PATH env var in the deployment
# (e.g. /qr-manager or /) to configure the sub-path at runtime.
COPY ui/qr-manager-ui/nginx.conf.template /etc/nginx/templates/default.conf.template
RUN chmod +x /docker-entrypoint.d/05-validate-runtime-config.sh
EXPOSE 80
ENV NGINX_BASE_PATH=/
# ENTRYPOINT / CMD / STOPSIGNAL inherited from the base image — rule F4.

# ─── qr-manager-ui-config-validator ────────────────────────────────────────────
FROM deps AS build-qr-manager-ui-validator

RUN pnpm --filter=qr-manager-ui run build:validator

FROM node:24-alpine AS qr-manager-ui-config-validator

COPY --from=build-qr-manager-ui-validator \
     /usr/src/app/ui/qr-manager-ui/dist-validator/validate-config.js /app/validate-config.js
# Reads one file and exits — nothing here needs root.
#
# Numeric UID, NOT `node`. Kubernetes verifies runAsNonRoot against the image's
# configured user, and cannot map a username to a UID — that mapping lives in
# the image's /etc/passwd, which the kubelet does not read. With `USER node` it
# fails closed: CreateContainerConfigError "container has runAsNonRoot and image
# has non-numeric user (node), cannot verify user is non-root", and the pod never
# leaves Init. 1000 is the node user in node:*-alpine.
USER 1000
ENTRYPOINT ["node", "/app/validate-config.js"]
# Local-run convenience only. In-cluster the chart supplies the path as an arg,
# derived from templates.<name>.file — never hardcode a filename here.
CMD ["/config/config.json"]
