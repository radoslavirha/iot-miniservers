# nginx UIs — Declare an IPv6 Listener

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Repo:** `/Users/radoslavirha/dev/irha/iot-miniservers`.

**Goal:** both nginx images listen on IPv6 as well as IPv4, so the probe path is reachable by name from inside the container and the containers stay correct if a cluster ever becomes dual-stack.

**Supersedes:** fix 2 of [`plans/2026-08-08-validator-uid-and-ipv6-listener.md`](../plans/2026-08-08-validator-uid-and-ipv6-listener.md). That plan's fix 1 (numeric validator UID) is done; its fix 2 analysis was investigated and **two of its claims turned out to be wrong** — both corrected below. Read this file, not that section.

**Size:** four nginx config lines, one test case, two doc corrections. No package changes, no new dependencies, **no homelab change**.

---

## The problem, verified

Measured inside the published `qr-manager-ui:0.7.0` and `homelab-dashboard-ui:0.4.0`:

| Target | Result |
| --- | --- |
| `http://127.0.0.1/healthz` | `ok` |
| `http://localhost/healthz` | **fails** |
| `http://[::1]/healthz` | **fails** |

```text
$ netstat -tln
tcp   0   0 0.0.0.0:80    0.0.0.0:*   LISTEN      ← IPv4 only
```

IPv6 *is* available in the container (`/proc/net/if_inet6` present); nginx simply is not listening on it.

### The three APIs are not affected — nginx and Node have opposite defaults

Verified rather than assumed:

```text
$ node -e "require('http').createServer(...).listen(4000)"
tcp   0   0   :::4000   :::*   LISTEN      ← the IPv6 wildcard
localhost → ok        [::1] → ok
```

Node's `listen(port)` with no host binds `::`, which on Linux accepts IPv4 as well (dual-stack). All three APIs use a bare numeric `server.httpPort` and `platform.listen()` with no host, so they already answer on both families.

nginx is the opposite: an explicit `listen 80;` is IPv4-only, and nothing upgrades it (see below). That asymmetry is the whole reason this defect exists only in the UIs — worth stating, because "add an IPv6 listener everywhere" would be wasted work on the APIs.

### This is not currently a production defect

The kubelet probes the pod IP, which is IPv4 on these clusters, so every probe passes and both apps serve normally. Two things are wrong anyway:

1. **The frontend spec's own verification commands cannot succeed.** `localhost` resolves to `::1` first:

   ```bash
   # specs/2026-08-06-iot-app-health-checks-frontend.md, Verification
   kubectl exec -n sandbox deploy/<qr-manager-ui> -- wget -qO- localhost/healthz
   ```

   It reads as "the health endpoint is broken" when the endpoint is fine — the worst kind of documentation bug in a health-check spec.

2. **Dual-stack would break the probes outright.** This is the real motivation, and the originating plan undersold it by leading with the doc commands. If a cluster gains IPv6, the kubelet probes the pod IP of that family. An IPv4-only listener would fail liveness, and kubelet would start killing healthy pods. Cheap insurance against a change nobody would connect to this.

---

## Why the base image's own IPv6 fixup does not help

`nginx:1.29-alpine` ships `/docker-entrypoint.d/10-listen-on-ipv6-by-default.sh`, and it is present in both images. **It runs and it succeeds** — this is the part the originating plan got wrong:

```text
10-listen-on-ipv6-by-default.sh: info: Getting the checksum of /etc/nginx/conf.d/default.conf
10-listen-on-ipv6-by-default.sh: info: Enabled listen on IPv6 in /etc/nginx/conf.d/default.conf
```

At step 10 `/etc/nginx/conf.d/default.conf` **does** exist — it is the base image's *stock* config, shipped in the layer. Its checksum therefore matches the packaged version, the guard passes, and the IPv6 listener is added.

Then at step 20, `20-envsubst-on-templates.sh` renders `/etc/nginx/templates/default.conf.template` **to that same path**, overwriting the patched file with our own config. The patch is discarded before nginx ever reads it.

