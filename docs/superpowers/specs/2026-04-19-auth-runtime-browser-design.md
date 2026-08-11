# `@stawi/auth-runtime` browser implementation — design

Status: draft
Date: 2026-04-19
Supersedes: current `shared/auth-runtime/src/*` (v0.2.0)
Companion: `2026-04-19-auth-protocol-design.md` (protocol-level contract)

## 1. Goals

- Implement the platform-agnostic auth protocol for the browser.
- Keep the refresh token off the main thread and off persistent plaintext storage.
- Keep access tokens invisible to application code. Callers issue authorized requests through the runtime; they do not hold tokens.
- Survive third-party embedding, Shadow DOM isolation, and strict CSPs.
- Remain a single workspace package consumed by `@stawi/profile` (and future widgets) — no additional services.

## 2. High-level topology

```
                Embedder page (untrusted host origin)
 ┌─────────────────────────────────────────────────────────┐
 │  Main JS (React widget)                                 │
 │    ┌─ AuthRuntime (thin proxy) ──────────────────────┐  │
 │    │   new Worker(new URL("./auth-worker", …),       │  │
 │    │              { type: "module" })                │  │
 │    │   port = MessageChannel.port1                   │  │
 │    │   state: AuthState                              │  │
 │    │   request(msg): Promise<Response>               │  │
 │    └─────────────────┬───────────────────────────────┘  │
 │                      │ postMessage (structured clone)   │
 │  ┌───────────────────▼───────────────────────────────┐  │
 │  │ Dedicated Worker ("auth-worker.js")               │  │
 │  │   ─ in-memory only:                               │  │
 │  │       accessToken, refreshToken,                  │  │
 │  │       dpopKey (CryptoKey), wrapKey (CryptoKey),   │  │
 │  │       clockOffsetMs, dpopNonceByAudience          │  │
 │  │   ─ IndexedDB (this origin, keyed by namespace):  │  │
 │  │       wrapped_refresh_token (AES-GCM ciphertext)  │  │
 │  │       dpop_key_handle (non-extractable)           │  │
 │  │       wrap_key_handle  (non-extractable)          │  │
 │  │       last_id_token    (for end_session_endpoint) │  │
 │  │   ─ Performs all fetch() to IdP + API             │  │
 │  │   ─ Broadcasts to peer Workers                    │  │
 │  └───────────────────────────────────────────────────┘  │
 └─────────────────────────────────────────────────────────┘
```

CryptoKeys created with `extractable: false` are strictly non-exportable; `subtle.exportKey` throws. They are also structured-cloneable into IndexedDB without losing the non-extractable attribute.

## 3. Package layout

```
shared/auth-runtime/
├── src/
│   ├── index.ts                   # public API exports (getAuthRuntime, AuthError, types)
│   ├── runtime.ts                 # AuthRuntime proxy (main thread)
│   ├── worker/
│   │   ├── auth-worker.ts         # worker entrypoint
│   │   ├── state-machine.ts       # pure reducer; testable without Worker
│   │   ├── token-exchange.ts      # OAuth token-endpoint calls
│   │   ├── dpop.ts                # proof construction + nonce handling
│   │   ├── pkce.ts                # verifier/challenge
│   │   ├── crypto.ts              # key gen, wrap/unwrap, non-extractable guards
│   │   ├── store.ts               # IDB layer (namespaced)
│   │   ├── coordination.ts        # BroadcastChannel + Web Locks
│   │   └── fetchWithTimeout.ts    # AbortController wrapper
│   ├── shared/
│   │   ├── types.ts               # AuthConfig, AuthState, WidgetError, SecurityEvent
│   │   ├── errors.ts              # AuthError
│   │   ├── discovery.ts           # usable from both sides (main may prefetch)
│   │   ├── fedcm.ts               # main-thread only; FedCM probe + silent attempt
│   │   └── rpc.ts                 # Request/Event envelope types
│   └── __tests__/
│       ├── state-machine.test.ts
│       ├── dpop.test.ts
│       ├── pkce.test.ts
│       ├── crypto.test.ts
│       ├── store.test.ts
│       ├── coordination.test.ts
│       ├── token-exchange.test.ts
│       ├── fedcm.test.ts
│       ├── discovery.test.ts
│       └── integration.test.ts    # runs Worker in jsdom + mock IdP
└── tsup.config.ts                 # emits two entries: main ESM/CJS + worker IIFE
```

