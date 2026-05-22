---
"@stawi/profile": minor
---

Align Connect RPC URL construction with the Antinvestor cluster's
one-PathPrefix-per-service gateway convention.

The widget used to call `${apiBaseUrl}/profile.v1.ProfileService/<Method>`,
which only reached `service-profile` accidentally — via Envoy Gateway's
non-spec-compliant string-prefix match of the existing `/profile`
HTTPRoute. After the gateway URLRewrote `/profile` → `/`, the backend
saw a malformed `.v1.ProfileService/<Method>` path with a leading dot;
the request limped through but the routing was incidental, not
intentional.

This release prefixes the Connect RPC path with `/profile` so the URL
becomes `${apiBaseUrl}/profile/profile.v1.ProfileService/<Method>`.
The gateway matches the `/profile` PathPrefix cleanly, strips it, and
the backend mux — which serves both REST and Connect RPC handlers —
receives `/profile.v1.ProfileService/<Method>`, the canonical Connect
RPC path. No separate gateway rule for Connect RPC is needed.

**Consumers must pass `apiBaseUrl` without any service prefix.** The
widget builds the full path including `/profile`; baking `/profile`
into `apiBaseUrl` would produce a double-prefix URL.

This is a minor bump rather than a patch because the URL shape changed
on the wire — any environment that doesn't have `service-profile`
exposed under a `/profile` PathPrefix will see 404s on widget calls
after upgrading. The cluster has had that rule in place since the
service was first deployed; non-Antinvestor consumers (none known)
would need to mirror the convention.