So, correcting the two claims in the originating plan:

| Claim there | Reality |
| --- | --- |
| "the file does not exist yet at step 10" | It does — the stock `default.conf` from the base image |
| "the checksum bails because we ship our own config" | It does not — at step 10 the file is still stock, so the checksum matches |

Renumbering is still not a fix, but for a **third** reason neither claim captures: a copy of the script running *after* step 20 would see our rendered config, whose checksum no longer matches the packaged version, and would bail at that guard instead. Upstream's script cannot serve this case at any position.

The listener has to be declared explicitly in our own config.

---

## Risk: bind failure, measured rather than assumed

Adding `listen [::]:80;` to a container with no IPv6 makes nginx fail to bind and CrashLoop the pod, so this was tested rather than reasoned about:

```text
$ docker run --sysctl net.ipv6.conf.all.disable_ipv6=1 <image with listen [::]:80>
  → nginx starts normally
```

Disabling IPv6 by sysctl still leaves the `AF_INET6` socket family available, so the bind succeeds with no addresses bound. The genuine failure mode is narrower: a kernel built without `AF_INET6` at all, producing

```text
socket() [::]:80 failed (97: Address family not supported by protocol)
```

That is exactly what upstream's `/proc/net/if_inet6` guard exists for, and it is theoretical on these nodes — `if_inet6` is present in the running pods.

**Conclusion: hardcoding is acceptable.** Keep the pre-flight check in the steps anyway; it is one command, and it is the only thing between this change and a CrashLoop if cluster networking ever changes.

### Rejected: a conditional entrypoint hook

Mirroring upstream's runtime guard would mean a `25-listen-on-ipv6.sh` that injects a `listen` line into the correct `server` block of an already-rendered config — string surgery on generated output. That is markedly more fragile than the failure it avoids, and it would live in `nginx-runtime` where every future UI inherits the fragility. Rejected on the measurement above: the risk it guards does not apply here.

---

## The four `listen` lines also disagree today

```text
ui/homelab-dashboard-ui/nginx.conf.template:    listen 80;
ui/homelab-dashboard-ui/nginx.conf:             listen 80 default_server;
ui/qr-manager-ui/nginx.conf.template:           listen 80 default_server;
ui/qr-manager-ui/nginx.conf:                    listen 80 default_server;
```

Three agree by accident. Same class of drift as the `/healthz` block before it became a shared snippet — and unlike `/healthz`, this one **cannot** be solved by moving it into `nginx-runtime`, because `listen` is a `server`-block directive and the shared snippet is a `location`. The four files each own their own `server` block, so the best available fix is to make them identical and say why.

---

## Steps

### 1. The nginx configs

- [ ] In all four files, use exactly this pair, with the comment:

```nginx
    listen 80 default_server;
    # Explicit IPv6 listener. The base image's 10-listen-on-ipv6-by-default.sh
    # cannot do this for us: it patches the stock conf.d/default.conf at step 10,
    # and 20-envsubst-on-templates.sh then renders this template over the same
    # path, discarding the patch. `listen` is a server-block directive, so it
    # cannot live in the shared healthz.conf snippet either — keep these four
    # files identical by hand.
    listen [::]:80 default_server;
```

  - Files: `ui/qr-manager-ui/nginx.conf.template`, `ui/qr-manager-ui/nginx.conf`, `ui/homelab-dashboard-ui/nginx.conf.template`, `ui/homelab-dashboard-ui/nginx.conf`.
  - `homelab-dashboard-ui/nginx.conf.template` currently lacks `default_server`; adding it is the point of unifying, and is safe — one `server` block per file, so there is nothing to conflict with.
- [ ] Pre-flight, before trusting the change in-cluster:
      `kubectl exec -n sandbox <ui-pod> -- test -f /proc/net/if_inet6 && echo ipv6-ok`

