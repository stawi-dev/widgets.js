# `@stawi/profile` widget fixes — design

Status: draft
Date: 2026-04-19
Applies to: `packages/profile` (v0.2.0 → v1.0.0)
Companion specs:
- `2026-04-19-auth-protocol-design.md` (protocol)
- `2026-04-19-auth-runtime-browser-design.md` (runtime)

## 1. Scope

All audit findings not covered by the auth-runtime redesign: theming, avatar upload, popup gesture, singleton removal, logout, CSP, i18n, a11y, observability, and scalability.

## 2. Public API changes

### 2.1 `ProfileWidgetProps`

New fields (all optional, defaults chosen to be safe):

| Field | Type | Default | Purpose |
|---|---|---|---|
| `locale` | `string` | `"en"` | BCP-47; widget resolves to `locale → locale.split("-")[0] → "en"`. |
| `gravatar` | `boolean` | `false` | Opt-in Gravatar fallback. |
| `externalFonts` | `boolean` | `false` | Opt-in Google Fonts. Default ships inlined woff2 subsets. |
| `maxAvatarBytes` | `number` | `2 * 1024 * 1024` | Client-side upload cap. |
| `onAuthStateChange` | `(state: AuthState) => void` | — | RUM hook. |
| `onError` | `(err: WidgetError) => void` | — | RUM hook. |
| `onSecurityEvent` | `(event: SecurityEvent) => void` | — | For alerting on reuse-detection etc. |
| `onMetric` | `(name, durationMs, tags) => void` | — | Timing hook. |
| `logger` | `(level, msg, meta) => void` | — | Dev logging. |
| `timeouts` | `{ discovery?, token?, api?, upload? }` | see protocol spec | Per-phase timeout overrides. |

Existing fields unchanged. v0.2.0 callers keep working.

### 2.2 `MountHandle`

```ts
interface MountHandle {
  unmount: () => void;
  getAuthState: () => AuthState;
  prefetchDiscovery: () => Promise<void>;
  readonly version: string;
}
```

### 2.3 `adminPanelUrl` validation

On `mount`, parse via `new URL(adminPanelUrl)`. Require `protocol === "http:" || "https:"`. Throw `WidgetError({code:"INVALID_CONFIG"})` otherwise. Bootstrap path (from `data-*`) converts throw to `console.error` + no-op mount.

## 3. Shared pieces between `@stawi/auth-runtime` and `@stawi/profile`

### 3.1 Error taxonomy

Types exported from `@stawi/auth-runtime/shared/types`:

```ts
type WidgetErrorCode =
  | "INVALID_CONFIG"
  | "DISCOVERY_FAILED" | "NETWORK_TIMEOUT" | "NETWORK_ERROR" | "OFFLINE"
  | "OAUTH_POPUP_BLOCKED" | "OAUTH_POPUP_CLOSED" | "OAUTH_POPUP_TIMEOUT"
  | "OAUTH_STATE_MISMATCH" | "OAUTH_FAILED"
  | "FEDCM_ISS_MISMATCH" | "FEDCM_DISMISSED"
  | "TOKEN_EXCHANGE_FAILED" | "TOKEN_REFRESH_FAILED" | "TOKEN_EXPIRED"
  | "DPOP_NONCE_REQUIRED" | "DPOP_INVALID_PROOF"
  | "STORAGE_CORRUPTION" | "STORAGE_QUOTA_EXCEEDED" | "CRYPTO_UNSUPPORTED" | "WORKER_UNAVAILABLE"
  | "LOGGED_OUT_ELSEWHERE" | "SECURITY_WIPE"
  | "API_UNAUTHORIZED" | "API_FORBIDDEN" | "API_NOT_FOUND" | "API_VALIDATION" | "API_SERVER_ERROR"
  | "AVATAR_TOO_LARGE" | "AVATAR_TYPE_UNSUPPORTED" | "AVATAR_DIMENSIONS_EXCEEDED";

interface WidgetError {
  code: WidgetErrorCode;
  message: string;
  userMessage?: string;        // localized, end-user-facing; filled by widget's i18n layer
  traceId?: string;            // X-Trace-Id passthrough
  retryable: boolean;
}
```

### 3.2 State enum

```ts
type AuthState = "initializing" | "authenticated" | "unauthenticated" | "refreshing" | "error";
```

## 4. Widget-level fixes

### 4.1 Runtime singleton removed

`ProfileWidgetRoot` uses a `useRef` + `useMemo` keyed by `{clientId, idpBaseUrl, installationId}`. `createAuthRuntime` is called once per instance; `runtime.destroy()` runs in the `useEffect` cleanup. `mount().unmount()` destroys the runtime and its Worker.

### 4.2 Theme

`widgetStyles` adds:

