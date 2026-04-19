---
"@stawi/auth-runtime": major
---

v1 rewrite. Web Worker token isolation, adaptive DPoP, non-extractable CryptoKeys for signing and AES-GCM refresh-token encryption at rest, refresh-token rotation with reuse-detection wipe, `navigator.locks` + `BroadcastChannel` multi-tab coordination, proactive FedCM probe on idle, gesture-preserving OAuth popup, per-phase timeouts, namespaced storage.

Breaking: `getAuthRuntime` singleton, `getAccessToken`, and `ApiClient` removed. Migrate to `createAuthRuntime(config)` and `runtime.fetch(path, init)` / `runtime.upload(path, file)`.
