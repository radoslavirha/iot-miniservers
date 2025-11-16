ARG BUILD_FROM=ghcr.io/home-assistant/aarch64-base-debian:bookworm
# hadolint ignore=DL3006
FROM $BUILD_FROM AS base

LABEL maintainer="radoslav.irha@gmail.com"

ENV LANG=C.UTF-8

WORKDIR /home/app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
# hadolint ignore=DL4006
RUN apt-get update                                              && \
    apt-get install -y --no-install-recommends                     \
        curl=7.88.1-10+deb12u8                                  && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash -   && \
    apt-get install -y --no-install-recommends                     \
        nodejs=22.14.0-1nodesource1                             && \
    apt-get clean                                               && \
    rm -rf /var/lib/apt/lists/*                                 && \
    corepack enable pnpm

COPY . .

CMD [ "pnpm", "start:prod" ]

FROM base AS prod-deps
# hadolint ignore=DL3016
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc               \
    pnpm install --prod --frozen-lockfile

FROM base AS build
# hadolint ignore=DL3016
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc               \
    pnpm install --frozen-lockfile                              && \
    pnpm run build    

FROM base
COPY --from=prod-deps /home/app/node_modules /home/app/node_modules
COPY --from=build /home/app/dist /home/app/dist
ENV NODE_ENV=production