```css
:host {
  color-scheme: dark light;
  /* dark vars (current) */
}
:host([data-theme="light"]) {
  --aiw-bg: #fafaf9;
  --aiw-surface: #ffffff;
  --aiw-text: #2a2a2a;
  --aiw-text-secondary: #6b6b6b;
  --aiw-border: #e5e5e2;
  --aiw-muted: rgba(0,0,0,0.05);
  --aiw-muted-strong: rgba(0,0,0,0.09);
  --aiw-shadow: 0 8px 24px rgba(0,0,0,0.08), 0 2px 6px rgba(0,0,0,0.05);
}
@media (prefers-color-scheme: light) {
  :host([data-theme="auto"]) { /* same light vars */ }
}
```

`index.tsx` always sets `data-theme` (`auto` default). WCAG AA contrast validated in both themes.

### 4.3 Fonts

Build step adds a `scripts/subset-fonts.ts` that uses `fonttools` (py subprocess) OR `subset-font` (pure JS) at build-time only to produce Latin + Latin-Ext woff2 subsets of Poppins (500/600/700) and Lora (400/500). Each subset is base64-embedded into `widgetStyles` as `src: url(data:font/woff2;base64,...) format('woff2')`. Total additional bundle size budget: 80 KB gzipped.

`externalFonts: true` re-enables the `<link>` injection as before.

### 4.4 Gravatar

Off by default. When `gravatar: true`:
- `use-gravatar.ts` runs only after profile load
- Only for an email where `verified === true`
- Email always lowercased + trimmed before SHA-256
- A new `onExternalResourceRequest("gravatar", url)` hook lets embedders block at runtime (returns `false` to skip)

### 4.5 Avatar upload

```ts
// components/AvatarEditor.tsx
const handleChange = async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  try {
    await validateAvatar(file, { maxBytes: maxAvatarBytes });
    await uploadAvatar(file);
  } catch (err) {
    onError?.(err);
  } finally {
    e.target.value = "";
  }
};
```

`validateAvatar` (new util):
1. `file.size <= maxBytes` else `AVATAR_TOO_LARGE`.
2. Read first 16 bytes; magic-byte check vs allowed signatures (PNG `89 50 4E 47`, JPEG `FF D8 FF`, WebP `RIFF…WEBP`, GIF `47 49 46 38`). Else `AVATAR_TYPE_UNSUPPORTED`.
3. Probe via `createImageBitmap(file)`; assert `width <= 4096 && height <= 4096`. Else `AVATAR_DIMENSIONS_EXCEEDED`.

`uploadAvatar`:
- Uses `runtime.upload("/profile.v1.ProfileService/UpdateAvatar", file)`.
- Backend contract change required: separate RPC that accepts multipart. Spec notes this as a **backend dependency**; widget is ready as soon as the RPC exists.
- Interim fallback (if backend not ready): if `upload` returns 404/405, fall back to base64+JSON path with hard 1 MB cap (already validated). Emit `onError({code:"API_NOT_FOUND", retryable:false})` with a clear "upgrade backend" message in dev.

### 4.6 Picture URL sanitization

`profile-mapper.ts` runs `sanitizePictureUrl(raw)`:
- Accept `https://` URLs only.
- Accept `data:image/(png|jpeg|webp|gif);base64,…` with length cap (512 KB base64 ≈ 384 KB decoded).
- Else return `undefined` (falls back to Gravatar-if-enabled or initials).

### 4.7 Error handling & user feedback

- `ErrorBoundary` gains a `Try again` button that resets to `{error: null}` and re-renders.
- Every `catch` in the profile context that currently calls `console.error` instead dispatches to reducer `{type: "ERROR", error}` AND calls `onError?.(err)`. Local UI surfaces a dismissible inline `aria-live="polite"` error region.
- Mutations that fail do not leave local state mutated (already true except for avatar data-URI path — fixed by switching to `upload`).

### 4.8 Contact verification — unified UX

- Single source of truth: `pendingVerification` state in `ProfileContext`.
- `VerifyDialog` renders the modal when `pendingVerification` is set.
- Inline "Verify" button in `ContactMethodItem` sets `pendingVerification` (rather than rendering its own inline form).
- Dismissing the dialog does NOT clear `pendingVerification` — it minimizes into a persistent banner `"Verify <value>"` shown at the bottom of the popover, with an "Enter code" button that reopens the dialog.
- `removeContact` clears `pendingVerification` if its `contactId` matches the removed contact.
- `addContact` calls server, optimistically updates UI on success with the authoritative contact list from the server response; on failure shows inline error and leaves state unchanged.

### 4.9 A11y

- `VerifyDialog`: `role="dialog"`, `aria-modal="true"`, focus trap via a small `useFocusTrap` hook (tab + shift-tab boundaries). Focus returns to the trigger on close.
- `ProfilePopover`: focus returns to the trigger button when closed via Escape or outside click.
- Inline error banner: `role="status"`, `aria-live="polite"`.
- Minimum contrast 4.5:1 in both themes (tested via axe-core in CI).
- RTL: for `locale` starting with `ar` / `he` / `fa`, set `dir="rtl"` on host; stylesheet uses logical properties (`margin-inline-start` etc.) for anything asymmetric.

### 4.10 i18n

