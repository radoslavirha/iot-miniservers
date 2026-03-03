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

# ─── interactive-map-feeder ────────────────────────────────────────────────────
FROM deps AS build-interactive-map-feeder

RUN pnpm --filter=interactive-map-feeder run build && \
    pnpm deploy --filter=interactive-map-feeder --prod /prod/interactive-map-feeder

FROM base AS interactive-map-feeder

COPY --from=build-interactive-map-feeder /prod/interactive-map-feeder /home/app
WORKDIR /home/app
ENV NODE_ENV=production
CMD ["pnpm", "start:prod"]

# ─── miot-bridge ───────────────────────────────────────────────────────────────
FROM deps AS build-miot-bridge

RUN pnpm --filter=miot-bridge run build && \
    pnpm deploy --filter=miot-bridge --prod /prod/miot-bridge

FROM base AS miot-bridge

COPY --from=build-miot-bridge /prod/miot-bridge /home/app
WORKDIR /home/app
ENV NODE_ENV=production
CMD ["pnpm", "start:prod"]
