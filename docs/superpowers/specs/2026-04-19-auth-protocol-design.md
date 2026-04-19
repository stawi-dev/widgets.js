# Stawi Auth Protocol — platform-agnostic design

Status: draft
Date: 2026-04-19
Applies to: `@stawi/auth-runtime` (browser), future `stawi_auth` (Flutter/Dart), any other client binding.

## 1. Purpose and scope

This document specifies the **wire-level protocol and runtime state machine** that every Stawi auth client implements, regardless of platform. Browser-specific storage and isolation primitives are specified in the companion `auth-runtime-browser` design; mobile/desktop bindings will have analogous companion specs.

The protocol must:

- Require no server-side session state held by the embedder. Tokens are the only credential material and live only on the end user's device.
- Be safe to drop into third-party web sites (untrusted host origin).
- Survive IdP-driven key rotation, refresh-token rotation with reuse detection, and client-side storage loss without stranding the user.
- Work whether the IdP supports DPoP (RFC 9449) today or adds it later.

## 2. Normative terminology

"MUST", "SHOULD", "MAY" per RFC 2119.

## 3. Dependencies

- OAuth 2.0 authorization_code grant (RFC 6749).
- PKCE with S256 method (RFC 7636).
- OIDC Discovery 1.0 (`/.well-known/openid-configuration`).
- DPoP (RFC 9449), adaptive — used iff the IdP advertises `dpop_signing_alg_values_supported` including `ES256`.
- Refresh-token rotation with reuse detection (IdP-side configuration; client assumes and handles it).
- OIDC RP-Initiated Logout 1.0 for `end_session_endpoint`.
- Optional: FedCM for silent re-auth on browsers that support it.

## 4. Configuration

A conforming client takes these inputs:

| Field | Required | Default | Notes |
|---|---|---|---|
| `clientId` | yes | — | OAuth client ID. |
| `idpBaseUrl` | no | `https://oauth2.stawi.org` | Root for OIDC discovery (`${idpBaseUrl}/.well-known/openid-configuration`). |
| `apiBaseUrl` | no | `https://api.stawi.org` | Root for authenticated API calls. |
| `redirectUri` | no | platform-default | Must resolve to a URI the embedder/IdP both trust. |
| `scopes` | no | `["openid", "profile", "email", "offline_access"]` | `offline_access` MUST be requested to receive a refresh token. |
| `installationId` | no | — | Multi-tenant hint; sent as `installation_id` custom param on `/authorize`. |
| `fedcmConfigUrl` | no | `/.well-known/web-identity` | Browser only. |
| `skipFedCM` | no | `false` | Browser only. |

Client MUST normalize `idpBaseUrl` and `apiBaseUrl` by stripping a trailing `/`.

Client MUST reject configs missing `clientId` with an `INVALID_CONFIG` error.

## 5. Discovery

Client MUST fetch OIDC discovery at first use and cache it in memory for the runtime lifetime. On cache miss, the client MUST:

1. `GET ${idpBaseUrl}/.well-known/openid-configuration` with a timeout of 10 s.
2. Parse JSON body. Reject unless all of `issuer`, `authorization_endpoint`, `token_endpoint` are strings.
3. Cache the document.

Client MUST NOT cache failures.

Client MAY expose `prefetchDiscovery()` so embedders can warm the cache during idle time.

Client SHOULD feature-detect DPoP from `dpop_signing_alg_values_supported` on the cached document. If the array contains `ES256`, the client enters **DPoP mode**; otherwise **bearer mode**. The mode is sticky for the session.

## 6. Key generation

On first sign-in for a given `(clientId, idpBaseUrl)` namespace the client generates two keys:

| Key | Algorithm | Extractable | Usages | Lifetime |
|---|---|---|---|---|
| DPoP signing key | ECDSA P-256 | **false** | `["sign"]` | Until logout, security wipe, or storage loss. |
| Wrap key | AES-GCM 256 | **false** | `["encrypt", "decrypt"]` | Same as DPoP key. |

