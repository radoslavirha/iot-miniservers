# homelab-dashboard-ui — hostname assumptions after the `.home` retirement

**Status:** partially done, not urgent. The three code bugs below are fixed on
`feat/dashboard-hostname-refactor` (2026-09-09) — see "Follow-up" at the bottom for what's left.
**Trigger:** the `homelab` repo retired `.home` on 2026-09-03. Every service now answers on
`<svc>.<cluster>.homelab.irha.cz`, with `qr.irha.cz` and `grafana.irha.cz` at the apex. The old
names are NXDOMAIN — deleted from UniFi, not merely unrouted.
**Scope:** `ui/homelab-dashboard-ui`. No cluster work; the GitOps side is already done.

## What already happened

The deployed config was migrated in `homelab` and is live:

```json
"serverPattern": "^server(\\d+)\\.homelab\\.irha\\.cz$",
"scheme": "https",
"exclude": [ "dashboard.server3.homelab.irha.cz", "qr.irha.cz", "api.server1.homelab.irha.cz", … ]
```

Three `DNSEndpoint` CRs publish the cluster anchors `server{1,2,3}.homelab.irha.cz` →
`192.168.1.{200,201,202}`, which is what `serverPattern` matches. The dashboard renders correctly
against them.

## What is still wrong in the code

Both in `src/lib/parseDns.ts`:

1. **`DEFAULT_SERVER_PATTERN = /^server(\d+)\.home$/i`** (line 4). Only reached when `config.json`
   omits `serverPattern` — the deployment always sets it, so this is dormant. It is still a
   default that can no longer match anything real, and it is the value a new deployment would
   silently inherit.
2. **`hostToServer.set(\`server${idx}.home\`, idx)`** (line 39). Builds the CNAME lookup key by
   appending a hardcoded suffix instead of deriving it from the anchor record that just matched.
   Dormant only because every current record is an `A` record; the moment a `CNAME` appears it
   silently fails to group.
3. **`hostname.replace(/\.home$/, '')`** (line 101, `fallbackBySubnet`). Cosmetic label
   stripping in the no-anchors fallback path; produces `grafana.irha.cz` instead of `grafana`.

The shape of the bug is the same in all three: a suffix that used to be a constant is now a
deployment detail, and the code still treats it as a constant.

## Direction, not a prescription

The anchor record is already matched by `serverPattern` and its full hostname is in hand at that
point — everything downstream should derive from it rather than re-deriving a suffix. That
removes all three hardcodes without adding config.

**Worth considering while in here:** `parseDnsRecords` currently does anchor detection, IP
bucketing, exclusion, path resolution and URL construction in one pass over two loops. The
hostname coupling above is a symptom of that. A refactor that separates "find clusters" from
"assign services" would make the suffix question disappear rather than be answered three times.
The existing `parseDns.spec.ts` is the safety net; extend it with a CNAME case, which is
currently untested and is exactly where bug 2 hides.

## Constraint

`serverPattern`'s **capture group 1 must stay the numeric cluster index** — it drives the label
and the accent colour. Any refactor keeps that contract.

## Verifying

`config.json` is served to the browser, so the live values can be read without cluster access:

```bash
curl -s https://dashboard.server3.homelab.irha.cz/config.json
# and the record set the dashboard actually groups, through its own nginx proxy:
curl -s https://dashboard.server3.homelab.irha.cz/proxy/network/v2/api/site/default/static-dns
```

Both answer on the LAN only.

## Follow-up (2026-09-09)

Done on `feat/dashboard-hostname-refactor`:

- `parseDns.ts` split into `findAnchors` + `assignServices`; all three hardcodes above are gone.
  CNAME grouping now keys off the anchor's own matched hostname instead of a reconstructed
  suffix, and the match is case-insensitive.
- `AppConfig.serverPattern` dropped its Zod default entirely rather than just updating the
  string — a missing `serverPattern` now fails config validation instead of silently reusing a
  pattern that can't match anything real. This was judged the more future-proof fix than
  swapping one hardcoded domain default for another.
- Full test suite (30 tests), typecheck and lint all green.

Not done yet — separate follow-up, low urgency since nothing in production depends on it:

- `public/config.json`, `public/config.example.json` and the README's `serverPattern` doc row
  still show the retired `^server(\d+)\.home$` example. Cosmetic only; not read by any test or
  the live deployment.
- This spec has not been moved to `docs/superpowers/specs/archive/` yet.

