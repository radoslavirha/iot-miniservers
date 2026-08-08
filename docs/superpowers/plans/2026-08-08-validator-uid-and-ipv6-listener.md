# Validator Image UID + nginx IPv6 Listener

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Repo:** `/Users/radoslavirha/dev/irha/iot-miniservers`.

**Origin:** found while deploying the homelab half of the frontend health-check work on 2026-08-08. Both UIs are live with probes, config validation and graceful shutdown; these are the two things the deployment showed are wrong *here* rather than there.

**Related:**

| Doc | Repo | Relationship |
| --- | --- | --- |
| [`specs/2026-08-06-iot-app-health-checks-frontend.md`](../specs/2026-08-06-iot-app-health-checks-frontend.md) | this repo | The work these two defects came out of. **Both fixes require editing it** — it currently documents the wrong thing in two places |
| `docs/superpowers/plans/2026-08-07-iot-applications-template-validation.md` | `homelab` | Owns the chart side. Already carries the workaround for fix 1 |
| `docs/superpowers/plans/2026-08-06-iot-app-health-checks-homelab.md` | `homelab` | Probe values, deployed and verified |

**Size:** two one-line image changes, four nginx config lines, and corrections to one spec. No package changes, no new dependencies.

**Status (2026-08-08):**

| Fix | State |
| --- | --- |
| 1 — validator UID | **Done.** Both stages use `USER 1000`; frontend spec corrected; changeset written. Not yet released. |
| 2 — IPv6 listener | **Superseded** by [`specs/2026-08-08-nginx-ipv6-listener.md`](../specs/2026-08-08-nginx-ipv6-listener.md). The problem is confirmed real; two claims in the analysis below turned out to be wrong. Implement from the spec, not from this section. |

`AGENTS.md` was left untouched: the backend health-check work is editing it concurrently (a new "Health checks" section), so the "Adding a New UI" row for the numeric UID is **still outstanding** and should be added once that lands.

> **Coordination:** the backend health-check work is in flight in this repo right now — `packages/health`, `packages/tsed-health`, per-API `HealthProvider`s, `packages/otel/src/ignoredPaths.ts` and three changesets are all uncommitted as of 2026-08-08. Nothing in this plan touches any of it: fix 1 is two `Dockerfile` lines in the UI validator stages, fix 2 is four nginx files under `ui/`. Land it on its own branch and keep the changesets separate so the UI patch release is not blocked behind the API work.

---

## Fix 1 — the validator images must declare a numeric UID

### What happened

The moment `validate: true` first synced, the validating initContainer refused to start on both sandbox clusters:

```text
CreateContainerConfigError: container has runAsNonRoot and image has
non-numeric user (node), cannot verify user is non-root
```

The pod sat `Pending` on the init container. Nothing served a bad config — the previous pod kept the ingress at HTTP 200 throughout — but the rollout was stuck until the chart was patched.

### Why

Both validator stages end with:

```dockerfile
USER node
```

`node` is a **name**. Kubernetes resolves `runAsNonRoot: true` by inspecting the image's configured user, and it cannot map a name to a UID — that mapping lives in the image's `/etc/passwd`, which the kubelet does not read. So it fails closed and refuses the container.

Only a numeric UID in the image config satisfies `runAsNonRoot` on its own.

### Why fix it here, when homelab already worked around it

The chart now defaults `runAsUser: 1000` on the generated initContainer, so nothing is broken today. But that default is a fact about *your image* encoded in *someone else's* chart:

- Any other consumer applying a standard restricted securityContext hits the same error, and has to rediscover the same fix.
- If a future validator ever moves to a different base image with a different UID, the chart's `1000` silently becomes wrong — it would run the validator as a user that may not exist, and `readOnlyRootFilesystem` plus an unknown UID is an unpleasant thing to debug.
- The image is the right place to state who it runs as.

After this fix the chart's `runAsUser` stays as a defensive default, and the coupling is gone. **No homelab change is required** — this is purely a correctness improvement on both sides.

