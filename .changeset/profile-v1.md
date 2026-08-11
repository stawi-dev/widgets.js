---
"@stawi/profile": major
"@stawi/auth-runtime": patch
---

v1 release. Hardened token handling (Worker + non-extractable keys + adaptive DPoP + rotation/reuse detection), configurable theming (design tokens + raw CSS escape hatch), inlined font subsets, opt-in Gravatar, full a11y (focus trap, aria-modal, axe in CI), i18n (en/fr/sw/ar + RTL), observability hooks, idempotency keys, per-instance runtime lifecycle, unified verification UX, sanitized picture URLs, validated adminPanelUrl, multipart avatar upload with magic-byte + dimension checks.

Breaking changes from 0.x:

- `ApiClient` removed from auth-runtime; use `runtime.fetch` / `runtime.upload`.
- `getAuthRuntime` singleton removed; use `createAuthRuntime`.
- `data-theme` now affects styling; defaults to `"auto"`.
- Gravatar is opt-in via `gravatar: true`.
- Google Fonts now opt-in via `externalFonts: true`; default is inlined subsets.
- Default scopes include `offline_access` (required for rotating refresh tokens).
