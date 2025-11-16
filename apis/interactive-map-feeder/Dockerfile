ARG BUILD_FROM=node:24-trixie-slim
# hadolint ignore=DL3006
FROM $BUILD_FROM AS base

LABEL maintainer="radoslav.irha@gmail.com"

ENV LANG=C.UTF-8

WORKDIR /home/app

# ENV PNPM_HOME="/pnpm"
# ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable pnpm

COPY . .

CMD [ "pnpm", "start:prod" ]

FROM base
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc               \
    pnpm install --frozen-lockfile                              && \
    pnpm run build                                              && \
    pnpm prune --prod 

ENV NODE_ENV=production
