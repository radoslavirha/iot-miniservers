---
"@radoslavirha/resilience": minor
"@radoslavirha/tsed-resilience": minor
"@radoslavirha/http-provider": minor
"qr-manager-api": patch
---

Add transport-agnostic resilience (timeout, retry, circuit breaker) with AbortSignal support.

- `@radoslavirha/resilience`: cockatiel-backed `createResiliencePolicy` /
  `ResiliencePolicyFactory` wrapping any `(signal) => Promise<T>`, plus `combineSignals` and
  re-exported error guards.
- `@radoslavirha/tsed-resilience`: request-scoped `RequestCancellation` providing an
  `AbortSignal` tied to the HTTP request lifecycle.
- `@radoslavirha/http-provider`: replaces `axios-retry` with the resilience policy (retry +
  circuit breaker + timeout) via a new optional `resilience` config; the existing `retry`
  config surface is preserved and now feeds cockatiel.
- `qr-manager-api`: PoC wiring the redirect path (`RedirectController` → `QrCodeService` →
  `QrCodeMongoRepository.findBySlug`) through a resilience policy + `maxTimeMS` and the
  request-lifecycle signal.
