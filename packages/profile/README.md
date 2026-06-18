# @stawi/profile

An embeddable profile widget for Antinvestor identity, with Shadow-DOM isolation, design-token theming, a Web-Worker-backed auth runtime, and strict CSP support.

- Worker-isolated OAuth/OIDC tokens (non-extractable `CryptoKey`s; refresh tokens encrypted with AES-GCM).
- Adaptive DPoP (auto-detected per authorization server).
- Refresh-token rotation with reuse-detection wipe.
- Multi-tab coordination via `navigator.locks` + `BroadcastChannel`.
- Design-token theming + raw-CSS escape hatch.
- i18n (en / fr / sw / ar) with automatic RTL.
- Inlined font subsets by default (no Google Fonts dependency).

---

## Install

Via npm (ESM/CJS, bundled by your app):

```bash
pnpm add @stawi/profile react react-dom
# or: npm i @stawi/profile react react-dom
```

Via `<script>` tag (self-contained IIFE, auto-mounts):

```html
<script
  src="https://cdn.stawi.org/profile@1.0.0/profile.iife.js"
  integrity="sha384-REPLACE_WITH_PUBLISHED_HASH"
  crossorigin="anonymous"
  data-installation-id="inst_your_installation_id"
  defer
></script>
```

React is a **peer dependency**. The widget supports React 18 and 19.

---

## Quick start

### Programmatic

```ts
import { mount } from "@stawi/profile";

const handle = mount({
  installationId: "inst_your_installation_id",
  theme: "auto",
  locale: "en",
  onAuthStateChange: (state) => console.log("auth:", state),
});

// later…
handle.unmount();
```

### Auto-mount via script tag

Drop the IIFE bundle in with `data-*` attributes — no bundler required:

```html
<script
  src="https://cdn.stawi.org/profile@1.0.0/profile.iife.js"
  integrity="sha384-REPLACE_WITH_PUBLISHED_HASH"
  crossorigin="anonymous"
  data-installation-id="inst_your_installation_id"
  data-theme="auto"
  data-locale="en"
  data-admin-panel-url="https://admin.example.com"
  data-tokens='{"colorPrimary":"#d97757"}'
  defer
></script>
```

Supported `data-*` attributes:

| Attribute                  | Maps to             | Notes                                                      |
| -------------------------- | ------------------- | ---------------------------------------------------------- |
| `data-installation-id`     | `installationId`    | **Required.**                                              |
| `data-client-id`           | `clientId`          | Defaults to `installationId`.                              |
| `data-idp-base-url`        | `idpBaseUrl`        | IDP/OIDC base URL.                                         |
| `data-api-base-url`        | `apiBaseUrl`        | API base URL for profile endpoints.                        |
| `data-logout-redirect-uri` | `logoutRedirectUri` | Registered URL to return to after full IdP logout.         |
| `data-theme`               | `theme`             | `"light"`, `"dark"`, or `"auto"`. Default `"auto"`.        |
| `data-admin-panel-url`     | `adminPanelUrl`     | Must be `http(s)`; otherwise ignored with a console error. |
| `data-locale`              | `locale`            | BCP-47; e.g. `"en"`, `"fr"`, `"sw"`, `"ar"`.               |
| `data-external-fonts`      | `externalFonts`     | Presence or `"true"`/`"1"` → load Google Fonts.            |
| `data-gravatar`            | `gravatar`          | Presence or `"true"`/`"1"` → opt in to Gravatar.           |
| `data-tokens`              | `tokens`            | JSON string of `ProfileWidgetThemedTokens`.                |

---

## Props

`ProfileWidgetProps` (plus `target?: HTMLElement` for `mount()`):

