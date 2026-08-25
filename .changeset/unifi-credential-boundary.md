---
'homelab-dashboard-ui': minor
---

Move the UniFi API key out of the browser.

`config.json` no longer carries `unifi.host` or `unifi.apiKey`; nginx attaches the credential to the
proxied request with `proxy_set_header X-Api-Key`, reading `UNIFI_HOST` and `SECRET_UNIFI_API_KEY` from
the environment. A new `10-require-unifi-env.sh` entrypoint guard fails the container fast if either is
empty, replacing the coverage the validating initContainer loses.

The runtime config contract changes, so this is a minor rather than a patch. The image itself stays
compatible in both directions — Zod strips unknown keys, so it runs against a config.json that still
carries the old `unifi.host` / `unifi.apiKey` as happily as one without them.
