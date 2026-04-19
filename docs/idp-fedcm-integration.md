# IdP integration guide — FedCM + adaptive DPoP for `@stawi/profile`

Audience: IdP operators (platform / identity teams) who want their authorization server to work with the Stawi widgets (`@stawi/profile` and any other consumer of `@stawi/auth-runtime`).

This document is the normative companion to `docs/superpowers/specs/2026-04-19-auth-protocol-design.md` — the latter describes the wire protocol from the client's perspective; this one describes what the IdP must publish and how its endpoints must behave so that the client implementation in `@stawi/auth-runtime` works without falling back to interactive popups.

## Why FedCM + adaptive DPoP

The widget's primary goal is to keep OAuth credentials off the host page's main thread while giving users a prompt-free sign-in experience on every return visit. Two browser primitives make that possible:

- **FedCM** (`IdentityCredential` / `navigator.credentials.get({ identity })`) — lets the browser broker an ID-token handoff with your IdP without a full OAuth popup, driven by the user's existing IdP session. See the FedCM editor's draft at <https://fedidcg.github.io/FedCM/>.
- **DPoP** (RFC 9449) — sender-constrains the tokens to a non-extractable key generated inside the widget's Web Worker, so tokens are unusable if they ever leak.

The widget runs FedCM when both the browser and your IdP support it, and transparently falls back to an authorization-code + PKCE popup otherwise. It enables DPoP iff your OIDC discovery document advertises `ES256` under `dpop_signing_alg_values_supported`. Neither feature is required for correctness, but both materially improve the user and security stories.

## Minimum requirements

For a minimal working integration the IdP MUST publish and serve:

1. OIDC Discovery document at `/.well-known/openid-configuration`.
2. FedCM configuration document at `/.well-known/web-identity` (path configurable via `fedcmConfigUrl`, this is the default).
3. The FedCM endpoints referenced by the configuration document: `accounts_endpoint`, `client_metadata_endpoint`, `id_assertion_endpoint`, `disconnect_endpoint`, and a `login_url` page.
4. The standard OAuth/OIDC endpoints from discovery: `authorization_endpoint`, `token_endpoint`, `end_session_endpoint`, `revocation_endpoint`.

Everything below is expressed against those four buckets.

## 1. OIDC Discovery

The widget fetches `${idpBaseUrl}/.well-known/openid-configuration` on first use (cached for the session) and derives every other URL from the response.

Required fields:

| Field | Required | Notes |
|---|---|---|
| `issuer` | yes | MUST equal `idpBaseUrl` exactly (no trailing slash). Widget verifies this when validating ID tokens. |
| `authorization_endpoint` | yes | Must accept `response_type=code`, PKCE `S256`, and the `offline_access` scope. |
| `token_endpoint` | yes | Must support `authorization_code`, `refresh_token`, and `urn:ietf:params:oauth:grant-type:token-exchange` grants. |
| `end_session_endpoint` | yes | RP-Initiated Logout 1.0. Must accept `id_token_hint`, `client_id`, and `post_logout_redirect_uri`. |
| `revocation_endpoint` | yes | RFC 7009. Must accept `token` + `token_type_hint=refresh_token`. |
| `jwks_uri` | yes | Standard OIDC. Widget does not currently verify ID token signatures client-side, but the field is required for downstream services. |
| `scopes_supported` | yes | Must include `openid`, `profile`, `email`, and `offline_access`. |
| `grant_types_supported` | yes | Must include `authorization_code`, `refresh_token`, and `urn:ietf:params:oauth:grant-type:token-exchange`. |
| `code_challenge_methods_supported` | yes | Must include `S256`. |
| `dpop_signing_alg_values_supported` | recommended | Include `ES256` to opt this IdP into DPoP mode. If absent, the widget uses plain bearer tokens. |

Example (fields abbreviated):

```json
{
  "issuer": "https://oauth2.example.com",
  "authorization_endpoint": "https://oauth2.example.com/oauth2/auth",
  "token_endpoint": "https://oauth2.example.com/oauth2/token",
  "end_session_endpoint": "https://oauth2.example.com/oauth2/sessions/logout",
  "revocation_endpoint": "https://oauth2.example.com/oauth2/revoke",
  "jwks_uri": "https://oauth2.example.com/.well-known/jwks.json",
  "scopes_supported": ["openid", "profile", "email", "offline_access"],
  "grant_types_supported": [
    "authorization_code",
    "refresh_token",
    "urn:ietf:params:oauth:grant-type:token-exchange"
  ],
  "response_types_supported": ["code"],
  "code_challenge_methods_supported": ["S256"],
  "dpop_signing_alg_values_supported": ["ES256"],
  "token_endpoint_auth_methods_supported": ["none"]
}
```

