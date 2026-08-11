# FedCM hardening plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development.

**Goal:** Close every CRITICAL / HIGH / M1–M4 / L4 gap from the FedCM audit (in-conversation) — ship FedCM-production-grade integration in `@stawi/auth-runtime` + `@stawi/profile`.

**Branch:** continuing `feat/profile-v1-hardening` (auth-runtime & profile already bumped to 1.0.0; this adds follow-on commits before release).

**Companion:** audit findings in conversation history — recap below.

## Recap of gaps to close

1. **C1** — No `nonce` passed → replay risk
2. **C2** — No `preventSilentAccess()` on logout → auto-reauthn bypass
3. **C3** — `catch { return null }` masks every error class
4. **H1** — Chrome 132+ `mode: "active"` not used on button click
5. **H2** — `login_url` from FedCM config not honored on NetworkError
6. **H3** — `IdentityCredential.disconnect()` not called on logout
7. **H4** — No `AbortSignal` on FedCM call; no cancel on unmount
8. **H5** — `credential.isAutoSelected` ignored
9. **H6** — `iss` check happens inside Worker; should happen main-thread before forwarding
10. **M1** — `fields` param (data minimization)
11. **M2** — `accountHint` / `loginHint` / `domainHint` passthrough
12. **M3** — `params` passthrough
13. **M4** — HEAD probe fragile; fallback to GET
14. **L4** — README section for IdP operators (`.well-known/web-identity` contents, endpoints, `navigator.login.setStatus` requirement)

## Task groups (subagent batches)

### Group 1 — Types + `attemptFedCM` rewrite

**Files:** `shared/auth-runtime/src/shared/dom.d.ts`, `shared/auth-runtime/src/shared/fedcm.ts`, `shared/auth-runtime/src/shared/types.ts`.

**Changes:**

- Expand `dom.d.ts` to cover FedCM 2026: `IdentityProviderConfig` (nonce, fields, domainHint, loginHint, params), `IdentityCredentialRequestOptions` (mode: "passive"|"active"), `IdentityCredential` (isAutoSelected, type), `IdentityCredentialError`, `CredentialRequestOptions.signal`.
- New `FedCMAttemptOptions` type: `{ mediation: CredentialMediationRequirement; mode?: "passive"|"active"; nonce?: string; fields?: string[]; accountHint?: string; loginHint?: string; domainHint?: string; params?: Record<string,string>; signal?: AbortSignal }`.
- New `FedCMOutcome` sum type: `{ kind: "token"; token: string; autoSelected: boolean }` | `{ kind: "no-session"; loginUrl?: string }` | `{ kind: "dismissed" }` | `{ kind: "not-allowed" }` | `{ kind: "aborted" }` | `{ kind: "unsupported" }` | `{ kind: "error"; error: AuthError }`.
- Rewrite `attemptFedCM` to return `FedCMOutcome` — disambiguate by error name (`NetworkError` → `no-session`, `NotAllowedError` → `dismissed`/`not-allowed`, `AbortError` → `aborted`, `IdentityCredentialError` → `error` with `code` + `url`).
- Rewrite `isFedCMConfigAvailable` to GET (not HEAD) `/.well-known/web-identity`, parse JSON, return `{available: true, loginUrl?: string}` or `{available: false}`. If HEAD is attempted first and 405, retry GET.
- Add `AuthConfig.fedcm?: { nonce?: () => string; fields?: string[]; loginHint?: string; domainHint?: string; params?: Record<string,string> }` (embedder-provided overrides).

**Commits:**

- `feat(auth-runtime): extend FedCM ambient types to FedCM 2026 surface`
- `feat(auth-runtime): typed FedCMOutcome; GET-first config probe; nonce/fields/hints passthrough`

### Group 2 — Runtime wiring: nonce, abort, disconnect, preventSilentAccess, main-thread iss check

**Files:** `shared/auth-runtime/src/runtime.ts`, `shared/auth-runtime/src/worker/auth-worker.ts`, `shared/auth-runtime/src/shared/rpc.ts` (add `nonce` to `fedcm-exchange` request if worker path uses RPC).

**Changes:**

- Runtime generates a fresh 128-bit nonce per FedCM attempt (hex-encoded, from `crypto.getRandomValues`), passes to `attemptFedCM`, and hands nonce to the worker's `completeFedcm(idToken, expectedNonce)`.
- Worker's `completeFedcm` verifies the ID token `nonce` claim equals expected nonce. Throw `AuthError("FEDCM_NONCE_MISMATCH", ...)` if not. Add error code to `AuthErrorCode` union.
- Main-thread performs **iss** check on the decoded ID token before handing off to worker. Worker still re-verifies defensively. If main-thread check fails → `AuthError("FEDCM_ISS_MISMATCH")`.
- Runtime owns an `AbortController` per runtime instance; fed into every `attemptFedCM` call; aborted in `destroy()`.
- Runtime's `logout()`:
  1. Calls `core.logout()` (existing).
  2. Calls `navigator.credentials.preventSilentAccess()` best-effort.
  3. Calls `IdentityCredential.disconnect({configURL, clientId, accountHint})` best-effort if the method exists.
