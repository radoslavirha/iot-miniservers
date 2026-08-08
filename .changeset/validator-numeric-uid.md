---
"qr-manager-ui": patch
"homelab-dashboard-ui": patch
---

Declare a numeric UID in the config-validator images.

The validator stages used `USER node`. Kubernetes verifies `runAsNonRoot: true`
against the image's configured user and cannot map a username to a UID — that
mapping lives in the image's `/etc/passwd`, which the kubelet does not read — so
it fails closed:

```text
CreateContainerConfigError: container has runAsNonRoot and image has
non-numeric user (node), cannot verify user is non-root
```

This blocked the first `validate: true` sync on both sandbox clusters. `USER 1000`
is the same user (`node` in `node:*-alpine`), stated in the form Kubernetes can
verify, so the image satisfies `runAsNonRoot` without the chart having to supply
`runAsUser`.

No behaviour change outside Kubernetes: the validator still runs as uid 1000 and
still works under a read-only root filesystem.
