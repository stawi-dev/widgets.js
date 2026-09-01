# @stawi/identity

An embeddable admin widget for the Antinvestor platform identity service
(`https://api.stawi.org/identity`) — organisations, org units, workforce
members, internal teams and role assignments.

The widget renders as a shadow-DOM island, so nothing on the host page
leaks in or out. It speaks the Connect protocol over an
[`@stawi/auth-runtime`](../../shared/auth-runtime) runtime, so every request
carries the signed-in user's token.

## Install

```bash
pnpm add @stawi/identity @stawi/auth-runtime
```

Or drop the IIFE bundle on the page — it mounts itself from the script
tag's `data-*` attributes and also publishes `window.StawiIdentity`:

```html
<script
  src="https://cdn.stawi.org/identity/identity.iife.js"
  data-api-base-url="https://api.stawi.org/identity"
  data-installation-id="your-installation-id"
  data-idp-base-url="https://accounts.stawi.org"
  data-vocabulary="commerce"
  data-features='{"orgUnits":true}'
  data-theme="auto"
></script>
```

| Attribute                        | Required | Meaning                                                                                                      |
| -------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------ |
| `data-api-base-url`              | yes      | Identity service base URL                                                                                    |
| `data-installation-id`           |          | OAuth installation, used when the widget creates its own runtime                                             |
| `data-client-id`                 |          | OAuth client id; defaults to the installation id                                                             |
| `data-idp-base-url`              |          | Identity provider base URL                                                                                   |
| `data-logout-redirect-uri`       |          | Post-logout redirect                                                                                         |
| `data-profile-api-base-url`      |          | Profile service base; defaults to `data-api-base-url` with its last path segment replaced by `/profile`      |
| `data-organization-id`           |          | Pin one organisation and hide the picker                                                                     |
| `data-allow-create-organization` |          | `false` hides the create form                                                                                |
| `data-vocabulary`                |          | A preset name (`general`, `fintech`, `commerce`, `manufacturing`) **or** a JSON object merged over `general` |
| `data-features`                  |          | JSON, e.g. `{"orgUnits":true,"platformRoles":false}`                                                         |
| `data-tokens`                    |          | JSON design tokens (see [Theming](#theming))                                                                 |
| `data-css`                       |          | Raw CSS appended after the widget stylesheet and the tokens                                                  |
| `data-theme`                     |          | `light`, `dark` or `auto` (default)                                                                          |
| `data-locale`                    |          | BCP-47 locale; `en` and `sw` ship                                                                            |
| `data-initial-view`              |          | `members`, `teams`, `roles` or `units`                                                                       |

## `mount()`

```ts
import { mount } from "@stawi/identity";
import { createAuthRuntime } from "@stawi/auth-runtime";

// Share one runtime across every island and API client on the page, so
// they all read the same token store.
const runtime = createAuthRuntime({
  clientId: "your-client-id",
  idpBaseUrl: "https://accounts.stawi.org",
  allowedApiOrigins: ["https://api.stawi.org"],
});

const handle = mount({
  runtime,
  target: document.getElementById("identity-admin")!,
  apiBaseUrl: "https://api.stawi.org/identity",
  features: { orgUnits: true },
  theme: "auto",
});

handle.version; // build version of @stawi/identity
handle.getAuthState(); // "authenticated" | "unauthenticated" | …
handle.unmount(); // removes the host element
```

`unmount()` destroys the runtime **only** when the widget created it. A
runtime you passed in stays alive — its lifecycle is yours.

## React usage

```tsx
import { IdentityWidgetRoot } from "@stawi/identity";

<IdentityWidgetRoot
  runtime={runtime}
  apiBaseUrl="https://api.stawi.org/identity"
  organizationId={orgId}
  features={{ orgUnits: true }}
  initialView="teams"
  locale="sw"
  onError={(err) => reportToSentry(err)}
/>;
```

`IdentityWidgetRoot` renders into your DOM with no shadow root, so your own
stylesheet applies. It renders a root element carrying the `aiw-root` class
and a `data-theme` attribute. To get the shipped look, inject the light-DOM
build of the stylesheet once — `widgetStylesFor()` scopes the design tokens
to that selector, so nothing leaks onto the rest of your page:

```tsx
import { IdentityWidgetRoot, widgetStylesFor } from "@stawi/identity";

const css = widgetStylesFor(); // defaults to ".aiw-root"

<>
  <style>{css}</style>
  <IdentityWidgetRoot runtime={runtime} apiBaseUrl={apiBaseUrl} theme="auto" />
</>;
```

Pass your own selector if you scope the widget further, e.g.
`widgetStylesFor("#admin .aiw-root")`. The shadow-DOM build used by
`mount()` is exported as `widgetStyles`; it puts the tokens on `:host` and
is not usable in the light DOM.

`tokens` and `css` work on this path too: the root renders its own `<style>`
element scoped to that instance (`[data-aiw-instance="…"]`), so two widgets
on one page can carry different themes and neither leaks onto your page.

### Props

| Prop                                         | Default                                    | Notes                                                                                                |
| -------------------------------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| `apiBaseUrl`                                 | —                                          | **Required.** Identity service base URL                                                              |
| `runtime`                                    | —                                          | Recommended. Otherwise built from `installationId` / `clientId` / `idpBaseUrl` / `logoutRedirectUri` |
| `profileApiBaseUrl`                          | derived                                    | `apiBaseUrl` with its last path segment replaced by `/profile`                                       |
| `organizationId`                             | —                                          | Pin one organisation; hides the switcher                                                             |
| `allowCreateOrganization`                    | `true`                                     | Offer the create form when the caller has no organisation                                            |
| `vocabulary`                                 | `generalVocabulary`                        | Merged over the general preset                                                                       |
| `features`                                   | `{ orgUnits: false, platformRoles: true }` | Optional screens                                                                                     |
| `initialView`                                | first tab                                  | Ignored when the named view is disabled                                                              |
| `theme` / `tokens` / `css`                   | `auto`                                     | See [Theming](#theming)                                                                              |
| `locale`                                     | `en`                                       | `en` and `sw` ship; RTL locales set `dir="rtl"`                                                      |
| `onError` / `onAuthStateChange` / `onMetric` | —                                          | Host hooks                                                                                           |

## Vocabulary

The same widget serves fintech, manufacturing, commerce and general
trading tenants by swapping the words, not the code. Four presets ship:

```ts
import {
  generalVocabulary,
  fintechVocabulary,
  commerceVocabulary,
  manufacturingVocabulary,
  mergeVocabulary,
} from "@stawi/identity";
```

Anything you pass as `vocabulary` is merged over `generalVocabulary`:
arrays replace wholesale, `labels` is shallow-merged. An imports tenant,
for example:

```ts
<IdentityWidgetRoot
  apiBaseUrl="https://api.stawi.org/identity"
  vocabulary={{
    teamTypes: [
      { value: "sales", label: "Sales" },
      { value: "sourcing", label: "Sourcing" },
      { value: "clearing_logistics", label: "Clearing & logistics" },
      { value: "finance", label: "Finance" },
    ],
    roleKeys: [
      { key: "quote_approver", label: "Quote approver" },
      { key: "payment_verifier", label: "Payment verifier" },
      { key: "request_owner", label: "Request owner" },
    ],
    labels: { members: "Staff", units: "Branches" },
  }}
/>
```

To start from a non-general preset, merge it yourself:

```ts
const vocabulary = mergeVocabulary(fintechVocabulary, {
  labels: { teams: "Desks" },
});
```

## Features

```ts
features={{ orgUnits: true, platformRoles: false }}
```

- `orgUnits` (default `false`) — adds the Org units tab and the home-unit
  fields on members and teams. Turn it on for tenants that model regions,
  zones and branches.
- `platformRoles` (default `true`) — shows the platform-role column and
  field, stored in the member's `properties.platform_role`.

## Theming

Themes are CSS custom properties on the widget host. `theme` picks the
palette (`light`, `dark`, or `auto` to follow the OS); `tokens` overrides
individual values; `css` is appended last and wins over everything.

```ts
mount({
  runtime,
  apiBaseUrl: "https://api.stawi.org/identity",
  theme: "auto",
  tokens: {
    colorPrimary: "#2563eb",
    radius: "10px",
    fontBody: "Inter, system-ui, sans-serif",
    dark: { colorBg: "#111111", colorSurface: "#191919" },
    light: { colorBg: "#ffffff" },
  },
  css: ".aiw-table th { text-transform: none; }",
});
```

The token names and their `--aiw-*` variables are **identical to
`@stawi/profile`'s**, so one token object themes both widgets:

```ts
import { mount as mountProfile } from "@stawi/profile";
import { mount as mountIdentity } from "@stawi/identity";

const tokens = { colorPrimary: "#2563eb", radius: "10px" };
mountProfile({ installationId, tokens });
mountIdentity({ runtime, apiBaseUrl, tokens });
```

Identity adds two of its own: `tableStripe` (`--aiw-table-stripe`) and
`tabActive` (`--aiw-tab-active`). Presets `claudeLight`, `claudeDark`,
`neutralLight` and `highContrast` are exported for a quick start.

No fonts are inlined or fetched — the defaults are the platform system
stacks. Set `fontHeading` / `fontBody` to use your own.

## Cross-origin API access

When `apiBaseUrl` is on a different origin from the host page, the auth
runtime must be told that origin is allowed to receive tokens:

```ts
createAuthRuntime({
  clientId: "your-client-id",
  idpBaseUrl: "https://accounts.stawi.org",
  allowedApiOrigins: ["https://api.stawi.org"],
});
```

Without it the runtime never issues the request at all: `runtime.fetch`
throws `AuthError("INVALID_CONFIG")` before anything reaches the network,
which surfaces as a load failure on every screen.

## Accessibility and i18n

Tabs follow the ARIA tabs pattern with roving tabindex and arrow / Home /
End navigation. Dialogs are focus-trapped and `aria-modal`; tables carry
captions; loading states announce through `role="status"`. `en` and `sw`
translations ship, and an RTL locale sets `dir="rtl"` on the host.

## Browser support

Evergreen Chrome, Edge, Firefox and Safari 16.4+. The widget needs shadow
DOM, `AbortController` and ES2020; no polyfills are bundled.

## Development

```bash
pnpm --filter @stawi/identity playground   # http://localhost:5181
pnpm --filter @stawi/identity test
pnpm --filter @stawi/identity build
```

The playground renders the real widget against an in-memory identity
service, with switches for vocabulary preset, theme, locale and features.
