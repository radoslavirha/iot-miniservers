---
'@radoslavirha/otel': patch
---

Add a README, and write down the rule that this package takes no new dependencies.

`packages/otel` had no `README.md`, although its `package.json` `files` array already listed one
— so the file was expected to ship and simply did not exist. It now documents the public surface,
the config schema, and the constraint that was previously unwritten.

The constraint: **the dependency list is a budget, not a starting point.** Adding a runtime
dependency here needs a reason worth writing down. Using what is already declared carries no such
bar. Three things make this package different from its neighbours — it is preloaded ahead of
application code via `node --import`, so a dependency with an import-time side effect fails the
process before there is an app to report it; its wrappers sit in every app's hot path; and a fault
in it is self-concealing, because the traces, metrics and `trace_id`-bearing log lines you would
debug it with are exactly what stops arriving.

The escape hatch already existed and is now documented: `init` accepts `extraInstrumentations`, so
an app instruments its own libraries while the dependency stays in the app's `package.json` —
which is how `MongooseInstrumentation` is wired in `miot-bridge-api`. The same instinct explains
why the MQTT helpers take a plain string-map carrier rather than an MQTT.js message: it lets MQTT
tracing live here with no `mqtt` dependency.

`AGENTS.md` gains a short pointer in its instrumentation section so the rule is visible without
opening the package.