| Prop                | Type                                                                      | Default           | Description                                                                  |
| ------------------- | ------------------------------------------------------------------------- | ----------------- | ---------------------------------------------------------------------------- |
| `installationId`    | `string`                                                                  | — **required**    | Stawi installation ID.                                                       |
| `clientId`          | `string`                                                                  | `installationId`  | OAuth client ID.                                                             |
| `idpBaseUrl`        | `string`                                                                  | runtime default   | IDP base URL (used for OIDC discovery).                                      |
| `apiBaseUrl`        | `string`                                                                  | runtime default   | API base URL for profile endpoints.                                          |
| `logoutRedirectUri` | `string`                                                                  | current page      | Registered URL to return to after full OIDC logout.                          |
| `theme`             | `"light" \| "dark" \| "auto"`                                             | `"auto"`          | Applies a preset color palette; `"auto"` follows `prefers-color-scheme`.     |
| `adminPanelUrl`     | `string`                                                                  | —                 | Validated against `http(s)`; shown as an admin link in the popover.          |
| `onLogout`          | `() => void`                                                              | —                 | Invoked after a successful logout.                                           |
| `tokens`            | `ProfileWidgetThemedTokens`                                               | —                 | Design-token overrides; supports optional `dark` / `light` branches.         |
| `css`               | `string`                                                                  | —                 | Raw CSS appended after tokens — ultimate escape hatch.                       |
| `externalFonts`     | `boolean`                                                                 | `false`           | `true` to load Poppins/Lora from Google Fonts; default uses inlined subsets. |
| `maxAvatarBytes`    | `number`                                                                  | `2 * 1024 * 1024` | Max avatar byte size accepted for upload. Default 2 MiB.                     |
| `locale`            | `string`                                                                  | `"en"`            | BCP-47 locale; falls back to base language then English.                     |
| `gravatar`          | `boolean`                                                                 | `false`           | Opt-in Gravatar fallback for avatars.                                        |
| `onError`           | `(err: unknown) => void`                                                  | —                 | Recoverable/UI error hook.                                                   |
| `onAuthStateChange` | `(s: AuthState) => void`                                                  | —                 | Auth state transitions.                                                      |
| `onSecurityEvent`   | `(e: SecurityEvent) => void`                                              | —                 | Security-relevant events (see Observability).                                |
| `onMetric`          | `(name: string, durationMs: number, tags: Record<string,string>) => void` | —                 | Timing / counter hook for OTel-style pipelines.                              |

---

## Theming

### Presets

Four presets are exported as plain `ProfileWidgetTokens` objects you can spread / merge / override:

```ts
import {
  mount,
  claudeDark,
  claudeLight,
  neutralLight,
  highContrast,
} from "@stawi/profile";

mount({
  installationId: "inst_…",
  theme: "light",
  tokens: {
    ...claudeLight,
    colorPrimary: "#4f46e5", // override a single token
  },
});
```

### Design tokens (`ProfileWidgetTokens`)

Every token is a CSS value applied inside the widget's Shadow DOM — they do not leak to the host page.

```ts
import type { ProfileWidgetThemedTokens } from "@stawi/profile";

const tokens: ProfileWidgetThemedTokens = {
  // common tokens
  colorSurface: "#ffffff",
  colorText: "#111111",
  colorPrimary: "#2563eb",
  radius: "12px",
  fontBody: "Inter, system-ui, sans-serif",

  // per-scheme overrides (applied when host matches)
  dark: {
    colorBg: "#0b0b0c",
    colorSurface: "#141416",
    colorText: "#f5f5f5",
  },
  light: {
    colorBg: "#ffffff",
    colorSurface: "#f7f7f7",
  },
};
```

Supported keys: `colorBg`, `colorSurface`, `colorText`, `colorTextSecondary`, `colorBorder`, `colorPrimary`, `colorPrimaryHover`, `colorDanger`, `colorDangerHover`, `colorMuted`, `colorMutedStrong`, `colorFocusRing`, `fontHeading`, `fontBody`, `fontSizeBase`, `fontWeightHeading`, `fontWeightBody`, `radius`, `radiusSm`, `popoverWidth`, `popoverOffset`, `shadow`, `zIndexPopover`, `zIndexDialog`, `triggerSize`, `avatarLargeSize`.

### Raw CSS escape hatch

For anything tokens don't cover, pass a `css` string — it's appended after the token layer, inside the Shadow DOM:

