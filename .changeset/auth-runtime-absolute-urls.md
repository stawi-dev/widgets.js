---
"@stawi/auth-runtime": minor
---

Add `responseType` to `fetch()`'s init (`"json" | "text" | "arraybuffer"`, default keeps the existing content-type sniffing) so callers can receive raw bytes such as Connect stream responses. Add `AuthConfig.allowedApiOrigins` and export `resolveApiUrl(cfg, path)` from `shared/config.js` so `fetch()` can target an absolute URL on a second API host — allowed when its origin equals `apiBaseUrl`'s origin or is listed in `allowedApiOrigins`, otherwise rejected with `INVALID_CONFIG`. Enables the upcoming `@stawi/identity` widget to call `https://api.stawi.org/identity` through the same runtime a host page uses for its own API.