Both keys MUST be non-extractable by the platform's crypto API (on browsers: `crypto.subtle.generateKey(..., false, ...)`; on iOS: Secure Enclave; on Android: StrongBox/TEE). A conforming implementation that cannot meet this requirement MUST refuse to start and raise `CRYPTO_UNSUPPORTED`.

The client MUST NOT rotate these keys during a live session. Rotation requires explicit logout, breach signal, or user-requested reset.

## 7. Sign-in flow

### 7.1 FedCM (browser only; optional)

If `skipFedCM === false` and `IdentityCredential` is available:

1. Probe `${idpBaseUrl}${fedcmConfigUrl}` with `HEAD` to avoid a browser prompt on IdPs that do not publish FedCM config. Cache per IdP.
2. Attempt `navigator.credentials.get({ identity: {...}, mediation: "silent" })`.
3. On non-null credential: decode the returned ID token's payload; assert `iss === idpBaseUrl`. On mismatch raise `FEDCM_ISS_MISMATCH`.
4. Exchange via token-exchange grant (see 7.3).

If silent fails, client MAY try `mediation: "optional"` as a second step.

### 7.2 Authorization-code + PKCE

1. Generate `state = uuid()`, `codeVerifier = base64url(random(64))`, `codeChallenge = base64url(sha256(codeVerifier))`.
2. Build `authorization_endpoint` URL with: `client_id`, `redirect_uri`, `response_type=code`, `scope`, `state`, `code_challenge`, `code_challenge_method=S256`, and optional `installation_id`.
3. Open the authorization URL in a user-agent-appropriate surface (browser popup, ASWebAuthenticationSession, Chrome Custom Tabs). The surface MUST be opened synchronously from a user gesture.
4. Wait for the surface to deliver back `{code, state}` via platform-appropriate channel (postMessage + origin check, deep link, etc.). On any of: state mismatch, missing code, `error` param, surface closed without result, or 5-minute timeout — raise the corresponding error.
5. Exchange the code (see 7.3).

### 7.3 Token exchange

`POST ${token_endpoint}` with `application/x-www-form-urlencoded`:

- Authorization-code grant body: `grant_type=authorization_code`, `client_id`, `code`, `redirect_uri`, `code_verifier`.
- Token-exchange grant body (FedCM): `grant_type=urn:ietf:params:oauth:grant-type:token-exchange`, `client_id`, `subject_token`, `subject_token_type=urn:ietf:params:oauth:token-type:id_token`.
- **DPoP mode:** include header `DPoP: <jwt>` where the JWT has `typ=dpop+jwt`, `alg=ES256`, `jwk=<public key of the DPoP key>`, and claims `htm=POST`, `htu=<token_endpoint>`, `iat=<now>`, `jti=<uuid>`.

On `200 OK`, parse:
- `access_token` (required)
- `refresh_token` (required — MUST have been granted via `offline_access` scope)
- `expires_in` (required; default 300 if omitted)
- `token_type` (required; `Bearer` or `DPoP`)

On `401` with response header `DPoP-Nonce`, the client MUST retry once with an additional `nonce` claim in the DPoP proof.

On any other non-2xx, raise `TOKEN_EXCHANGE_FAILED`.

## 8. Token storage

Client MUST store the refresh token **encrypted at rest** using the wrap key.

```
wrapped = AES-GCM(key=wrapKey, iv=random(12), plaintext=utf8(refreshToken))
```

Store `{iv, ciphertext, tag}` in the platform's durable store (browser: IndexedDB inside the Worker origin; iOS: Keychain item; Android: EncryptedSharedPreferences). Storage records MUST be keyed by `(clientId, idpBaseUrl)` namespace.

Client MUST hold the plaintext refresh token in memory only within an isolated compartment (browser: dedicated Web Worker; iOS/Android: separate process or strong sandbox). The plaintext refresh token MUST NOT cross into the main/UI thread.

Client MUST hold the plaintext access token in memory only within the same isolated compartment. The access token MUST NOT cross into the main/UI thread. Authorized API calls are made by the compartment itself; the caller sees only the response body.

Client MUST NOT persist the access token.

## 9. Refresh

