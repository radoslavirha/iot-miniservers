---
"miot-bridge-api": patch
"interactive-map-feeder-api": patch
---

Log the `AUTH_CONFIG` boot summary (trusted issuers, audiences, no secrets) on startup, matching `qr-manager-api`. Previously these two apps enforced auth but gave no boot-time signal of what they'd accept.