## 4. Public API (unchanged shape, strengthened semantics)

```ts
export interface AuthConfig {
  /* as in protocol §4 */
}

export interface AuthRuntime {
  ensureAuthenticated(): Promise<void>;
  fetch<T = unknown>(path: string, init?: RequestInit): Promise<T>;
  upload<T = unknown>(path: string, file: File): Promise<T>;
  getRoles(): Promise<string[]>;
  logout(): Promise<void>;
  onAuthStateChange(cb: (state: AuthState) => void): () => void;
  onSecurityEvent(cb: (event: SecurityEvent) => void): () => void;
  onError(cb: (error: WidgetError) => void): () => void;
  getState(): AuthState;
  prefetchDiscovery(): Promise<void>;
  destroy(): void;
  readonly version: string;
}

export function createAuthRuntime(config: AuthConfig): AuthRuntime;
export { AuthError } from "./errors";
```

**Change from v0.2.0:** `getAuthRuntime` (singleton) is removed. Each call to `createAuthRuntime` creates an independent runtime. Callers who want deduplication implement it at their level (the `@stawi/profile` widget memoizes on `{clientId, idpBaseUrl, installationId}`).

**Change:** `getAccessToken()` is removed from the public surface. Callers must route API traffic through `fetch` / `upload`. This is the load-bearing security property.

**Change:** `getApiClient()` is removed. The widget's service layer migrates from `runtime.getApiClient().fetch(path, init)` to `runtime.fetch(path, init)`. The thin `ApiClient` class is deleted.

## 5. Worker bootstrap

`auth-worker.ts` is bundled as its own `tsup` entry and emitted as a same-origin script. The runtime constructs it via `new Worker(new URL("./auth-worker.js", import.meta.url), { type: "module" })`. tsup's bundler re-writes the URL at build time.

For the IIFE widget bundle (`packages/profile`), the worker script is inlined as a `Blob` URL constructed from a build-time string constant. This keeps the script-tag embed a single resource while remaining same-origin (`blob:` is same-origin-as-creator).

On init, the main thread sends `{type: "init", config}` and waits for `{type: "ready"}` with a 5 s timeout. On timeout, the runtime falls back to an in-thread implementation (section 12) and emits `WORKER_UNAVAILABLE` via `onError`.

## 6. State machine (worker-owned)

`state-machine.ts` is a pure reducer:

```ts
type Input =
  | { kind: "init_done"; hasTokens: boolean }
  | { kind: "sign_in_start" }
  | { kind: "sign_in_done" }
  | { kind: "sign_in_fail"; error: WidgetError }
  | { kind: "refresh_start" }
  | { kind: "refresh_done" }
  | { kind: "refresh_fail"; error: WidgetError; wipe: boolean }
  | { kind: "logout" }
  | { kind: "security_wipe"; reason: SecurityEvent["type"] };

function reduce(state: AuthState, input: Input): AuthState;
```

Pure reducer → unit-testable without crypto or network. The Worker holds the impure side-effects (fetch, IDB, key gen) and calls `reduce` after each.

## 7. Crypto module

```ts
// crypto.ts
export async function generateDpopKey(): Promise<CryptoKeyPair>;
export async function generateWrapKey(): Promise<CryptoKey>;
export async function wrap(
  wk: CryptoKey,
  plaintext: string,
): Promise<WrappedBlob>;
export async function unwrap(wk: CryptoKey, blob: WrappedBlob): Promise<string>;
export async function exportDpopPublicJwk(k: CryptoKey): Promise<JsonWebKey>;
export async function signDpopProof(
  privKey: CryptoKey,
  publicJwk: JsonWebKey,
  claims: {
    htm: string;
    htu: string;
    iat: number;
    jti: string;
    nonce?: string;
    ath?: string;
  },
): Promise<string>; // compact JWS
export async function sha256Base64Url(input: string): Promise<string>;
export function assertNonExtractable(k: CryptoKey): void; // throws otherwise
```