When a call needs an access token and the in-memory token is within `60 s` of expiry (or absent), the compartment refreshes:

1. Acquire exclusive lock `stawi-auth:refresh:${clientId}` (browser: `navigator.locks.request` with `ifAvailable: false`, `mode: "exclusive"`; other platforms: equivalent).
2. Re-read refresh token from durable store (another lock holder may have rotated it).
3. `POST ${token_endpoint}` with body: `grant_type=refresh_token`, `client_id`, `refresh_token`, and in DPoP mode the same DPoP proof pattern as 7.3.
4. On `200`: parse new `{access_token, refresh_token, expires_in, token_type}`. MUST assume the previous refresh token is now invalid. Wrap and persist the new refresh token atomically. Broadcast `{type: "tokens-updated"}` to peer compartments (see 10).
5. On `401 use_dpop_nonce`: retry once with nonce. See 7.3.
6. On `400 invalid_grant`, `400 invalid_request` referencing reuse, or any other error suggesting server-side invalidation: wipe the namespace (delete wrap key, DPoP key, refresh record), emit `SecurityEvent("refresh_reuse_detected")`, transition to `unauthenticated`, raise `TOKEN_REFRESH_FAILED`.
7. On network error/timeout: keep existing state, raise `NETWORK_TIMEOUT`/`NETWORK_ERROR`, retry driven by caller.

Concurrent refresh calls within a single compartment MUST be deduplicated via an in-memory promise.

The compartment MAY schedule a proactive refresh via a timer set to `max(0, expiresAt - now - 60s)`, capped at 24 h. On fire, re-evaluate (skip if already refreshed by another actor).

## 10. Multi-instance coordination

Multiple compartments (e.g., two browser tabs) MUST coordinate via the platform's shared-state channel:

- Browser: `BroadcastChannel("stawi-auth:${clientId}:${idpBaseUrl}")`.
- Mobile: platform app has a singleton compartment; multi-process scenarios use the OS lock + store change notifications.

Events:

- `{type: "tokens-updated", expiresAt}` — peers reload refresh token from durable store if their in-memory copy is older.
- `{type: "logout"}` — peers wipe state and transition to `unauthenticated`. Any pending API calls reject with `LOGGED_OUT_ELSEWHERE`.
- `{type: "security-wipe", reason}` — peers wipe state and forward the `SecurityEvent`.

## 11. Authorized API calls

Compartment exposes `fetch(path, {method, headers, body}) -> {status, headers, body}`.

1. Ensure access token (refresh if needed).
2. Attach `Authorization: Bearer <access_token>`.
3. **DPoP mode:** attach `DPoP: <jwt>` with claims `htm`, `htu = apiBaseUrl+path`, `iat`, `jti`, and `ath = base64url(sha256(access_token))`.
4. Issue the request with timeout (default 30 s; 60 s for uploads).
5. On `401` with `WWW-Authenticate: DPoP error="use_dpop_nonce"` and `DPoP-Nonce: …` header: store the nonce, retry once with the nonce claim.
6. On `401 invalid_token` (expired): refresh once, retry once. If still 401, raise `API_UNAUTHORIZED`.
7. Return `{status, headers, body}` to caller. The access token never leaves the compartment.

Uploads use `multipart/form-data` and the same DPoP framing (the `ath` claim covers the access token, not the body).

Every mutation call MUST carry `Idempotency-Key: <uuid>` generated by the caller.

## 12. Logout

1. If `end_session_endpoint` is present in discovery, `POST` (or `GET`, per IdP): `id_token_hint=<last id_token>`, `post_logout_redirect_uri=<config>`, `client_id`. Best-effort; do not block on failure.
2. If `revocation_endpoint` present, revoke the refresh token (`POST token=<rt>&token_type_hint=refresh_token`). Best-effort.
3. Wipe: DPoP key, wrap key, wrapped refresh token, in-memory access token, cached user/roles.
4. Broadcast `{type: "logout"}`.
5. Transition to `unauthenticated`.
6. Fire `onLogout` callback **even on partial network failure** (local state is always cleared).

## 13. Clock handling