`token_endpoint_auth_methods_supported` should include `none` since the widget is a public client (no client secret on the browser).

## 2. FedCM configuration document

Served at `/.well-known/web-identity` (or whatever path the embedder passes as `fedcmConfigUrl`). The widget probes it with a `GET` (previously `HEAD`; see §11) and caches the response in `sessionStorage` + memory. The browser itself re-fetches it when `navigator.credentials.get({ identity })` is invoked.

The widget reads one field directly — `login_url` — and passes the same URL to the browser as `configURL`. The browser reads the rest.

Required and optional fields:

```json
{
  "accounts_endpoint": "/fedcm/accounts",
  "client_metadata_endpoint": "/fedcm/client_metadata",
  "id_assertion_endpoint": "/fedcm/id_assertion",
  "disconnect_endpoint": "/fedcm/disconnect",
  "login_url": "https://oauth2.example.com/fedcm/login",
  "branding": {
    "background_color": "#0b0b0c",
    "color": "#f5f5f5",
    "icons": [
      { "url": "https://oauth2.example.com/static/idp-icon.png", "size": 96 }
    ],
    "name": "Example IdP"
  }
}
```

`login_url` is **critical**: when the browser reports no active IdP session (see `NetworkError` handling in §8), the widget opens `login_url` in a popup to let the user sign in, and then retries FedCM. If `login_url` is missing, the widget has no choice but to fall back to the OAuth popup.

All paths may be absolute URLs or same-origin relative paths. Browsers only accept same-origin paths from this document.

## 3. FedCM endpoint contracts

All four endpoints below are called by the browser, not by the widget. The browser sets `Sec-Fetch-Dest: webidentity` on every request, and the IdP MUST reject the request (`400 Bad Request` is appropriate) when the header is absent — this prevents same-site requests from other contexts masquerading as FedCM calls.

