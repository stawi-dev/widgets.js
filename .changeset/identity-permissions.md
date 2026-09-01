---
"@stawi/identity": minor
---

Permissions: bundles, overrides and host-facing pickers.

Hosts can now describe their access model to the widget with
`permissionModel` — named bundles of permissions per service namespace, each
mapped to a platform role. The member dialog offers the bundle instead of a
bare platform role, activating a member applies that bundle's permissions
through the platform tenancy service, deactivating revokes them, and changing
a bundle grants and revokes only the difference. A tenancy call that fails
never rolls back the member write: the failures stay on screen with a retry,
so a partial grant is visible rather than silent.

A new **Permissions** tab switches any permission the tenancy catalogue
registers on top of the bundle a member holds. Every row says why it is on —
Bundle, Granted, Revoked or Role — and "Reapply bundle" drops the overrides.
Choices persist on the member's `properties` (`platform_role`,
`access_bundle`, `permission_grants`, `permission_revokes`), leaving every
other property untouched.

For hosts building their own assignment controls, `useIdentityDirectory()`
returns an organisation's members (with resolved profile names), its teams
and a `resolveName()` fallback, cached per organisation for 60 s and shared
between every component that asks; `MemberPicker` and `TeamPicker` render it
as light-DOM selects. `createTenancyClient` and `onMemberChange` are exported
too, and the IIFE bundle reads `data-tenancy-api-base-url` and
`data-permission-model`.