DPoP proofs include `iat`. IdPs enforce a window (typically ±60 s). On `invalid_dpop_proof` response:

1. Read `Date` response header, compute `offset = serverDate - localNow`.
2. Persist `clockOffsetMs` for the session.
3. Retry once with `iat = localNow + clockOffsetMs`.

Refresh scheduling uses local clock; no correction needed because rescheduling is conservative (60 s buffer).

## 14. State machine

```
initializing → authenticated          (token load or auth success)
initializing → unauthenticated        (no tokens / expired)
authenticated → refreshing            (token needs refresh)
refreshing → authenticated            (success)
refreshing → unauthenticated          (any failure + wipe)
unauthenticated → initializing        (sign-in started)
authenticated → unauthenticated       (logout)
any → unauthenticated                 (security wipe)
```

`error` is a distinct state only for fatal init errors (e.g., `CRYPTO_UNSUPPORTED`, `DISCOVERY_FAILED`). Recoverable by user retry → transitions back to `initializing`.

## 15. Error taxonomy

Stable, flat codes. See companion spec `2026-04-19-widget-fixes-design.md` §3.3 for the full list. Clients across platforms MUST use these codes verbatim.

## 16. Security events

Fired exactly once per condition:

- `refresh_reuse_detected` — IdP rejected refresh with reuse-detection semantics.
- `binding_invalidated` — IdP rejected refresh with DPoP-binding error not resolvable by nonce retry.
- `storage_corruption` — local crypto/storage failed to decrypt or load state.
- `logged_out_elsewhere` — peer compartment broadcast logout.

Each event includes `at: epoch_ms`. No PII.

## 17. Failure-mode matrix (normative)

| Condition | Client handling | User impact |
|---|---|---|
| Durable store missing any of {wrapKey, dpopKey, wrappedRT} | Wipe partial entries; `state=unauthenticated`. | Sign-in prompt. |
| Decrypt throws | Wipe; `SecurityEvent("storage_corruption")`; `state=unauthenticated`. | Sign-in prompt. |
| Quota exhausted on save | Keep RT in memory for this session only. Warn via `onError`. | Transparent this session; re-auth next session. |
| Crypto unsupported (non-extractable key gen fails) | Refuse to start; raise `CRYPTO_UNSUPPORTED`. | Error state; embedder decides. |
| IdP rotates JWKS | API returns 401; client refreshes once and retries. | Transparent. |
| IdP rotates our refresh token (normal rotation) | Persist new RT atomically under lock. | Transparent. |
| Reuse detection on refresh | Wipe; `SecurityEvent("refresh_reuse_detected")`; `state=unauthenticated`. | Sign-in prompt. |
| Admin revoke | Next refresh → `invalid_grant`; wipe + `state=unauthenticated`. | Sign-in prompt. |
| IdP requires DPoP nonce | Honor `DPoP-Nonce`; retry once. | Transparent. |
| Two tabs refresh simultaneously | Cross-process lock; one performs the refresh; others read result from store. | Transparent. |
| Tab closed mid-refresh | Next session cold-starts with last-persisted RT. If consumed → re-auth. | Worst case: one re-login. |
| Device clock skew | Correct via `Date` header; persist offset. | Transparent after one retry. |
| Offline | API calls fail with `OFFLINE`; no logout; tokens preserved. | Retry-when-online UX. |
| Config conflict (two mounts, different IDs) | Keyed by namespace; no cross-contamination. | Both work. |

## 18. Open questions / future work

- **Biometric gating** (Flutter): optional `requireBiometric: true` on refresh for high-assurance actions. Per-request challenge via platform `LAContext` / `BiometricPrompt`.
- **Attestation** (Android Play Integrity / iOS App Attest): bind the DPoP key to an attested device identity so server can reject unattested clients.
- **Passkeys**: after first sign-in, register a platform passkey and let subsequent sign-ins use WebAuthn `get()` in place of FedCM/popup.
- **Cross-device continuation**: scan-a-QR continuation flow for mobile ↔ desktop.

These are out of scope for the first implementation but the protocol leaves room for each.