### 2. Pin the property with a test

- [ ] Extend `packages/nginx-runtime/test/run.sh` with the case that would have caught this: after the container starts, fetch the probe path over **`localhost`**, `127.0.0.1` **and** `[::1]`, asserting all three return `ok`.

  This is a stricter assertion than the probe itself needs, which is the point — it pins the property the documentation claims. Note the scratch image in that suite builds its own `default.conf`; give it the same two `listen` lines so the test exercises the real shape.

### 3. Documentation

- [ ] `packages/nginx-runtime/README.md` — state that `healthz.conf` is a `location` and therefore cannot carry `listen` directives; the server block owns them, and both the IPv4 and IPv6 lines must be present in every consuming config. This is the detail that will otherwise be lost the first time a third UI copies the snippet and nothing else.
- [ ] `specs/2026-08-06-iot-app-health-checks-frontend.md`, Verification section — the `localhost/healthz` commands work as written once this lands. Add which address is being tested and why, because "localhost" and "the pod IP the kubelet probes" are not the same check, and only the latter is what keeps the pod alive.
- [ ] Same spec, rule F1 or the per-UI analysis — one line: the probe answers on the pod IP, and the container must also listen on IPv6 for anything in-container to reach it by name, or for a dual-stack cluster to probe it at all.

---

## Verification

- [ ] Local, per image: `curl` the probe over `127.0.0.1`, `localhost` and `[::1]` — all three `ok`.
- [ ] Local: `netstat -tln` inside the container shows **both** `0.0.0.0:80` and `:::80`.
- [ ] Local: nginx still starts under `docker run --sysctl net.ipv6.conf.all.disable_ipv6=1`.
- [ ] In-cluster after release, on the sandbox pod:
      `kubectl exec -n sandbox <pod> -- wget -qO- localhost/healthz` → `ok`. This is the command the frontend spec has been telling people to run; it should finally work.
- [ ] Probes unaffected: pod stays `READY 1/1` with `RESTARTS` unchanged. The probe never used `localhost`, so nothing here should move it — if restarts climb, the IPv6 bind is failing and the change should be reverted, not debugged in place.

---

## Homelab

**No change required.** Recorded explicitly because it is worth not re-deriving:

- Probe values use `httpGet` against the pod IP; the chart never names an address family.
- The only `localhost` checks in the homelab plans target `api-iot-qr-manager-api` — a Node server, which binds dual-stack — not the nginx UIs.

There *is* one unrelated homelab doc correction owed, from fix 1 of the superseded plan rather than from this work: the chart's generated validator initContainer carries a comment saying `runAsUser` is **REQUIRED** because "the validator images declare a non-numeric user". Once the numeric-UID images ship that is no longer true. The value stays right; the justification becomes "defensive default, since the image now declares uid 1000 itself".

---

## Release

- [ ] Changesets: patch for `qr-manager-ui` and `homelab-dashboard-ui`. No browser-visible behaviour changes, but both images change.
- [ ] `pnpm run verify`.
- [ ] Merge → the release workflow builds all four images from the same commit; the deploy action bumps `image.tag` in `homelab` per `deploy.json`, and the chart derives the validator tag from the app tag.
- [ ] **`homelab-dashboard-ui` has no sandbox**, so its bump rolls the live dashboard. With `maxUnavailable: 0` plus init validation the blast radius of a bad bind is a stuck ReplicaSet rather than a downed dashboard — but watch the first rollout rather than assuming, because a bind failure is exactly the fault that would surface here.

---

## Out of scope

- **PodSecurity `restricted`.** Both nginx images run their master as root and cannot satisfy it. Closing that means `nginxinc/nginx-unprivileged`, a port change from 80 to 8080, and matching `services.*.targetPort` in the homelab values — real work, its own plan. Note it would touch the same four `listen` lines, so whoever does it should land this first or fold it in.
- **Multi-arch images.** amd64-only, every node is amd64. Expected, not a defect.