`generateDpopKey` uses `ECDSA` / `P-256` / `extractable: false` / `usages: ["sign"]`.
`generateWrapKey` uses `AES-GCM` / 256 / `extractable: false` / `usages: ["encrypt","decrypt"]`.

`assertNonExtractable` is called at key-gen to catch any platform that silently ignores the flag; if `k.extractable` is true, we raise `CRYPTO_UNSUPPORTED` before any token ever reaches the key.

## 8. IDB store

Namespaced per `(clientId, idpBaseUrl)`. Schema:

```
DB name: stawi-auth-v1
ObjectStore: sessions
  Key: `${clientId}::${idpBaseUrl}`
  Value: {
    wrapKey: CryptoKey,         // structured-clone keeps non-extractable
    dpopKey: CryptoKeyPair,
    publicJwk: JsonWebKey,
    wrappedRT: { iv: Uint8Array; ciphertext: Uint8Array; tag: Uint8Array },
    lastIdToken?: string,
    updatedAt: number
  }
```

`store.ts` exposes: `load(namespace) → Session | null`, `save(namespace, partial)`, `clear(namespace)`. All operations wrapped in a single IDB transaction. Corruption (shape mismatch) → clear + return null.

## 9. Coordination

```ts
// coordination.ts
export function openChannel(namespace: string): BroadcastChannel;
export async function withRefreshLock<T>(
  namespace: string,
  fn: () => Promise<T>,
): Promise<T>;
```

`withRefreshLock` uses `navigator.locks.request` with a name scoped to the namespace and `mode: "exclusive"`. On browsers without Web Locks (very old Safari), falls back to a promise-serialized in-memory queue — acceptable since the Worker itself is single-threaded and cross-tab coordination is lost on those browsers.

## 10. Fetch with timeout

```ts
// fetchWithTimeout.ts
export async function fetchT(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response>;
```

Wraps in `AbortController`. On abort, throws `AuthError("NETWORK_TIMEOUT")`. On network failure, throws `AuthError("NETWORK_ERROR")`.

Defaults:

- Discovery: 10 s
- Token endpoint: 10 s
- API: 30 s
- Upload: 60 s

Configurable via `AuthConfig.timeouts` (new, all optional).

## 11. DPoP module

```ts
// dpop.ts
export interface DpopContext {
  privKey: CryptoKey;
  publicJwk: JsonWebKey;
  nonceByAudience: Map<string, string>; // htu origin → nonce
}

export async function proof(
  ctx: DpopContext,
  opts: { htm: string; htu: string; accessToken?: string },
): Promise<string>;

export function rememberNonce(ctx: DpopContext, headers: Headers): void;
```

`proof` constructs a JWT with `typ=dpop+jwt`, `alg=ES256`, `jwk` (public), claims `htm`, `htu`, `iat = Date.now()/1000 + offset`, `jti = uuid()`, plus `ath = sha256Base64Url(accessToken)` if provided and `nonce` if present for the audience.

`rememberNonce` extracts `DPoP-Nonce` from any response and caches it per audience origin so subsequent proofs include the nonce.

## 12. Fallback: in-thread mode

If the Worker cannot start, the runtime continues in an in-thread mode:

- Still uses non-extractable CryptoKeys for DPoP + wrap.
- Still encrypts refresh token at rest.
- Access token briefly reaches main thread memory (documented weaker posture).
- Emits `onError({code: "WORKER_UNAVAILABLE"})` once.

Main-thread code path lives in `runtime.ts` and reuses the exact same modules (`dpop.ts`, `crypto.ts`, `store.ts`, `coordination.ts`). Test parity is enforced by running the same integration test in both modes.

## 13. FedCM (main thread only)

FedCM APIs (`navigator.credentials.get`) must be called from a top-level browsing context with a user gesture for `mediation: "required"`; they work from main thread only. The Worker cannot call them.

Flow:

1. On mount, main thread schedules `fedcmProbeAndSilent()` via `requestIdleCallback`.
2. If FedCM returns a credential, main thread forwards the ID token to the Worker via `{type: "fedcm-exchange", idToken}`.
3. Worker decodes, asserts `iss === idpBaseUrl`, performs token-exchange grant with DPoP.
4. If successful, state → authenticated.

