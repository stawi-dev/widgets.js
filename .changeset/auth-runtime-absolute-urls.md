---
"@stawi/auth-runtime": minor
---

Add `responseType` to `fetch()`'s init (`"json" | "text" | "arraybuffer"`, default keeps the existing content-type sniffing) so callers can receive raw bytes such as Connect stream responses. Add `AuthConfig.allowedApiOrigins` (a list of bare origins, e.g. `https://api.stawi.org` — each entry is normalized via `new URL(entry).origin` and any entry that isn't a valid absolute URL throws `INVALID_CONFIG` at config-resolution time) and export `resolveApiUrl(cfg, path)` from `shared/config.js` so `fetch()` can target an absolute URL on a second API host — allowed when its origin equals `apiBaseUrl`'s origin or matches one of `allowedApiOrigins`, otherwise rejected with `INVALID_CONFIG`. Enables the upcoming `@stawi/identity` widget to call `https://api.stawi.org/identity` through the same runtime a host page uses for its own API.
