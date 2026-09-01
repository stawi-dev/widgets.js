---
"@stawi/identity": minor
---

Ship the embeddable identity admin widget: `mount()` as a shadow-DOM
island, `<IdentityWidgetRoot />` for React hosts, and an IIFE bundle that
auto-mounts from `data-*` attributes on its script tag.

The shell composes auth gate, organisation gate and an ARIA tab bar over
Members, Teams, Roles and — behind `features.orgUnits` — a new Org units
tree with create and edit. Vocabulary presets (general, fintech, commerce,
manufacturing) and per-host overrides let one widget serve tenants that
name things differently.

Theming reuses `@stawi/profile`'s token key names and `--aiw-*` variables,
so a host can pass one token object to both widgets; `tableStripe` and
`tabActive` are the identity-only additions. Default fonts are the system
stacks — the widget never fetches a font. Ships `en` and `sw` translations
with RTL support, a playground on port 5181, and a README.
