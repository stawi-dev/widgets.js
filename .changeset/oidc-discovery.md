---
"@stawi/auth-runtime": minor
---

Use OIDC discovery to find the real authorization and token endpoints.

Previously the library hardcoded `/oauth/authorize` and `/oauth/token` on the
IdP base URL. Those paths don't exist on Ory Hydra (the upstream IdP behind
`oauth2.stawi.org`), which advertises `/oauth2/auth` and `/oauth2/token` via
its OpenID discovery document — so every OAuth popup opened onto a Hydra 404
page and every refresh likewise failed.

This release fetches `/.well-known/openid-configuration` once per `idpBaseUrl`
on the first auth attempt, caches it in memory, and uses the advertised
`authorization_endpoint`, `token_endpoint`, and `end_session_endpoint` from
then on. Nothing in the public API changed; existing consumers get the fix
automatically.

Additional improvements:

- New `AuthConfig.skipFedCM: boolean` option to bypass both FedCM attempts
  entirely. Useful when the IdP doesn't publish a FedCM config (saves
  ~0.5–1s per sign-in click).
- When FedCM is not bypassed, the runtime now HEADs the IdP's FedCM config
  path once and caches the result per-IdP; unsupported IdPs short-circuit
  on subsequent attempts instead of paying the browser-probe cost twice.
- Logout uses `end_session_endpoint` from discovery when present.