### Steps

- [x] `Dockerfile`, `homelab-dashboard-ui-config-validator` stage (~line 94): `USER node` → `USER 1000`.
- [x] `Dockerfile`, `qr-manager-ui-config-validator` stage (~line 134): same.
- [x] Add a short comment above each, because `USER node` is the obvious-looking thing and someone will change it back:

```dockerfile
# Numeric UID, not `node`. Kubernetes cannot verify runAsNonRoot against a
# username — it fails the container with CreateContainerConfigError
# "image has non-numeric user (node)". 1000 is the node user in node:*-alpine.
USER 1000
```

- [x] Confirm the UID is right for the base image rather than trusting this document:
      `docker run --rm --entrypoint sh node:24-alpine -c 'id node'` → confirmed `uid=1000(node) gid=1000(node)`.
- [x] Checked: no other image declares any `USER` at all. The two validator stages are the only ones, so nothing else is latently affected. (The APIs run as root — that is the PodSecurity item in [Out of scope](#out-of-scope), a different problem.) Original note follows: Check whether any *other* image in the repo declares a non-numeric `USER`. The API and UI images do not today, but they will hit the same wall the moment anyone applies `runAsNonRoot` to them — which is likely, see [Out of scope](#out-of-scope).

### Spec correction (required, not optional)

`specs/2026-08-06-iot-app-health-checks-frontend.md` will otherwise teach the next UI to repeat this:

- [x] Phase FE-F, the validator Dockerfile snippet — change `USER node` to `USER 1000` and carry the comment across.
- [x] The same spec's decision 2 justifies `USER node` as "the cheapest place in the plan to get that right". Keep the intent, fix the mechanism: state that the numeric UID is what makes `runAsNonRoot` satisfiable, and that a username does not.
- [ ] `AGENTS.md`, "Adding a New UI" — if the validator stage is described there, the numeric UID belongs in the required-rows list.

### Verification

- [x] Built and inspected: `.Config.User` = `1000`. `id` inside the container reports `uid=1000(node)`.
- [x] Still reads a config as that user (`exit 0`), and verified under `docker run --read-only` — so `readOnlyRootFilesystem` remains satisfiable.
- [ ] After release and a homelab tag bump, the initContainer runs with the chart's `runAsUser` **removed** in a scratch `helm template` — confirming the image alone satisfies `runAsNonRoot`. Do not commit that removal; it is a check, not a change.

---

## Fix 2 — neither UI listens on IPv6, and the spec's own commands assume they do

### What happened

Verified inside both running pods:

| Target | `qr-manager-ui` | `homelab-dashboard-ui` |
| --- | --- | --- |
| `127.0.0.1/healthz` | `ok` | `ok` |
| `localhost/healthz` | **fails** | **fails** |
| `[::1]/healthz` | **fails** | **fails** |

This is **not** a production defect. The kubelet probes the pod's IPv4 address, so every probe passes and both apps serve normally. What it breaks is anything inside the container that resolves `localhost` — which prefers `::1` — including the verification commands the frontend spec tells the next person to run:

```bash
# specs/2026-08-06-iot-app-health-checks-frontend.md, Verification section
kubectl exec -n sandbox deploy/<qr-manager-ui> -- wget -qO- localhost/healthz
```

That command cannot succeed as written. It reads as "the health endpoint is broken" when the endpoint is fine, which is the worst kind of documentation bug in a health-check spec.

### Why the base image's IPv6 fixup does not help

> **Correction (2026-08-08, verified against the published `qr-manager-ui:0.7.0`).** The two reasons originally given here are both wrong. The conclusion — declare the listener explicitly — is right, but anyone who trusts the old reasoning will waste time reordering entrypoint scripts. What actually happens:
>
> ```text
> 10-listen-on-ipv6-by-default.sh: info: Getting the checksum of /etc/nginx/conf.d/default.conf
> 10-listen-on-ipv6-by-default.sh: info: Enabled listen on IPv6 in /etc/nginx/conf.d/default.conf
> ```
>
> The script **runs and succeeds**. At step 10 `/etc/nginx/conf.d/default.conf` *does* exist — it is the base image's **stock** config — so the checksum matches and the patch is applied. Then at step 20 `envsubst` renders `/etc/nginx/templates/default.conf.template` **over that same path**, discarding the patch. The container ends up listening on `0.0.0.0:80` only.
>
> So: the file is not missing (reason 1), and the checksum does not bail (reason 2) — the patch is simply overwritten.
>
> Renumbering still does not help, but for a third reason: a copy of the script running *after* step 20 would see our rendered config, whose checksum no longer matches the packaged version, and would bail at that guard instead. Upstream's script genuinely cannot serve this case.

`nginx:1.29-alpine` ships `/docker-entrypoint.d/10-listen-on-ipv6-by-default.sh` and it is present in both images. Note that it also guards on `/proc/net/if_inet6` — upstream enables IPv6 **conditionally**, which is the relevant precedent for the risk check below.

So the listener has to be declared explicitly.

### The two `listen` lines also disagree for no reason

```text
ui/homelab-dashboard-ui/nginx.conf.template:2:    listen 80;
ui/homelab-dashboard-ui/nginx.conf:7:            listen 80 default_server;
ui/qr-manager-ui/nginx.conf.template:14:         listen 80 default_server;
ui/qr-manager-ui/nginx.conf:7:                   listen 80 default_server;
```

Four files, three of them agreeing by accident. Same class of drift as the `/healthz` block before it became a shared snippet.

### Risk check — done, not assumed

Adding an IPv6 listener to a container with no IPv6 stack makes nginx fail to bind and CrashLoop the pod, so this was checked in the live pod before recommending it:

```text
lo    inet  127.0.0.1/8
lo    inet6 ::1/128            ← IPv6 loopback present
/proc/sys/net/ipv6/conf/all/disable_ipv6 = 0
```

IPv6 is available in the pod netns on these clusters, so the bind will succeed. Keep the check in the steps below anyway — it is one command and it is the only thing standing between this change and a CrashLoop if the cluster's networking ever changes.

**Additional evidence (2026-08-08).** A scratch image with a hardcoded `listen [::]:80 default_server;` was run with `--sysctl net.ipv6.conf.all.disable_ipv6=1`: nginx **started normally**. Disabling IPv6 by sysctl still leaves the `AF_INET6` socket family available, so the bind succeeds with no addresses. The genuine failure mode is narrower than feared — a kernel built without `AF_INET6` at all (`socket() [::]:80 failed (97: Address family not supported by protocol)`), which is what upstream's `/proc/net/if_inet6` guard exists for and is theoretical on these nodes.

That makes hardcoding acceptable. It also rules out the tempting alternative of a conditional entrypoint hook: to be conditional it would have to inject a `listen` line into the correct `server` block of an already-rendered config — string surgery on generated output, which is far more fragile than the risk it avoids.

**Worth restating the motivation, because the doc commands undersell it.** The verification commands are the trivial benefit. The real one is dual-stack: if a cluster ever gains IPv6, the kubelet probes the pod IP of that family, and an IPv4-only listener would start failing probes and killing pods. That is the argument for doing this at all.

### Steps — the nginx configs

- [ ] Add `listen [::]:80;` beside the existing `listen 80 ...;` in all four files:
      `ui/qr-manager-ui/nginx.conf.template`, `ui/qr-manager-ui/nginx.conf`,
      `ui/homelab-dashboard-ui/nginx.conf.template`, `ui/homelab-dashboard-ui/nginx.conf`.
- [ ] Make the four lines identical while you are there. Pick one form — `listen 80 default_server;` + `listen [::]:80 default_server;` — and use it everywhere, with a one-line comment saying why the IPv6 line is explicit (the base image's `10-listen-on-ipv6-by-default.sh` runs before envsubst writes the config, and refuses to patch a non-stock file).
- [ ] `packages/nginx-runtime/README.md` — note that the shared `healthz.conf` is a `location` and therefore cannot carry the `listen` directives; the server block owns them, and both must be present. This is the detail that will otherwise get lost when a third UI copies the snippet and nothing else.
- [ ] Extend `packages/nginx-runtime/test/run.sh` with the case that would have caught this: after the container starts, `wget` the probe path over **`localhost`**, `127.0.0.1` and `[::1]` and assert all three return `ok`. It is a stricter assertion than the probe needs, which is the point — it pins the property the docs claim.

### Spec correction — the verification commands

- [ ] `specs/2026-08-06-iot-app-health-checks-frontend.md`, Verification section — the `localhost/healthz` commands. Once this fix lands they work as written; until then they do not. Either way the spec should say which address it is testing and why, because "localhost" and "the pod IP the kubelet uses" are not the same check.
- [ ] Add one line to that spec's rule F1 or the per-UI analysis: the probe answers on the pod IP, and the container must also listen on IPv6 if anything in-container is going to reach it by name.

### Verification — the listener

- [ ] Local: `docker run` each image and confirm `curl` succeeds against `127.0.0.1`, `localhost` and `[::1]`.
- [ ] Local: confirm nginx still starts on a container with IPv6 disabled, or accept that it will not and say so in the README. `docker run --sysctl net.ipv6.conf.all.disable_ipv6=1 …` reproduces that case.
- [ ] In-cluster after release, on the sandbox pod:
      `kubectl exec -n sandbox <pod> -c <container> -- wget -qO- localhost/healthz` → `ok`
- [ ] Probes unaffected: pod stays `READY 1/1` with `restarts` unchanged. The probe never used `localhost`, so nothing here should move it.

---

## Release and hand-off

- [ ] Changesets: patch for `qr-manager-ui` and `homelab-dashboard-ui`. Fix 1 touches only the validator stage and fix 2 only nginx config, so neither changes app behaviour in the browser — but both change the published images, so both need a version.
- [ ] `pnpm run verify`.
- [ ] Merge → the release workflow builds all four images (two apps, two validators) from the same commit, and the deploy action bumps `image.tag` in `homelab` via each app's `deploy.json`. The chart derives the validator tag from the app tag, so both move together with no second edit.
- [ ] **`homelab-dashboard-ui` has no sandbox.** Its tag bump goes straight to `gitops/helm-values/server3/homelab-dashboard-ui.yaml` and rolls the live dashboard. With `maxUnavailable: 0` and init validation in place the new pod must pass its own validator before the old one is torn down, so the blast radius is a stuck ReplicaSet rather than a downed dashboard — but watch the first rollout rather than assuming.
- [ ] Nothing in `homelab` needs changing for either fix. Tell whoever is watching that the chart's `runAsUser: 1000` is now redundant-but-harmless, so they do not remove it in the same window as this release and confuse two variables.

---

## Out of scope

- **Multi-arch images.** All images are amd64-only and every cluster node is amd64. Expected, not a defect.
- **PodSecurity `restricted`.** These namespaces run it in warn mode and no app container satisfies it — `kubectl rollout restart` prints a warning naming the nginx and jinja2 containers for `runAsNonRoot`, `allowPrivilegeEscalation`, `capabilities.drop` and `seccompProfile`. The nginx images run their master process as root, so closing this properly means `nginxinc/nginx-unprivileged` as the base, a port change from 80 to 8080, and matching `services.*.targetPort` in the homelab values. Real work, worth doing, its own plan. Note the overlap: fix 1 above is the same class of problem (an image that cannot satisfy a securityContext), one container earlier.
- **The `:latest` tag on the validator images.** Published alongside the versioned tag. Harmless while the chart pins by version, but it is a tag that invites someone to pin it and lose the lockstep guarantee. Not worth a change on its own.
