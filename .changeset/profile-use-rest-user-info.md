---
"@stawi/profile": minor
---

Use the existing `GET /profile/public/user/info` REST endpoint on
`service-profile` for the initial profile load instead of a Connect
RPC `GetById` call.

**Why**: the REST endpoint resolves the current user from the JWT
subject claim, so the widget no longer has to fetch claims first to
derive `profile_id` and then issue a separate Connect RPC. The new
flow is a single simple GET — no CORS preflight (no custom request
headers), no Idempotency-Key plumbing, smaller payload — and exactly
matches "give me the logged-in user's profile" semantically.

**Behaviour change**: the initial load HTTP request shape changed
from POST `/profile/profile.v1.ProfileService/GetById` (with a JSON
body, Idempotency-Key header, Content-Type) to a plain GET
`/profile/public/user/info`. Mutations (`updateProfile`,
`addContact`, `removeContact`, contact verification, avatar upload)
still flow through Connect RPC unchanged.

**Field coverage**: `/public/user/info` ships `sub`, `name`, `url`,
`contacts`. `language` and `country` (Connect RPC GetById properties)
are absent from the REST response today; the UI degrades to no
language/country indicator on initial render. If those fields need
to be present on first paint, extend the handler on
`service-profile` (`apps/default/service/handlers/rest_user_endpoints.go`)
to include them — no widget change required at that point.

**Consumer impact**: none beyond bumping the dependency. Apps that
already pass `apiBaseUrl` bare ("https://api.stawi.org") work without
changes — the widget builds the full URL including the `/profile`
gateway prefix.