- Proactive silent probe on mount uses `mode: "passive"` (implicit for `mediation: "silent"`); explicit sign-in path uses `mode: "active"` when supported (feature-detect on `mediation: "required"` or by browser-agent sniff — prefer capability detection via `CredentialMediationRequirement` "conditional"/`mode: "active"` support: try-catch TypeError).
- Expose `runtime.fedcmAutoSelected()` → `boolean | null` (null until first attempt).

**Commits:**

- `feat(auth-runtime): bind FedCM id_tokens with per-attempt nonce`
- `feat(auth-runtime): logout clears FedCM federation (preventSilentAccess + disconnect)`
- `feat(auth-runtime): abort pending FedCM on destroy; iss check on main thread`

### Group 3 — Error disambiguation + `login_url` fallback

**Files:** `shared/auth-runtime/src/runtime.ts`, `shared/auth-runtime/src/oauth-popup.ts` (add variant), new `shared/auth-runtime/src/login-url.ts`.

**Changes:**

- New `openLoginUrl(cfg, loginUrl): Promise<void>` helper. Opens a popup at `loginUrl`, listens for page to redirect to `redirectUri` (same origin as our `config.redirectUri`), then resolves. Reuses the same `postMessage + polling` mechanism as OAuth popup. Timeout 5 min.
- `runtime.ensureAuthenticated()` flow:
  1. Try FedCM `mediation: "optional"` + `mode: "active"` (if supported).
  2. If outcome is `no-session` with `loginUrl` → open login_url popup, then re-attempt FedCM with `mediation: "required"`.
  3. If still fails → existing OAuth popup fallback.
- `runtime.onFedcmEvent(cb)` callback — fires with FedCMOutcome for embedders who want telemetry. Exposed on `AuthRuntime` interface.
- Map FedCMOutcome errors to `AuthError` for the main-thread proxy.

**Commit:** `feat(auth-runtime): login_url fallback for no-IdP-session FedCM outcome; onFedcmEvent telemetry`

### Group 4 — Tests (mock FedCM in jsdom)

**Files:** `shared/auth-runtime/src/__tests__/setup.ts` (extend), new `shared/auth-runtime/src/__tests__/shared/fedcm.test.ts`, extend `shared/auth-runtime/src/__tests__/runtime.test.ts`.

**Changes:**

- Add FedCM polyfill class into the test setup. Controllable via `globalThis.__TEST_FEDCM = { next(): Outcome }` so each test sets the desired behavior.
- New fedcm.test.ts cases:
  - Successful token return with `nonce` passed through
  - `NetworkError` → `no-session` + loginUrl
  - `NotAllowedError` → `not-allowed`
  - `AbortError` → `aborted`
  - `IdentityCredentialError` with `url` → `error` outcome
  - `mode: "active"` is passed when explicitly requested
  - Config probe GET returns `login_url` correctly
  - HEAD 405 → GET retry
- Runtime tests:
  - nonce mismatch throws `FEDCM_NONCE_MISMATCH`
  - destroy() aborts pending attempt
  - logout() calls `preventSilentAccess` and `disconnect`

**Commit:** `test(auth-runtime): FedCM polyfill and end-to-end coverage`

### Group 5 — README + IdP operator guide

**Files:** `packages/profile/README.md` (section added), new `docs/idp-fedcm-integration.md`.

**Changes:**

- New top-level "Deploying the IdP for FedCM" section in profile README with a pointer to `docs/idp-fedcm-integration.md`.
- `docs/idp-fedcm-integration.md`: what the IdP operator must publish:
  - `/.well-known/web-identity` JSON shape + `login_url` field
  - `/fedcm/accounts`, `/fedcm/client_metadata`, `/fedcm/id_assertion` endpoint contracts
  - ID token requirements (`iss`, `aud`, `nonce`, `sub`, short `exp`)
  - `Set-Login: logged-in` response header and/or `navigator.login.setStatus` on the IdP origin
  - Disconnect endpoint at `/fedcm/disconnect`
  - CORS + `Sec-Fetch-Dest: webidentity` handling

**Commit:** `docs: IdP operator guide for FedCM integration`

## Self-review checklist

Before merging to main:

1. Every audit gap C1–C3, H1–H6, M1–M4, L4 has a landed commit + test.
2. `FedCMOutcome` union is exhaustive (no `as any` in runtime).
3. No call sites of `attemptFedCM` drop errors silently.
4. `AuthErrorCode` union includes `FEDCM_NONCE_MISMATCH`.
5. Tests run in CI without network; FedCM polyfill is deterministic.
6. Bundle-size delta ≤ 5 KB gzipped.
7. No breaking change in public `AuthRuntime` surface — only additive fields / optional config.