```ts
mount({
  installationId: "inst_…",
  css: `
    .profile-trigger { box-shadow: 0 0 0 2px #000 inset; }
    .profile-popover a { text-decoration: underline; }
  `,
});
```

---

## i18n

Pass a BCP-47 locale via `locale` (prop) or `data-locale` (script tag). Supported out-of-the-box: `en`, `fr`, `sw`, `ar`. Unknown locales fall back to the base language (e.g. `fr-CA` → `fr`) and finally to English.

Right-to-left locales (`ar`, `he`, `fa`, `ur`) automatically set `dir="rtl"` on the widget host.

```ts
mount({ installationId: "inst_…", locale: "ar" }); // RTL auto-enabled
```

---

## Avatars

- Max size: `maxAvatarBytes` bytes (default **2 MiB**).
- Supported types: PNG, JPEG, GIF, WebP. The widget checks magic bytes, not just MIME.
- Max dimension: 4096 × 4096 px (checked via `createImageBitmap`).
- Uploaded via multipart to `POST /profile.v1.ProfileService/UpdateAvatar/{profileId}` on your `apiBaseUrl`. The server response must include `data.properties.au_avater_uri` with the canonical URL.
- URLs are sanitized on render — only `https:`, `data:image/*`, and `blob:` are allowed.

Gravatar is **opt-in** (`gravatar: true`). When enabled, the widget falls back to Gravatar if the user has no picture URL.

---

## Security posture

**Worker isolation.** All OAuth/OIDC state — access tokens, refresh tokens, DPoP signing keys — lives inside a dedicated Web Worker. The main thread never sees the tokens; it only gets opaque request handles and a narrow `runtime.fetch` / `runtime.upload` surface.

**Non-extractable keys.** DPoP signing keys and the AES-GCM key used to encrypt refresh tokens at rest are generated with `extractable: false`. Even inside the Worker they cannot be serialized to JavaScript; the browser enforces this at the WebCrypto boundary.

**Adaptive DPoP.** The runtime probes the authorization server's OIDC metadata and enables DPoP automatically when the server advertises it. When DPoP is active, every token request and resource fetch is signed with a per-key nonce; when it isn't, the widget falls back to bearer tokens without a round-trip.

**Rotation + reuse-detection.** Refresh tokens rotate on every refresh. If the server ever signals a reuse (HTTP 400 `invalid_grant` against a rotated token), the runtime wipes all local state, broadcasts `logged_out_elsewhere` to sibling tabs, and transitions to `unauthenticated`. Embedders receive a `refresh_reuse_detected` `SecurityEvent` so they can surface forced re-login UI.

---

## Deploying the IdP for FedCM

The widget prefers FedCM (`navigator.credentials.get({ identity })`) over a full OAuth popup whenever the browser and your authorization server both support it. For that to work, your IdP must publish a FedCM configuration document at `/.well-known/web-identity` and implement the four endpoints it points at (`accounts_endpoint`, `client_metadata_endpoint`, `id_assertion_endpoint`, `disconnect_endpoint`). Your OIDC discovery document at `/.well-known/openid-configuration` must additionally advertise the `urn:ietf:params:oauth:grant-type:token-exchange` grant type so the widget can convert the FedCM-issued ID token into OAuth access + refresh tokens.

Four items are load-bearing and easy to miss: (1) the `login_url` field in the FedCM config — the widget opens this in a popup when the browser reports no IdP session, and expects the page to `postMessage({ type: "stawi-login-complete" })` to `window.opener` and then close itself; (2) the `Set-Login: logged-in` / `Set-Login: logged-out` response header (or `navigator.login.setStatus` from an IdP-origin frontend) — Chrome will not even call `accounts_endpoint` unless login status is `logged-in`; (3) the ID token's `nonce` claim on the `id_assertion_endpoint` response — the widget generates a per-attempt 128-bit nonce and verifies the echoed value before exchanging the token; (4) refresh-token rotation with reuse detection — the widget treats `invalid_grant` on a rotated token as a breach signal and wipes all local state.

For the complete operator guide — endpoint contracts, ID-token claim requirements, DPoP semantics, CORS rules, logout flow, and worked Hydra / Keycloak / Auth0 examples — see [`../../docs/idp-fedcm-integration.md`](../../docs/idp-fedcm-integration.md).

---

## Deployment: callback page

The OAuth popup redirects to `redirectUri`. The widget ships a tiny, side-effect-free HTML page at `dist/auth-callback.html` that `postMessage`s the authorization code back to the opener and then calls `window.close()`.

**Embedders must serve `dist/auth-callback.html` at the path registered as `redirectUri`.** For example, if your `redirectUri` is `https://app.example.com/oauth/callback`, copy `auth-callback.html` to that path (or route that URL to its contents). The page makes no network calls, reads no storage, and needs no CSP relaxations beyond the script that's inline in the file.

For logout, the profile widget performs local token cleanup first, then requests a full OIDC end-session redirect so authorization-server cookies and FedCM login status are cleared. Register `logoutRedirectUri` with the authorization server; if omitted, the runtime uses the current page URL.

---

## CSP

The widget is designed to run under a strict CSP. Required directives:

```
script-src 'self' https://cdn.stawi.org 'strict-dynamic' <nonce>;
worker-src 'self' blob:;
connect-src https://oauth2.stawi.org https://api.stawi.org;
img-src https: data:;
style-src 'unsafe-inline';   /* Shadow DOM inline styles */
font-src data:;              /* inlined woff2 */
frame-ancestors 'self';
```

Notes:

- `worker-src … blob:` is required because the auth Worker is built as a `Blob` URL so it inherits the origin.
- `style-src 'unsafe-inline'` is required for the Shadow DOM `<style>` block. Nonces do not propagate into shadow roots.
- `font-src data:` is only required for the default inlined fonts. If you set `externalFonts: true`, add `https://fonts.gstatic.com` instead (and `https://fonts.googleapis.com` to `style-src`).
- Replace `https://cdn.stawi.org` and the two `connect-src` hosts with whatever values you deploy.

## SRI

The published IIFE bundle is fingerprinted per release. Use `integrity=` + `crossorigin="anonymous"`:

```html
<script
  src="https://cdn.stawi.org/profile@1.0.0/profile.iife.js"
  integrity="sha384-REPLACE_WITH_PUBLISHED_HASH"
  crossorigin="anonymous"
></script>
```

Hashes are published alongside each release. Do not hand-roll hashes from arbitrary mirrors — only use the hash distributed with the release you're pinning to.

---

## Browser matrix

Minimum supported:

- Chrome 88+
- Firefox 90+
- Safari 14+

These are the first versions with the full set of features the runtime depends on: `navigator.locks`, `BroadcastChannel`, non-extractable `CryptoKey`s, `createImageBitmap`, and modern `fetch`/`AbortController` semantics.

---

## Observability

All hooks are optional. They're invoked synchronously from the widget boundary; keep them fast and non-throwing.

```ts
import type { AuthState, SecurityEvent } from "@stawi/auth-runtime";

mount({
  installationId: "inst_…",

  onAuthStateChange: (state: AuthState) => {
    // "initializing" | "authenticated" | "unauthenticated" | "refreshing" | "error"
  },

  onError: (err: unknown) => {
    // Recoverable / UI errors. Not every error lands here —
    // fatal runtime errors transition state to "error" instead.
  },

  onSecurityEvent: (e: SecurityEvent) => {
    // { type: "refresh_reuse_detected"; at: number }
    // { type: "storage_corruption";    at: number }
    // { type: "binding_invalidated";   at: number }
    // { type: "logged_out_elsewhere";  at: number }
  },

  onMetric: (
    name: string,
    durationMs: number,
    tags: Record<string, string>,
  ) => {
    // e.g. name="auth.token.refresh", durationMs=142, tags={ outcome: "ok" }
  },
});
```

### `MountHandle`

`mount()` returns a handle:

```ts
interface MountHandle {
  readonly version: string;
  getAuthState(): AuthState;
  prefetchDiscovery(): Promise<void>;
  unmount(): void;
}
```

- `version` — build version of `@stawi/profile`.
- `getAuthState()` — snapshot of the runtime's current auth state.
- `prefetchDiscovery()` — warm the OIDC discovery cache (no login triggered). Useful to call on idle so the first sign-in click is instant.
- `unmount()` — tears down React, terminates the auth Worker, closes the `BroadcastChannel`, and removes the host element. Idempotent.
