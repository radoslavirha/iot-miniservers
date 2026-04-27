ARG BUILD_FROM=node:24-trixie-slim

# hadolint ignore=DL3006
FROM $BUILD_FROM AS base

LABEL maintainer="radoslav.irha@gmail.com"
ENV LANG=C.UTF-8
RUN corepack enable pnpm

FROM base AS deps

WORKDIR /usr/src/app
COPY . .
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    pnpm install --frozen-lockfile
RUN pnpm --filter './packages/**' run build

# ─── interactive-map-feeder-api ────────────────────────────────────────────────────
FROM deps AS build-interactive-map-feeder-api

RUN pnpm --filter=interactive-map-feeder-api run build && \
    pnpm deploy --filter=interactive-map-feeder-api --prod /prod/interactive-map-feeder-api

FROM base AS interactive-map-feeder-api

COPY --from=build-interactive-map-feeder-api /prod/interactive-map-feeder-api /home/app
WORKDIR /home/app
ENV NODE_ENV=production
CMD ["pnpm", "start:prod"]

# ─── miot-bridge-api ───────────────────────────────────────────────────────────────
FROM deps AS build-miot-bridge-api

RUN pnpm --filter=miot-bridge-api run build && \
    pnpm deploy --filter=miot-bridge-api --prod /prod/miot-bridge-api

FROM base AS miot-bridge-api

COPY --from=build-miot-bridge-api /prod/miot-bridge-api /home/app
WORKDIR /home/app
ENV NODE_ENV=production
CMD ["pnpm", "start:prod"]

# ─── qr-manager-api ────────────────────────────────────────────────────────────
FROM deps AS build-qr-manager-api

RUN pnpm --filter=qr-manager-api run build && \
    pnpm deploy --filter=qr-manager-api --prod /prod/qr-manager-api

FROM base AS qr-manager-api

COPY --from=build-qr-manager-api /prod/qr-manager-api /home/app
WORKDIR /home/app
ENV NODE_ENV=production
CMD ["pnpm", "start:prod"]

# ─── qr-manager-ui ─────────────────────────────────────────────────────────────
FROM deps AS build-qr-manager-ui

RUN pnpm --filter=qr-manager-ui run build

FROM nginx:1.29-alpine AS qr-manager-ui

COPY --from=build-qr-manager-ui /usr/src/app/ui/qr-manager-ui/dist /usr/share/nginx/html
COPY ui/qr-manager-ui/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