The FedCM probe is cached per `idpBaseUrl` in `sessionStorage` (not IDB — probe result is short-lived and doesn't need durability).

## 14. OAuth popup (main thread only)

Main thread owns `window.open`. Worker cannot.

Flow to preserve user gesture:

1. On sign-in click, main thread synchronously `window.open("about:blank", "stawi-auth", "popup=yes,width=500,height=600")`.
2. In parallel, main thread requests Worker: `{type: "prepare-auth"}`. Worker generates PKCE, state, returns `{authUrl, correlationId}`.
3. Main thread sets `popup.location.href = authUrl`. Popup loads IdP.
4. Callback page (served by IdP or a simple static page on same origin as `redirectUri`) does `window.opener.postMessage({type:"stawi-auth", code, state}, opener.origin)` then `window.close()`.
5. Main thread's `message` handler validates `event.origin === redirectOrigin` (parsed from `redirectUri`), forwards `{code, state, correlationId}` to Worker.
6. Worker completes token exchange.
7. Fallback: if postMessage never arrives, main thread polls `popup.location.search` (same-origin only) and `popup.closed`, with a 5-minute hard cap.

This eliminates the Safari/Firefox gesture-loss failure.

## 15. Logout

Main-thread proxy calls `worker.logout()`:

1. Worker `POST end_session_endpoint` best-effort with `id_token_hint`, `client_id`, `post_logout_redirect_uri`. 5 s timeout. Errors swallowed.
2. Worker `POST revocation_endpoint` for the refresh token. 5 s timeout. Errors swallowed.
3. Worker wipes IDB namespace, in-memory state.
4. Worker broadcasts `{type: "logout"}`.
5. Worker transitions state → `unauthenticated`.
6. Proxy calls `onLogout` unconditionally (even if network steps failed).

## 16. Observability

Runtime emits four callback streams (`onAuthStateChange`, `onError`, `onSecurityEvent`, `onMetric` — the last registered by `mount` options, forwarded into runtime).

`onMetric` signature:

```ts
(name: "init" | "sign_in" | "refresh" | "fetch" | "upload",
 durationMs: number,
 tags: { outcome: "success" | "failure"; mode: "dpop" | "bearer"; reason?: string }) => void
```

No PII. No tokens. No user identifiers.

A `version` string is injected by tsup at build time via `define: { "__STAWI_AUTH_VERSION__": JSON.stringify(pkg.version) }`.

## 17. Test plan

- **Unit**: state-machine, crypto (with `@peculiar/webcrypto` polyfill for Node), pkce, dpop proof structure, store layer (fake-indexeddb), discovery.
- **Contract**: `test/integration.test.ts` runs the Worker in jsdom with `msw` mocking an IdP. Covers: first-auth, refresh, refresh-reuse-detection-wipe, DPoP-nonce-retry, clock-skew-retry, 401-refresh-retry, logout, tab-coordination (two BroadcastChannel-connected runtimes in one jsdom).
- **Parity**: same integration suite runs with Worker disabled to validate the in-thread fallback.
- **Fuzz**: malformed discovery, malformed token responses, truncated JWTs.
- **Coverage target**: 90% lines, 100% of the state machine.

## 18. Migration plan (from v0.2.0)

- Drop `getAuthRuntime` singleton. `@stawi/profile` updated in same PR to use `createAuthRuntime`.
- Remove `getAccessToken`, `getApiClient`, and the `ApiClient` class. Callers migrate to `runtime.fetch` / `runtime.upload`. Profile service functions (`getProfile`, `updateProfile`, etc.) take the runtime (or an `AuthFetcher` type alias) instead of an `ApiClient`.
- Config shape unchanged — existing `clientId`, `idpBaseUrl`, `apiBaseUrl`, `installationId` fields all kept.
- `offline_access` added to default scopes; embedders already passing scopes keep control.
- Bumps auth-runtime to `1.0.0` (breaking). Widget bumps to `1.0.0` in the same release.

## 19. Non-goals

- Browser storage encryption at a level stronger than non-extractable-CryptoKey + AES-GCM. We do not attempt DRM-style anti-debugging.
- Anti-emulation / root detection on the browser.
- Session continuation across devices via server state (user explicitly ruled this out).