The browser handles credentials transparently (it sends the IdP's first-party cookies even though the call is cross-site). The IdP MUST respond with CORS headers that allow the widget's origin — see §10.

### 3.1 `accounts_endpoint`

`GET ${accounts_endpoint}` — called by the browser to enumerate signed-in accounts.

- Request: no body. Browser attaches IdP first-party cookies.
- Response `200 application/json`:

```json
{
  "accounts": [
    {
      "id": "user_01HX3Z…",
      "name": "Jane Doe",
      "email": "jane@example.com",
      "given_name": "Jane",
      "picture": "https://cdn.example.com/avatars/jane.webp",
      "approved_clients": ["inst_abc123"],
      "login_hints": ["jane@example.com"],
      "domain_hints": ["example.com"]
    }
  ]
}
```

- If no session: respond `401`. The browser translates this into a `NetworkError` on the widget side, which triggers the `login_url` fallback (see §8).

### 3.2 `client_metadata_endpoint`

`GET ${client_metadata_endpoint}?client_id=<id>` — called by the browser to fetch policy URLs for the consent dialog.

- Response `200 application/json`:

```json
{
  "privacy_policy_url": "https://example.com/privacy",
  "terms_of_service_url": "https://example.com/terms"
}
```

### 3.3 `id_assertion_endpoint`

`POST ${id_assertion_endpoint}` with `application/x-www-form-urlencoded` body — called by the browser when the user picks an account.

Form fields sent by the browser:

- `client_id`
- `account_id`
- `disclosure_text_shown` (`"true"` / `"false"`)
- `nonce` — **widget-generated per attempt**, 128 bits of entropy, hex-encoded. The IdP **MUST** echo this exact value into the `nonce` claim of the issued ID token. The widget's worker verifies `id_token.nonce === expectedNonce` and raises `FEDCM_NONCE_MISMATCH` on any deviation.
- `fields` — optional, comma-separated (when the client requests data minimization).
- `is_auto_selected` (`"true"` / `"false"`)
- Any extra params the widget passes via `AuthConfig.fedcm.params`.

Response `200 application/json`:

```json
{ "token": "<JWT id_token>" }
```

ID-token claim requirements (all verified by the widget):

| Claim | Required | Notes |
|---|---|---|
| `iss` | yes | MUST equal `idpBaseUrl`. Widget rejects with `FEDCM_ISS_MISMATCH` otherwise. |
| `aud` | yes | MUST equal the `client_id` the browser sent. |
| `exp` | yes | MUST be short — SHOULD be ≤ 5 minutes. The ID token is only used as the `subject_token` of a follow-up token-exchange request; long-lived IDs serve no purpose and widen the replay window. |
| `iat` | yes | Standard OIDC. |
| `sub` | yes | Stable subject identifier. |
| `nonce` | yes | Exact echo of the form-field `nonce`. |
| `email`, `name`, `picture`, `email_verified` | optional | Populate the widget's prompt-free account view when present. |

Error responses follow the FedCM spec — `{ "error": { "code": "access_denied", "url": "https://example.com/error-details" } }` — and surface to the widget as `FedCMOutcome.kind === "error"` with `code` and `url` preserved for telemetry.

### 3.4 `disconnect_endpoint`

`POST ${disconnect_endpoint}` with `application/x-www-form-urlencoded` body — called by the widget on logout via `IdentityCredential.disconnect({ configURL, clientId, accountHint })`.

Form fields:

- `client_id`
- `account_hint`

Response `200 application/json`:

```json
{ "account_id": "user_01HX3Z…" }
```

The IdP MUST unlink the user ↔ client association so that subsequent `accounts_endpoint` calls do not return this user for this client without a fresh consent.

### 3.5 `login_url` page

`login_url` is a **normal HTML page served by the IdP**, not an API endpoint. The widget opens it in a centered 500×600 popup when FedCM reports `no-session`. The page's job is to drive the user through first-party login (whatever flow the IdP normally uses) and, on success, notify the widget so it can retry FedCM.

The success handshake is specific to the widget:

```js
// runs on the login_url page after the user authenticates
window.opener?.postMessage(
  { type: "stawi-login-complete" },
  // target origin = the widget's origin; loosely, the `event.origin` you saw
  // from the opener's initial postMessage, or `"*"` is also acceptable because
  // the widget verifies the sender origin.
  event.origin
);
window.close();
```

The widget listens for `message` events, filters by `ev.origin === new URL(idpBaseUrl).origin` (so the IdP origin is the authoritative sender), and only accepts the payload `{ type: "stawi-login-complete" }`. If the page doesn't post this message, the widget times out after 5 minutes (`OAUTH_POPUP_TIMEOUT`). If the user closes the popup manually, the widget resolves as `OAUTH_POPUP_CLOSED`.

Additionally, the IdP's successful-login response SHOULD include the `Set-Login: logged-in` header (see §4) so that subsequent same-origin navigations immediately mark the IdP as having a session and FedCM skips the login_url popup next time.

## 4. Login Status API (`Set-Login`)

Chrome-based FedCM requires the Login Status API to be up-to-date before it will silently prompt. There are two equivalent ways to set the signal:

- **HTTP header** on a top-level navigation response on the IdP origin:
  - After successful login: `Set-Login: logged-in`
  - After logout: `Set-Login: logged-out`
- **Frontend API**, from a page on the IdP origin: `navigator.login.setStatus("logged-in")` / `"logged-out"`.

If the login status is `logged-out`, Chrome will not even call `accounts_endpoint` — the widget receives `no-session` immediately and opens `login_url`. The IdP MUST therefore emit `Set-Login: logged-in` on at least one navigation response as part of every successful login, and `Set-Login: logged-out` on every logout.

## 5. Token-exchange grant

The widget converts the FedCM-issued ID token into OAuth tokens via an OAuth 2.0 Token Exchange (RFC 8693) request:

```
POST ${token_endpoint}
Content-Type: application/x-www-form-urlencoded

grant_type=urn:ietf:params:oauth:grant-type:token-exchange
&client_id=<client_id>
&subject_token=<fedcm_id_token>
&subject_token_type=urn:ietf:params:oauth:token-type:id_token
```

The IdP MUST:

- Verify the `subject_token` signature and claims (`iss`, `aud`, `exp`).
- Issue `{ access_token, refresh_token, expires_in, token_type }` on success. The refresh token MUST be scoped as if the client had completed a full authorization-code flow with `offline_access`.
- In DPoP mode: bind the refresh token to the `jkt` of the DPoP proof (see §6) and return `token_type: "DPoP"`.

## 6. DPoP support (optional)

If `dpop_signing_alg_values_supported` contains `ES256`, the widget will send `DPoP: <proof-jwt>` on every token-endpoint request and every API call. Operator requirements:

- Accept `DPoP` header on `token_endpoint` and on all authorized API endpoints (per RFC 9449).
- Validate the proof: `typ=dpop+jwt`, `alg=ES256`, embedded `jwk`, claims `htm`, `htu`, `iat` within ±60 s of server time, `jti` not seen recently.
- Support the **nonce challenge flow** (RFC 9449 §8 / §9). On any request where you want a nonce, respond `401` with:

  ```
  WWW-Authenticate: DPoP error="use_dpop_nonce"
  DPoP-Nonce: <opaque nonce>
  ```

  The widget retries exactly once with the nonce claim in the proof. It also honors `DPoP-Nonce` on successful responses as an update to the current nonce.

- On the token endpoint: bind the issued refresh token (and thereby all derived access tokens) to the public-key thumbprint (`jkt`) of the DPoP proof. Reject refresh attempts whose proof `jkt` does not match the binding with `401 invalid_dpop_proof` — the widget wipes state and emits `SecurityEvent("binding_invalidated")`.

- On API endpoints: additionally validate the `ath` claim (`base64url(sha256(access_token))`).

- Clock tolerance: accept `iat` within ±60 s. If the client's clock is skewed, the widget reads the `Date` response header, computes an offset, and retries.

## 7. Refresh-token rotation and reuse detection

This is non-negotiable for the widget's threat model. The IdP MUST:

1. **Rotate** the refresh token on every successful `refresh_token` grant — issue a new refresh token and atomically invalidate the old one. Do not return the same refresh token twice.
2. **Detect reuse** — if an already-invalidated refresh token is presented, respond:

   ```
   HTTP/1.1 400 Bad Request
   Content-Type: application/json

   { "error": "invalid_grant", "error_description": "refresh token reuse detected" }
   ```

   The `error_description` text is advisory — the widget only checks `error === "invalid_grant"` — but including it helps debugging.
3. **Invalidate the entire token family** on reuse. Any other refresh tokens derived from the same original grant MUST also be rejected. This is the mechanism that turns a leaked refresh token into a single-use artifact.

On detecting `invalid_grant`, the widget wipes local crypto material, emits `SecurityEvent("refresh_reuse_detected")` to the embedder, broadcasts `logged_out_elsewhere` to sibling tabs, and transitions to `unauthenticated`.

## 8. `login_url` fallback and `no-session` detection

The widget maps FedCM failure modes as follows (see `shared/auth-runtime/src/shared/fedcm.ts`):

| Browser-reported condition | Widget outcome | Action |
|---|---|---|
| `NetworkError` on `navigator.credentials.get` | `{ kind: "no-session", loginUrl }` | Open `loginUrl` popup, wait for `stawi-login-complete`, retry FedCM with `mediation: "required"`. |
| `NotAllowedError` under `silent` mediation | `{ kind: "not-allowed" }` | Skip to OAuth-popup fallback. |
| `NotAllowedError` under `optional`/`required` mediation | `{ kind: "dismissed" }` | User-cancelled; do not retry automatically. |
| `AbortError` | `{ kind: "aborted" }` | Runtime was destroyed mid-attempt. |
| `IdentityCredentialError` | `{ kind: "error", code, url }` | Expose to embedder via `onFedcmEvent`; fall back to OAuth popup. |

For the `no-session` path to work, `login_url` MUST be present in the FedCM config document **and** the IdP MUST actually report no session when there is none (typically by returning `401` from `accounts_endpoint` when the IdP cookie is missing).

## 9. Logout behaviors

The widget's logout sequence:

1. **`end_session_endpoint`** — `GET` or `POST` with `id_token_hint=<last_id_token>`, `client_id`, and `post_logout_redirect_uri`. Best-effort; the widget does not block local state teardown on failure. Per OIDC RP-Initiated Logout 1.0.
2. **`revocation_endpoint`** — `POST token=<refresh_token>&token_type_hint=refresh_token`. Best-effort. Per RFC 7009.
3. **`IdentityCredential.disconnect({ configURL, clientId, accountHint })`** — browser-mediated, hits `disconnect_endpoint`. Best-effort.
4. **`navigator.credentials.preventSilentAccess()`** — browser-local flag to disable auto re-auth in the current browser until the user explicitly re-signs-in.
5. Local crypto wipe and `Set-Login: logged-out` expected from the IdP end_session response.

Each of the four server-side calls MUST tolerate being called with already-invalidated tokens — logout must not fail because the tokens were already gone.

## 10. CORS

All endpoints called directly by the widget's Worker (token, revocation, end-session) MUST respond with:

```
Access-Control-Allow-Origin: <widget-origin>       # or a wildcard for browser bundle
Access-Control-Allow-Methods: POST, OPTIONS
Access-Control-Allow-Headers: Content-Type, DPoP
Access-Control-Expose-Headers: DPoP-Nonce, WWW-Authenticate
```

For preflight (`OPTIONS`), respond with the same headers plus `Access-Control-Max-Age: 3600`.

The FedCM endpoints (`accounts_endpoint`, `client_metadata_endpoint`, `id_assertion_endpoint`, `disconnect_endpoint`) are called by the browser on behalf of the widget. The browser sets `Sec-Fetch-Dest: webidentity`. For these endpoints:

- The IdP MUST echo `Access-Control-Allow-Origin` = the **caller** origin (the widget's embedding site).
- The IdP MUST set `Access-Control-Allow-Credentials: true` so the IdP's first-party cookies flow on the browser-mediated request.
- The IdP MUST reject any request on these paths that does not carry `Sec-Fetch-Dest: webidentity` — this is how the spec prevents FedCM endpoints from being abused as generic APIs.

## 11. HTTP verb on the FedCM config probe

Earlier revisions of the widget used `HEAD` to probe `/.well-known/web-identity`. The current revision uses `GET` and parses the response to extract `login_url`. Operators SHOULD serve `GET` (with `Content-Type: application/json`) and SHOULD either return `405 Method Not Allowed` on `HEAD` or support `HEAD` with the same headers and an empty body — either is compatible with the widget. `OPTIONS` SHOULD be answered for CORS preflight.

## 12. Security checklist

- **HTTPS everywhere.** FedCM will not talk to `http://` origins (except localhost for dev). DPoP proofs include `htu` which must match the request URL scheme.
- **Content-Security-Policy on the `login_url` page.** Permit `script-src 'self'` (plus any nonce you use), disallow framing (`frame-ancestors 'none'`). The page must be navigable in a popup; it does not need to be iframe-embeddable.
- **Short-lived access tokens.** Target `expires_in ≤ 300` (5 min). The widget refreshes 60 s before expiry.
- **Short-lived FedCM ID tokens.** Target `exp ≤ 300`. The ID token's only purpose is to be the subject_token of a follow-up token exchange.
- **DPoP clock tolerance.** Accept `iat` within ±60 s. Do not accept wider windows; the widget corrects via `Date` header on failure.
- **Rate-limit** the token, revocation, and id_assertion endpoints per-IP and per-client.
- **JWKS rotation.** Rotate signing keys regularly. Publish both the outgoing and incoming keys in `jwks_uri` for at least `expires_in + clock_skew` during overlap. The widget caches discovery but does not pin JWKS.
- **Reuse detection alarm.** Alert on `invalid_grant` with reuse semantics — one event is a signal, a pattern is an incident.

## 13. Worked examples

The snippets below show the minimum config for three popular IdPs. Fields not shown use the product default.

### 13.1 Ory Hydra

Hydra exposes OIDC discovery at `/.well-known/openid-configuration` and supports refresh-token rotation with reuse detection natively. Configure:

```yaml
# hydra.yml
oauth2:
  refresh_token_rotation:
    enabled: true
  grant:
    jwt:
      max_ttl: 5m
ttl:
  access_token: 5m
  refresh_token: 720h   # policy
  id_token: 5m
  auth_code: 1m
webfinger:
  oidc_discovery:
    supported_scope: ["openid", "profile", "email", "offline_access"]
    supported_claims: ["sub", "email", "name", "picture"]
    grant_types_supported:
      - authorization_code
      - refresh_token
      - urn:ietf:params:oauth:grant-type:token-exchange
```

Hydra does not ship a FedCM front-end of its own — operators deploy their own `login_url` page that talks to Hydra's login/consent flow and emits `Set-Login: logged-in` on success. The `accounts_endpoint`, `id_assertion_endpoint`, and `disconnect_endpoint` likewise need to be implemented as a thin adapter in front of Hydra (Hydra-internal endpoint contracts vary by version; check your deployed Hydra's admin API for the authoritative URLs).

### 13.2 Keycloak

Keycloak exposes discovery at `/realms/<realm>/.well-known/openid-configuration`. FedCM is experimental; as of the reference-manual version this guide was written against, FedCM endpoints are not first-class. Operators typically run a **FedCM adapter** (small service) in front of Keycloak that:

- Publishes `/.well-known/web-identity` with `login_url` pointing at Keycloak's authentication flow.
- Implements `accounts_endpoint` by reading the Keycloak session (via the admin API) for the current IdP cookie.
- Implements `id_assertion_endpoint` by requesting a short-lived ID token from Keycloak's token endpoint on behalf of the user.

Keycloak realm settings that matter for the widget:

- **Refresh token rotation:** enable "Revoke Refresh Token" (Realm Settings → Tokens). Set "Refresh Token Max Reuse" to `0`.
- **Token lifetimes:** Access Token Lifespan = 5 min, SSO Session Idle / Max = per policy, Client Session Idle / Max = per policy.
- **Client type:** public client, PKCE required (Advanced → Proof Key for Code Exchange Code Challenge Method = `S256`).
- **DPoP:** enable at the client level if your Keycloak version exposes it; otherwise run bearer mode.

(Specifics of Keycloak's FedCM endpoint contract are evolving; confirm against your deployed version's documentation before relying on them.)

### 13.3 Auth0

Auth0 exposes discovery at `/.well-known/openid-configuration`. Auth0 does not currently publish a public FedCM configuration out of the box — FedCM support requires a **custom FedCM surface** (typically an Action + a dedicated static `/.well-known/web-identity` served from a tenant-owned origin). Required tenant settings for the rest of the integration:

- Application type: SPA (public client), PKCE required.
- Grant Types (Advanced): `authorization_code`, `refresh_token`, `urn:ietf:params:oauth:grant-type:token-exchange` (the last one requires enabling Token Exchange via support/Advanced).
- Refresh Token Rotation: **enabled**, with Reuse Interval `0`. Absolute Lifetime per policy.
- Allowed Web Origins: the widget's embedding origin (for CORS).
- Logout URLs: include `post_logout_redirect_uri` values the widget uses.

Auth0's exact FedCM endpoint contracts are not stable as of this writing; the operator is expected to build the `accounts_endpoint` / `id_assertion_endpoint` / `disconnect_endpoint` layer themselves and point `login_url` at the tenant's Universal Login page configured to emit `Set-Login: logged-in` on successful login.

## 14. Acceptance test suggestions

Before exposing the IdP to the widget in production, verify end-to-end:

1. `curl ${idpBaseUrl}/.well-known/openid-configuration` returns the required fields (§1).
2. `curl ${idpBaseUrl}/.well-known/web-identity` returns `login_url` and all four endpoint URLs (§2).
3. FedCM endpoints reject requests without `Sec-Fetch-Dest: webidentity`.
4. Manually trigger a token exchange with a test FedCM ID token and confirm the response carries `token_type: "DPoP"` when DPoP mode is advertised, plus a fresh refresh token.
5. Use the returned refresh token twice in a row — the second use MUST return `invalid_grant` and MUST invalidate the sibling access token.
6. Log in through `login_url`, confirm `Set-Login: logged-in` is present on at least one response in the flow.
7. Call `end_session_endpoint` and confirm subsequent refresh attempts return `invalid_grant`.

## 15. References

- OIDC Discovery 1.0 — <https://openid.net/specs/openid-connect-discovery-1_0.html>
- OIDC RP-Initiated Logout 1.0 — <https://openid.net/specs/openid-connect-rpinitiated-1_0.html>
- RFC 6749 — OAuth 2.0
- RFC 7009 — OAuth 2.0 Token Revocation
- RFC 7636 — PKCE
- RFC 8693 — OAuth 2.0 Token Exchange
- RFC 9449 — DPoP
- FedCM editor's draft — <https://fedidcg.github.io/FedCM/>
- Login Status API — part of the FedCM editor's draft; see <https://fedidcg.github.io/FedCM/#login-status>
- Stawi auth protocol spec — `docs/superpowers/specs/2026-04-19-auth-protocol-design.md`