- New `packages/profile/src/i18n/` directory with `en.json`, `fr.json`, `sw.json`, `ar.json`.
- `useTranslations()` hook resolves per current locale with English fallback.
- All UI strings replaced by `t("key")` calls. Key examples: `auth.login`, `auth.signingOut`, `contacts.title`, `verify.title`, `verify.placeholder`, `errors.network`.
- Add-locale cost is one JSON file; build step inlines only the active locale into the IIFE bundle based on a loader-side flag (`<script data-locale="fr">`).

### 4.11 Bootstrap / autoMount

- If `document.currentScript` is null (dynamic injection) log a single `console.warn` with the remediation: "call StawiProfile.mount({...}) directly".
- `data-admin-panel-url` and `data-api-base-url` validated via `new URL()`; invalid → `console.error` and continue mount with that field absent.
- `data-locale` attribute supported.

### 4.12 Observability hooks

Forward every lifecycle event:
- `onAuthStateChange(state)` — from runtime
- `onError(err)` — from runtime + widget operations
- `onSecurityEvent(event)` — from runtime
- `onMetric(name, durationMs, tags)` — from runtime + widget timings (first-render, popover-open, avatar-upload)

Default no-op. Dev-mode `logger` logs to `console.debug`.

### 4.13 Preload

`mount()` calls `runtime.prefetchDiscovery()` inside `requestIdleCallback` so the first sign-in click has a warm discovery cache.

### 4.14 CSP / SRI

Documented in README `Embedding` section. Required CSP:

```
script-src 'self' https://cdn.stawi.org 'strict-dynamic' <nonce>;
worker-src 'self' blob:;
connect-src https://oauth2.stawi.org https://api.stawi.org;
img-src https: data:;
style-src 'unsafe-inline';   /* Shadow DOM inline styles */
font-src data:;              /* inlined woff2 */
frame-ancestors 'self';
```

SRI: published IIFE is fingerprinted; README embeds example `<script integrity="sha384-…" crossorigin="anonymous" src="https://cdn.stawi.org/profile@1.0.0/profile.iife.js">`.

### 4.15 Unmount / cleanup

`MountHandle.unmount`:
1. `root.unmount()` (React)
2. `runtime.destroy()` → terminates Worker, closes BroadcastChannel, clears timers
3. Removes host element from DOM
4. Removes any document-level listeners the widget registered

Idempotent. Safe to call twice.

## 5. Non-token failure modes (widget)

| Scenario | Handling |
|---|---|
| Profile fetch fails | State `error: t("errors.loadProfile")`; "Retry" button in `ProfileCard` triggers refetch. |
| Avatar upload exceeds size | Inline error with `userMessage` localized; input resets. |
| Contact add returns validation error from server | Inline error under the add-contact input; input retained for edit. |
| Verification code wrong | Inline error on the dialog; input cleared and refocused; attempts counter shown when backend includes `check_attempts`. |
| Language/country change fails | Revert the select to previous value; `onError` fired. |
| Popover closed during in-flight mutation | Mutation completes; state updated in context; no UI flash since popover re-renders with the new state when reopened. |
| Widget unmounted during in-flight mutation | AbortController cancels the fetch in the Worker; runtime emits `NETWORK_ERROR` (caught silently post-unmount). |

## 6. Scalability & performance

- **Bundle size target**: ≤ 70 KB gzipped for profile IIFE (excluding inlined fonts); ≤ 150 KB with fonts.
- **First meaningful paint**: popover-ready within 100 ms after mount on a warm cache.
- **Cold-start sign-in**: ≤ 500 ms before popup opens (discovery prefetched on idle).
- **Memory**: Worker + UI ≤ 5 MB steady state.
- **No polling in steady state**: popup polling is fallback only; primary path is postMessage.
- **Re-renders**: reducer-based context; every callback memoized; stable identity across renders validated via React Profiler snapshot.

## 7. Test plan

Unit:
- `sanitizePictureUrl`
- `validateAvatar`
- Theme switching
- i18n resolution fallback chain
- `profileReducer`

Component (React Testing Library + jsdom):
- `ProfileWidgetRoot` — all auth states
- `VerifyDialog` — focus trap, backdrop, keyboard
- `ContactMethods` — add / remove / unified verify
- `AvatarEditor` — magic-byte rejection, size rejection, dimensions rejection
- `ErrorBoundary` — reset

Integration (jsdom + `msw` + mock Worker):
- Script-tag autoMount with `data-*` attrs
- Full add-contact-then-verify flow through the Worker
- Logout propagation across two runtimes on same page (BroadcastChannel)

A11y (axe-core in CI):
- Popover open/closed, both themes
- Dialog open
- RTL snapshot

Visual regression:
- Storybook-based snapshots in dark, light, auto (dark host), auto (light host), RTL.

## 8. Release

Single PR bumps both packages to `1.0.0`. Changeset entries explain breaking changes (singleton, getAccessToken). Migration guide in `CHANGELOG.md`:

- Replace `runtime.getAccessToken()` + your own `fetch` with `runtime.fetch(path, init)`.
- If you instantiated via `getAuthRuntime(config)` somewhere other than the widget, use `createAuthRuntime(config)` and dispose with `runtime.destroy()`.
