# @radoslavirha/nginx-runtime

Shared nginx assets for the SPA images in this repo. Ships **no JavaScript** — these
files are copied into an image by a `Dockerfile`, not imported.

Spec: `docs/superpowers/specs/2026-08-06-iot-app-health-checks-frontend.md`.

## Contents

| File | Purpose |
| --- | --- |
| `conf.d/healthz.conf` | The `/healthz` probe endpoint. `include` it from every UI's nginx config. |
| `docker-entrypoint.d/05-validate-runtime-config.sh` | Generic guard: the runtime config exists and parses as JSON. |

## Usage

In the root `Dockerfile`, in each UI's final stage:

```dockerfile
COPY packages/nginx-runtime/conf.d/healthz.conf /etc/nginx/snippets/healthz.conf
COPY packages/nginx-runtime/docker-entrypoint.d/05-validate-runtime-config.sh /docker-entrypoint.d/
RUN chmod +x /docker-entrypoint.d/05-validate-runtime-config.sh
```

The image needs `jq` (`apk add --no-cache jq=<pinned>`).

In the app's `nginx.conf` **and** `nginx.conf.template`, inside `server { … }`:

```nginx
    include /etc/nginx/snippets/healthz.conf;
```

Both files, so a bare `docker run` behaves like production. Put it above any
`${NGINX_BASE_PATH}` locations for readability — `location =` wins regardless of
position, but a reader should not have to know that.

## What this package does *not* do

**It does not validate the config against a schema.** That runs in a separate
initContainer the `iot-applications` chart generates from
`templates.<name>.validate`, using the app's own Zod schema compiled into an
`<app>-config-validator` image.

The split is deliberate: schema rules live in one place (the app's Zod module,
shared with the browser), and this package stays reusable by any UI regardless of
what its config looks like. If you find yourself adding app-specific checks to
the entrypoint hook, stop — that is the duplication the design exists to avoid.

## Testing

`pnpm run test:docker` builds a scratch nginx image with the hook installed and
asserts the guard's behaviour. Requires Docker; not part of `pnpm run test`,
which must stay runnable without a daemon.

## Moving to toolkit-hub

When this becomes a published `@radoslavirha/nginx-runtime`, the `COPY` source
changes from a repo path to `node_modules/@radoslavirha/nginx-runtime/...` in the
`deps` stage. Nothing else about the usage changes.
