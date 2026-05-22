---
"@stawi/auth-runtime": minor
---

Add `fedcmBaseUrl` to `AuthConfig` so the FedCM IdP origin can differ from the Hydra OAuth2 issuer origin. Defaults to `https://accounts.stawi.org` for the Stawi stack where Hydra and the FedCM endpoints live on different hosts. `fedcmConfigUrl` default also updated to `/fedcm/config.json` (the actual configURL Chrome expects) rather than the discovery pointer at `/.well-known/web-identity`.

`navigator.credentials.get` and `IdentityCredential.disconnect` now build their configURL from `fedcmBaseUrl + fedcmConfigUrl`; `iss` validation still happens against `idpBaseUrl` because Hydra remains the token issuer regardless of which origin serves the FedCM dialog.

Non-breaking: setups where Hydra and FedCM share a host can override `fedcmBaseUrl` to match `idpBaseUrl`.
