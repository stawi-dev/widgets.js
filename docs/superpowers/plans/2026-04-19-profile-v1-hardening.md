# Profile widget v1 — hardening plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `@stawi/auth-runtime@1.0.0` and `@stawi/profile@1.0.0` resolving every audit finding — hardened token handling (Worker + non-extractable keys + adaptive DPoP), configurable theming, full a11y/i18n/observability, and multipart avatar path.

**Architecture:** Two packages, released together. `@stawi/auth-runtime` isolates tokens in a dedicated Web Worker, binds them to non-extractable ECDSA keys via DPoP, encrypts the refresh token at rest with a non-extractable AES-GCM wrap key, and coordinates across tabs with `BroadcastChannel` + `navigator.locks`. `@stawi/profile` consumes the runtime via its async `fetch`/`upload` — it never sees a token.

**Tech Stack:** pnpm workspaces, Turborepo, TypeScript 5 strict, tsup, Vitest, React 18+, Shadow DOM, `idb-keyval` (replaced by raw IDB for namespaces), `fake-indexeddb`, `@peculiar/webcrypto`, `msw`, `axe-core`, `dequal`.

**Specs:**

- `docs/superpowers/specs/2026-04-19-auth-protocol-design.md`
- `docs/superpowers/specs/2026-04-19-auth-runtime-browser-design.md`
- `docs/superpowers/specs/2026-04-19-widget-fixes-design.md`

---

## Conventions used in this plan

- Every task: write failing test → run → implement → run → commit.
- Files use `.ts` (no JSX except React components use `.tsx`).
- All imports use `.js` extensions per the repo's existing convention.
- Vitest config already exists per-package; where new envs are required, changes are spelled out.
- Commit messages follow Conventional Commits (`feat(auth-runtime): …`).
- Commands assume cwd = repo root unless noted.

---

# Part 0 — Workspace setup

## Task 0.1: Dev deps and test-env polyfills

**Files:**

- Modify: `shared/auth-runtime/package.json`
- Modify: `shared/auth-runtime/vitest.config.ts`

- [ ] **Step 1: Add deps**

```bash
pnpm --filter @stawi/auth-runtime add -D @peculiar/webcrypto fake-indexeddb msw @vitest/coverage-v8
```

- [ ] **Step 2: Add a setup file**

Create `shared/auth-runtime/src/__tests__/setup.ts`:

```ts
import "fake-indexeddb/auto";
import { Crypto } from "@peculiar/webcrypto";

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: new Crypto(),
    writable: true,
    configurable: true,
  });
}

if (!(globalThis as any).BroadcastChannel) {
  class BC {
    name: string;
    onmessage: ((e: MessageEvent) => void) | null = null;
    static chans = new Map<string, Set<BC>>();
    constructor(name: string) {
      this.name = name;
      if (!BC.chans.has(name)) BC.chans.set(name, new Set());
      BC.chans.get(name)!.add(this);
    }
    postMessage(data: unknown) {
      for (const c of BC.chans.get(this.name) ?? []) {
        if (c !== this) c.onmessage?.({ data } as MessageEvent);
      }
    }
    close() {
      BC.chans.get(this.name)?.delete(this);
    }
    addEventListener() {}
    removeEventListener() {}
    dispatchEvent() {
      return true;
    }
  }
  (globalThis as any).BroadcastChannel = BC;
}

if (!(navigator as any).locks) {
  const held = new Map<string, Promise<void>>();
  (navigator as any).locks = {
    async request<T>(
      name: string,
      opts: unknown,
      cb: () => Promise<T>,
    ): Promise<T> {
      const prev = held.get(name) ?? Promise.resolve();
      let release!: () => void;
      const next = new Promise<void>((r) => (release = r));
      held.set(
        name,
        prev.then(() => next),
      );
      await prev;
      try {
        return await cb();
      } finally {
        release();
      }
    },
  };
}
```

- [ ] **Step 3: Wire setup file into vitest**

Edit `shared/auth-runtime/vitest.config.ts` — add `setupFiles: ["src/__tests__/setup.ts"]` and `environment: "jsdom"` under `test`.

- [ ] **Step 4: Verify tests still run**

Run: `pnpm --filter @stawi/auth-runtime test`
Expected: existing tests pass, 0 failures. New setup is silently present.

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/package.json pnpm-lock.yaml shared/auth-runtime/vitest.config.ts shared/auth-runtime/src/__tests__/setup.ts
git commit -m "chore(auth-runtime): add crypto/IDB/BC/Locks polyfills for tests"
```

---

# Part A — `@stawi/auth-runtime` v1.0

> Bottom-up dependency order: shared types → discovery → pkce → crypto → dpop → store → coordination → fetchT → state-machine → token-exchange → fedcm → oauth-popup → worker → runtime proxy → fallback → build.

## Task A.1: Shared types and error taxonomy

**Files:**

- Create: `shared/auth-runtime/src/shared/types.ts`
- Create: `shared/auth-runtime/src/shared/errors.ts`
- Create: `shared/auth-runtime/src/shared/rpc.ts`
- Create: `shared/auth-runtime/src/__tests__/shared/errors.test.ts`

- [ ] **Step 1: Write failing test for AuthError**

```ts
// shared/auth-runtime/src/__tests__/shared/errors.test.ts
import { describe, it, expect } from "vitest";
import { AuthError } from "../../shared/errors.js";

describe("AuthError", () => {
  it("preserves code, message, cause, and retryable flag", () => {
    const e = new AuthError("NETWORK_TIMEOUT", "boom", new Error("x"));
    expect(e.code).toBe("NETWORK_TIMEOUT");
    expect(e.message).toBe("boom");
    expect(e.cause).toBeInstanceOf(Error);
    expect(e.name).toBe("AuthError");
    expect(e.retryable).toBe(true);
  });
  it("marks non-retryable codes", () => {
    expect(new AuthError("INVALID_CONFIG", "m").retryable).toBe(false);
    expect(new AuthError("REFRESH_REUSE_DETECTED", "m").retryable).toBe(false);
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `pnpm --filter @stawi/auth-runtime test -- shared/errors`
Expected: module not found.

- [ ] **Step 3: Implement shared types**

```ts
// shared/auth-runtime/src/shared/types.ts
export type AuthState =
  "initializing" | "authenticated" | "unauthenticated" | "refreshing" | "error";

export type AuthStateCallback = (state: AuthState) => void;

export interface AuthConfig {
  clientId: string;
  idpBaseUrl?: string;
  apiBaseUrl?: string;
  redirectUri?: string;
  scopes?: string[];
  fedcmConfigUrl?: string;
  installationId?: string;
  skipFedCM?: boolean;
  timeouts?: {
    discovery?: number;
    token?: number;
    api?: number;
    upload?: number;
  };
}

export interface ResolvedConfig {
  clientId: string;
  idpBaseUrl: string;
  apiBaseUrl: string;
  redirectUri: string;
  scopes: string[];
  fedcmConfigUrl: string;
  installationId?: string;
  skipFedCM: boolean;
  timeouts: { discovery: number; token: number; api: number; upload: number };
}

export interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  tokenType: "Bearer" | "DPoP";
  idToken?: string;
}

export interface UserInfo {
  id: string;
  name: string;
  email: string;
  picture?: string;
}

export type SecurityEvent =
  | { type: "refresh_reuse_detected"; at: number }
  | { type: "storage_corruption"; at: number }
  | { type: "binding_invalidated"; at: number }
  | { type: "logged_out_elsewhere"; at: number };

export type SecurityEventCallback = (event: SecurityEvent) => void;

export interface ApiResponse<T = unknown> {
  status: number;
  headers: Record<string, string>;
  body: T;
}
```

```ts
// shared/auth-runtime/src/shared/errors.ts
export type AuthErrorCode =
  | "INVALID_CONFIG"
  | "DISCOVERY_FAILED"
  | "NETWORK_TIMEOUT"
  | "NETWORK_ERROR"
  | "OFFLINE"
  | "OAUTH_POPUP_BLOCKED"
  | "OAUTH_POPUP_CLOSED"
  | "OAUTH_POPUP_TIMEOUT"
  | "OAUTH_STATE_MISMATCH"
  | "OAUTH_FAILED"
  | "FEDCM_ISS_MISMATCH"
  | "FEDCM_DISMISSED"
  | "TOKEN_EXCHANGE_FAILED"
  | "TOKEN_REFRESH_FAILED"
  | "TOKEN_EXPIRED"
  | "DPOP_NONCE_REQUIRED"
  | "DPOP_INVALID_PROOF"
  | "REFRESH_REUSE_DETECTED"
  | "STORAGE_CORRUPTION"
  | "STORAGE_QUOTA_EXCEEDED"
  | "CRYPTO_UNSUPPORTED"
  | "WORKER_UNAVAILABLE"
  | "LOGGED_OUT_ELSEWHERE"
  | "SECURITY_WIPE"
  | "API_UNAUTHORIZED"
  | "API_FORBIDDEN"
  | "API_NOT_FOUND"
  | "API_VALIDATION"
  | "API_SERVER_ERROR";

const NON_RETRYABLE: Record<string, true> = {
  INVALID_CONFIG: true,
  REFRESH_REUSE_DETECTED: true,
  CRYPTO_UNSUPPORTED: true,
  FEDCM_ISS_MISMATCH: true,
  OAUTH_STATE_MISMATCH: true,
  SECURITY_WIPE: true,
};

export class AuthError extends Error {
  readonly code: AuthErrorCode;
  readonly cause?: unknown;
  readonly retryable: boolean;
  readonly traceId?: string;

  constructor(
    code: AuthErrorCode,
    message: string,
    cause?: unknown,
    traceId?: string,
  ) {
    super(message);
    this.name = "AuthError";
    this.code = code;
    this.cause = cause;
    this.traceId = traceId;
    this.retryable = !NON_RETRYABLE[code];
  }
}
```

```ts
// shared/auth-runtime/src/shared/rpc.ts
import type { AuthState, SecurityEvent, ResolvedConfig } from "./types.js";
import type { AuthErrorCode } from "./errors.js";

export interface SerializedError {
  code: AuthErrorCode;
  message: string;
  retryable: boolean;
  traceId?: string;
}

export type Request =
  | { type: "init"; correlationId: string; config: ResolvedConfig }
  | { type: "state"; correlationId: string }
  | { type: "prepare-auth"; correlationId: string }
  | {
      type: "complete-auth";
      correlationId: string;
      code: string;
      state: string;
      verifier: string;
      expectedState: string;
    }
  | { type: "fedcm-exchange"; correlationId: string; idToken: string }
  | {
      type: "fetch";
      correlationId: string;
      path: string;
      method: string;
      headers?: Record<string, string>;
      body?: ArrayBuffer | string | null;
      timeoutMs?: number;
    }
  | {
      type: "upload";
      correlationId: string;
      path: string;
      fileName: string;
      fileType: string;
      bytes: ArrayBuffer;
      timeoutMs?: number;
    }
  | { type: "getRoles"; correlationId: string }
  | { type: "logout"; correlationId: string }
  | { type: "destroy"; correlationId: string };

export type Event =
  | { type: "ready"; correlationId: string }
  | { type: "state"; state: AuthState }
  | {
      type: "auth-url";
      correlationId: string;
      authUrl: string;
      state: string;
      verifier: string;
    }
  | {
      type: "response";
      correlationId: string;
      status: number;
      headers: Record<string, string>;
      body: ArrayBuffer;
    }
  | { type: "error"; correlationId: string; error: SerializedError }
  | { type: "ok"; correlationId: string }
  | { type: "roles"; correlationId: string; roles: string[] }
  | { type: "securityEvent"; event: SecurityEvent };
```

- [ ] **Step 4: Run — PASS**

Run: `pnpm --filter @stawi/auth-runtime test -- shared/errors`

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/src/shared shared/auth-runtime/src/__tests__/shared
git commit -m "feat(auth-runtime): add shared types, error taxonomy, rpc envelopes"
```

---

## Task A.2: Config resolver

**Files:**

- Create: `shared/auth-runtime/src/shared/config.ts`
- Create: `shared/auth-runtime/src/__tests__/shared/config.test.ts`
- Delete: `shared/auth-runtime/src/config.ts` (old)
- Delete: `shared/auth-runtime/src/__tests__/config.test.ts` (old, after migration)

- [ ] **Step 1: Write failing test**

```ts
// shared/auth-runtime/src/__tests__/shared/config.test.ts
import { describe, it, expect } from "vitest";
import { resolveConfig } from "../../shared/config.js";
import { AuthError } from "../../shared/errors.js";

describe("resolveConfig", () => {
  it("throws INVALID_CONFIG when clientId missing", () => {
    expect(() => resolveConfig({} as any)).toThrow(AuthError);
  });
  it("strips trailing slashes and applies defaults", () => {
    const c = resolveConfig({
      clientId: "abc",
      idpBaseUrl: "https://i/",
      apiBaseUrl: "https://a/",
    });
    expect(c.idpBaseUrl).toBe("https://i");
    expect(c.apiBaseUrl).toBe("https://a");
    expect(c.scopes).toContain("openid");
    expect(c.scopes).toContain("offline_access");
    expect(c.timeouts).toEqual({
      discovery: 10000,
      token: 10000,
      api: 30000,
      upload: 60000,
    });
  });
  it("honors timeout overrides partially", () => {
    const c = resolveConfig({ clientId: "a", timeouts: { api: 5000 } });
    expect(c.timeouts.api).toBe(5000);
    expect(c.timeouts.token).toBe(10000);
  });
  it("namespaces discovery by clientId+idp", () => {
    const c = resolveConfig({ clientId: "a", idpBaseUrl: "https://i" });
    expect(c.redirectUri).toMatch(/\/auth\/callback$/);
  });
});
```

- [ ] **Step 2: Run — FAIL**

Run: `pnpm --filter @stawi/auth-runtime test -- shared/config`

- [ ] **Step 3: Implement**

```ts
// shared/auth-runtime/src/shared/config.ts
import { AuthError } from "./errors.js";
import type { AuthConfig, ResolvedConfig } from "./types.js";

const DEFAULTS = {
  idpBaseUrl: "https://oauth2.stawi.org",
  apiBaseUrl: "https://api.stawi.org",
  scopes: ["openid", "profile", "email", "offline_access"] as string[],
  fedcmConfigUrl: "/.well-known/web-identity",
  timeouts: { discovery: 10_000, token: 10_000, api: 30_000, upload: 60_000 },
} as const;

export function resolveConfig(config: AuthConfig): ResolvedConfig {
  if (!config?.clientId)
    throw new AuthError("INVALID_CONFIG", "clientId is required");

  const strip = (u: string) => u.replace(/\/$/, "");
  const idpBaseUrl = strip(config.idpBaseUrl ?? DEFAULTS.idpBaseUrl);
  const apiBaseUrl = strip(config.apiBaseUrl ?? DEFAULTS.apiBaseUrl);
  const redirectUri =
    config.redirectUri ??
    (typeof window !== "undefined"
      ? `${window.location.origin}/auth/callback`
      : "http://localhost/auth/callback");

  return {
    clientId: config.clientId,
    idpBaseUrl,
    apiBaseUrl,
    redirectUri,
    scopes: config.scopes ?? [...DEFAULTS.scopes],
    fedcmConfigUrl: config.fedcmConfigUrl ?? DEFAULTS.fedcmConfigUrl,
    installationId: config.installationId,
    skipFedCM: config.skipFedCM ?? false,
    timeouts: { ...DEFAULTS.timeouts, ...(config.timeouts ?? {}) },
  };
}

export function namespaceOf(cfg: {
  clientId: string;
  idpBaseUrl: string;
}): string {
  return `${cfg.clientId}::${cfg.idpBaseUrl}`;
}
```

- [ ] **Step 4: Run — PASS**; migrate consumers of old `config.ts` later.

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/src/shared/config.ts shared/auth-runtime/src/__tests__/shared/config.test.ts
git commit -m "feat(auth-runtime): resolveConfig with per-phase timeouts and offline_access default"
```

---

## Task A.3: fetchWithTimeout

**Files:**

- Create: `shared/auth-runtime/src/worker/fetchWithTimeout.ts`
- Create: `shared/auth-runtime/src/__tests__/worker/fetchWithTimeout.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// shared/auth-runtime/src/__tests__/worker/fetchWithTimeout.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchT } from "../../worker/fetchWithTimeout.js";
import { AuthError } from "../../shared/errors.js";

describe("fetchT", () => {
  let origFetch: typeof fetch;
  beforeEach(() => {
    origFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = origFetch;
  });

  it("returns response on fast fetch", async () => {
    globalThis.fetch = vi
      .fn()
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const r = await fetchT("http://x", {}, 1000);
    expect(r.status).toBe(200);
  });

  it("throws NETWORK_TIMEOUT when fetch exceeds timeout", async () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(
        (_, init: RequestInit) =>
          new Promise((_res, rej) =>
            init.signal!.addEventListener("abort", () =>
              rej(new Error("aborted")),
            ),
          ),
      );
    await expect(fetchT("http://x", {}, 10)).rejects.toMatchObject({
      code: "NETWORK_TIMEOUT",
    });
  });

  it("wraps network errors as NETWORK_ERROR", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("net"));
    await expect(fetchT("http://x", {}, 100)).rejects.toMatchObject({
      code: "NETWORK_ERROR",
    });
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// shared/auth-runtime/src/worker/fetchWithTimeout.ts
import { AuthError } from "../shared/errors.js";

export async function fetchT(
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const ctrl = new AbortController();
  const existing = init.signal;
  if (existing) {
    if (existing.aborted) ctrl.abort();
    else existing.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError" || ctrl.signal.aborted) {
      throw new AuthError(
        "NETWORK_TIMEOUT",
        `request exceeded ${timeoutMs}ms`,
        err,
      );
    }
    throw new AuthError("NETWORK_ERROR", "fetch failed", err);
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/src/worker/fetchWithTimeout.ts shared/auth-runtime/src/__tests__/worker/fetchWithTimeout.test.ts
git commit -m "feat(auth-runtime): abortable fetchT with per-call timeout"
```

---

## Task A.4: Discovery (rewritten to use fetchT and shared errors)

**Files:**

- Create: `shared/auth-runtime/src/shared/discovery.ts` (replaces old `src/discovery.ts`)
- Create: `shared/auth-runtime/src/__tests__/shared/discovery.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// shared/auth-runtime/src/__tests__/shared/discovery.test.ts
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  getDiscovery,
  clearDiscoveryCache,
  supportsDpop,
} from "../../shared/discovery.js";

describe("discovery", () => {
  beforeEach(() => {
    clearDiscoveryCache();
    globalThis.fetch = vi.fn();
  });

  it("fetches and caches", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          issuer: "https://i",
          authorization_endpoint: "https://i/a",
          token_endpoint: "https://i/t",
          dpop_signing_alg_values_supported: ["ES256"],
        }),
      ),
    );
    const d = await getDiscovery("https://i", {
      discovery: 1000,
      token: 0,
      api: 0,
      upload: 0,
    });
    expect(d.token_endpoint).toBe("https://i/t");
    expect(supportsDpop(d)).toBe(true);
    await getDiscovery("https://i", {
      discovery: 1000,
      token: 0,
      api: 0,
      upload: 0,
    });
    expect((globalThis.fetch as any).mock.calls.length).toBe(1);
  });

  it("rejects missing required fields", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response(JSON.stringify({ issuer: "x" })),
    );
    await expect(
      getDiscovery("https://i", {
        discovery: 1000,
        token: 0,
        api: 0,
        upload: 0,
      }),
    ).rejects.toMatchObject({ code: "DISCOVERY_FAILED" });
  });

  it("does not cache failures", async () => {
    (globalThis.fetch as any).mockResolvedValueOnce(
      new Response("no", { status: 500 }),
    );
    await expect(
      getDiscovery("https://i2", {
        discovery: 1000,
        token: 0,
        api: 0,
        upload: 0,
      }),
    ).rejects.toMatchObject({ code: "DISCOVERY_FAILED" });
    (globalThis.fetch as any).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          issuer: "https://i2",
          authorization_endpoint: "a",
          token_endpoint: "t",
        }),
      ),
    );
    const d = await getDiscovery("https://i2", {
      discovery: 1000,
      token: 0,
      api: 0,
      upload: 0,
    });
    expect(d.issuer).toBe("https://i2");
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// shared/auth-runtime/src/shared/discovery.ts
import { AuthError } from "./errors.js";
import type { ResolvedConfig } from "./types.js";
import { fetchT } from "../worker/fetchWithTimeout.js";

export interface OidcDiscovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  end_session_endpoint?: string;
  revocation_endpoint?: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
  dpop_signing_alg_values_supported?: string[];
}

const cache = new Map<string, OidcDiscovery>();
const inflight = new Map<string, Promise<OidcDiscovery>>();

export function clearDiscoveryCache() {
  cache.clear();
  inflight.clear();
}

export function _setDiscoveryForTest(idpBaseUrl: string, doc: OidcDiscovery) {
  cache.set(idpBaseUrl.replace(/\/$/, ""), doc);
}

export function supportsDpop(d: OidcDiscovery): boolean {
  return (d.dpop_signing_alg_values_supported ?? []).includes("ES256");
}

export async function getDiscovery(
  idpBaseUrl: string,
  timeouts: ResolvedConfig["timeouts"],
): Promise<OidcDiscovery> {
  const key = idpBaseUrl.replace(/\/$/, "");
  const cached = cache.get(key);
  if (cached) return cached;
  const pending = inflight.get(key);
  if (pending) return pending;
  const p = doFetch(key, timeouts.discovery)
    .then((d) => {
      cache.set(key, d);
      return d;
    })
    .finally(() => {
      inflight.delete(key);
    });
  inflight.set(key, p);
  return p;
}

async function doFetch(idp: string, timeoutMs: number): Promise<OidcDiscovery> {
  const url = `${idp}/.well-known/openid-configuration`;
  let res: Response;
  try {
    res = await fetchT(url, { credentials: "omit" }, timeoutMs);
  } catch (err) {
    throw new AuthError(
      "DISCOVERY_FAILED",
      `discovery fetch failed ${url}`,
      err,
    );
  }
  if (!res.ok)
    throw new AuthError(
      "DISCOVERY_FAILED",
      `discovery HTTP ${res.status} ${url}`,
    );
  let body: unknown;
  try {
    body = await res.json();
  } catch (err) {
    throw new AuthError("DISCOVERY_FAILED", `discovery non-JSON ${url}`, err);
  }
  if (!isValid(body))
    throw new AuthError("DISCOVERY_FAILED", `discovery missing fields ${url}`);
  return body;
}

function isValid(v: unknown): v is OidcDiscovery {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.issuer === "string" &&
    typeof o.authorization_endpoint === "string" &&
    typeof o.token_endpoint === "string"
  );
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/src/shared/discovery.ts shared/auth-runtime/src/__tests__/shared/discovery.test.ts
git commit -m "feat(auth-runtime): discovery module with timeout and DPoP capability probe"
```

---

## Task A.5: PKCE (migrated to /shared/)

**Files:**

- Create: `shared/auth-runtime/src/shared/pkce.ts`
- Create: `shared/auth-runtime/src/__tests__/shared/pkce.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// shared/auth-runtime/src/__tests__/shared/pkce.test.ts
import { describe, it, expect } from "vitest";
import { generatePkcePair, generateChallenge } from "../../shared/pkce.js";

describe("pkce", () => {
  it("verifier is 43–128 url-safe chars, challenge is base64url of sha256", async () => {
    const { verifier, challenge } = await generatePkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    const again = await generateChallenge(verifier);
    expect(again).toBe(challenge);
  });
  it("produces distinct verifiers", async () => {
    const a = await generatePkcePair();
    const b = await generatePkcePair();
    expect(a.verifier).not.toBe(b.verifier);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// shared/auth-runtime/src/shared/pkce.ts
function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

export function generateVerifier(length = 64): string {
  return base64Url(randomBytes(length));
}

export async function generateChallenge(verifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return base64Url(new Uint8Array(hash));
}

export interface PkcePair {
  verifier: string;
  challenge: string;
}

export async function generatePkcePair(): Promise<PkcePair> {
  const verifier = generateVerifier();
  const challenge = await generateChallenge(verifier);
  return { verifier, challenge };
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/src/shared/pkce.ts shared/auth-runtime/src/__tests__/shared/pkce.test.ts
git commit -m "feat(auth-runtime): pkce module in shared/"
```

---

## Task A.6: Crypto module — non-extractable keys, wrap/unwrap

**Files:**

- Create: `shared/auth-runtime/src/worker/crypto.ts`
- Create: `shared/auth-runtime/src/__tests__/worker/crypto.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// shared/auth-runtime/src/__tests__/worker/crypto.test.ts
import { describe, it, expect } from "vitest";
import {
  generateDpopKey,
  generateWrapKey,
  wrap,
  unwrap,
  exportDpopPublicJwk,
  sha256Base64Url,
  assertNonExtractable,
} from "../../worker/crypto.js";
import { AuthError } from "../../shared/errors.js";

describe("crypto", () => {
  it("generates non-extractable DPoP key pair", async () => {
    const kp = await generateDpopKey();
    expect(kp.privateKey.extractable).toBe(false);
    expect(kp.privateKey.algorithm).toMatchObject({
      name: "ECDSA",
      namedCurve: "P-256",
    });
    expect(kp.privateKey.usages).toContain("sign");
    const jwk = await exportDpopPublicJwk(kp);
    expect(jwk.crv).toBe("P-256");
  });

  it("private key cannot be exported", async () => {
    const kp = await generateDpopKey();
    await expect(
      crypto.subtle.exportKey("jwk", kp.privateKey),
    ).rejects.toBeDefined();
  });

  it("wraps and unwraps a secret", async () => {
    const wk = await generateWrapKey();
    expect(wk.extractable).toBe(false);
    const blob = await wrap(wk, "rt.abc");
    const back = await unwrap(wk, blob);
    expect(back).toBe("rt.abc");
  });

  it("sha256Base64Url is stable", async () => {
    const a = await sha256Base64Url("x");
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).toBe(await sha256Base64Url("x"));
  });

  it("assertNonExtractable throws on extractable keys", async () => {
    const k = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"],
    );
    expect(() => assertNonExtractable(k)).toThrow(AuthError);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// shared/auth-runtime/src/worker/crypto.ts
import { AuthError } from "../shared/errors.js";

export interface WrappedBlob {
  iv: Uint8Array;
  ciphertext: Uint8Array;
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Base64Url(input: string): Promise<string> {
  const hash = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return b64url(new Uint8Array(hash));
}

export function assertNonExtractable(k: CryptoKey): void {
  if (k.extractable) {
    throw new AuthError(
      "CRYPTO_UNSUPPORTED",
      "non-extractable keys unavailable on this platform",
    );
  }
}

export async function generateDpopKey(): Promise<CryptoKeyPair> {
  try {
    const kp = (await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    )) as CryptoKeyPair;
    assertNonExtractable(kp.privateKey);
    return kp;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError(
      "CRYPTO_UNSUPPORTED",
      "failed to generate ECDSA key",
      err,
    );
  }
}

export async function generateWrapKey(): Promise<CryptoKey> {
  const k = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  assertNonExtractable(k);
  return k;
}

export async function wrap(
  wk: CryptoKey,
  plaintext: string,
): Promise<WrappedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wk,
    new TextEncoder().encode(plaintext),
  );
  return { iv, ciphertext: new Uint8Array(ct) };
}

export async function unwrap(
  wk: CryptoKey,
  blob: WrappedBlob,
): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: blob.iv },
    wk,
    blob.ciphertext,
  );
  return new TextDecoder().decode(pt);
}

export async function exportDpopPublicJwk(
  kp: CryptoKeyPair,
): Promise<JsonWebKey> {
  // Public key is extractable by spec even when private is not.
  return crypto.subtle.exportKey("jwk", kp.publicKey);
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/src/worker/crypto.ts shared/auth-runtime/src/__tests__/worker/crypto.test.ts
git commit -m "feat(auth-runtime): non-extractable DPoP and AES-GCM wrap primitives"
```

---

## Task A.7: DPoP proof builder + nonce cache

**Files:**

- Create: `shared/auth-runtime/src/worker/dpop.ts`
- Create: `shared/auth-runtime/src/__tests__/worker/dpop.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// shared/auth-runtime/src/__tests__/worker/dpop.test.ts
import { describe, it, expect } from "vitest";
import { generateDpopKey, exportDpopPublicJwk } from "../../worker/crypto.js";
import { proof, rememberNonce, makeDpopContext } from "../../worker/dpop.js";

function decodeJwt(jwt: string) {
  const [h, p] = jwt.split(".");
  const dec = (s: string) =>
    JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(
            s
              .replace(/-/g, "+")
              .replace(/_/g, "/")
              .padEnd(Math.ceil(s.length / 4) * 4, "="),
          ),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
  return { header: dec(h), payload: dec(p) };
}

describe("dpop", () => {
  it("produces a valid DPoP JWT with embedded public JWK", async () => {
    const kp = await generateDpopKey();
    const ctx = await makeDpopContext(kp);
    const jwt = await proof(ctx, { htm: "POST", htu: "https://i/token" });
    const { header, payload } = decodeJwt(jwt);
    expect(header.typ).toBe("dpop+jwt");
    expect(header.alg).toBe("ES256");
    expect(header.jwk.crv).toBe("P-256");
    expect(payload.htm).toBe("POST");
    expect(payload.htu).toBe("https://i/token");
    expect(payload.iat).toBeTypeOf("number");
    expect(payload.jti).toMatch(/^[A-Za-z0-9_-]{16,}$/);
  });

  it("includes ath claim when accessToken provided", async () => {
    const kp = await generateDpopKey();
    const ctx = await makeDpopContext(kp);
    const jwt = await proof(ctx, {
      htm: "GET",
      htu: "https://a/r",
      accessToken: "at",
    });
    const { payload } = decodeJwt(jwt);
    expect(payload.ath).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("remembers and applies nonces by audience origin", async () => {
    const kp = await generateDpopKey();
    const ctx = await makeDpopContext(kp);
    const h = new Headers({ "dpop-nonce": "n1" });
    rememberNonce(ctx, "https://i/token", h);
    const jwt = await proof(ctx, { htm: "POST", htu: "https://i/token" });
    const { payload } = decodeJwt(jwt);
    expect(payload.nonce).toBe("n1");
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// shared/auth-runtime/src/worker/dpop.ts
import { exportDpopPublicJwk, sha256Base64Url } from "./crypto.js";

export interface DpopContext {
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
  clockOffsetMs: number;
  nonceByOrigin: Map<string, string>;
}

export async function makeDpopContext(kp: CryptoKeyPair): Promise<DpopContext> {
  const publicJwk = await exportDpopPublicJwk(kp);
  return {
    privateKey: kp.privateKey,
    publicJwk,
    clockOffsetMs: 0,
    nonceByOrigin: new Map(),
  };
}

function b64url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(v: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(v)));
}

function originOf(url: string): string {
  try {
    return new URL(url).origin;
  } catch {
    return url;
  }
}

export function rememberNonce(
  ctx: DpopContext,
  audienceUrl: string,
  headers: Headers,
): void {
  const n = headers.get("dpop-nonce") ?? headers.get("DPoP-Nonce");
  if (n) ctx.nonceByOrigin.set(originOf(audienceUrl), n);
}

export function rememberClockOffset(ctx: DpopContext, headers: Headers): void {
  const d = headers.get("date");
  if (!d) return;
  const serverMs = Date.parse(d);
  if (!Number.isFinite(serverMs)) return;
  ctx.clockOffsetMs = serverMs - Date.now();
}

interface ProofOpts {
  htm: string;
  htu: string;
  accessToken?: string;
}

export async function proof(
  ctx: DpopContext,
  opts: ProofOpts,
): Promise<string> {
  const header = {
    typ: "dpop+jwt",
    alg: "ES256",
    jwk: {
      kty: ctx.publicJwk.kty,
      crv: ctx.publicJwk.crv,
      x: ctx.publicJwk.x,
      y: ctx.publicJwk.y,
    },
  };
  const payload: Record<string, unknown> = {
    htm: opts.htm.toUpperCase(),
    htu: opts.htu,
    iat: Math.floor((Date.now() + ctx.clockOffsetMs) / 1000),
    jti: b64url(crypto.getRandomValues(new Uint8Array(16))),
  };
  if (opts.accessToken) payload.ath = await sha256Base64Url(opts.accessToken);
  const nonce = ctx.nonceByOrigin.get(originOf(opts.htu));
  if (nonce) payload.nonce = nonce;

  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    ctx.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/src/worker/dpop.ts shared/auth-runtime/src/__tests__/worker/dpop.test.ts
git commit -m "feat(auth-runtime): DPoP proof builder with nonce + clock-offset handling"
```

---

## Task A.8: Namespaced IndexedDB store

**Files:**

- Create: `shared/auth-runtime/src/worker/store.ts`
- Create: `shared/auth-runtime/src/__tests__/worker/store.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// shared/auth-runtime/src/__tests__/worker/store.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { loadSession, saveSession, clearSession } from "../../worker/store.js";
import { generateDpopKey, generateWrapKey, wrap } from "../../worker/crypto.js";

async function seed(ns: string) {
  const wk = await generateWrapKey();
  const kp = await generateDpopKey();
  const wrapped = await wrap(wk, "rt.test");
  await saveSession(ns, {
    wrapKey: wk,
    dpopKey: kp,
    wrappedRT: wrapped,
    lastIdToken: "id",
  });
  return { wk, kp, wrapped };
}

describe("store", () => {
  beforeEach(() => {
    // reset fake-indexeddb between tests
    const idb = (globalThis as any).indexedDB;
    if (idb?._databases) idb._databases = new Map();
  });

  it("round-trips a session keyed by namespace", async () => {
    const seeded = await seed("ns-a");
    const loaded = await loadSession("ns-a");
    expect(loaded?.lastIdToken).toBe("id");
    expect(loaded?.wrappedRT.ciphertext).toEqual(seeded.wrapped.ciphertext);
  });

  it("namespaces are isolated", async () => {
    await seed("ns-a");
    const other = await loadSession("ns-b");
    expect(other).toBeNull();
  });

  it("clear removes", async () => {
    await seed("ns-a");
    await clearSession("ns-a");
    expect(await loadSession("ns-a")).toBeNull();
  });

  it("treats shape-mismatch as null", async () => {
    // write a bad value directly
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("stawi-auth-v1", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("sessions");
      req.onsuccess = () => {
        const tx = req.result.transaction("sessions", "readwrite");
        tx.objectStore("sessions").put({ garbage: true }, "ns-x");
        tx.oncomplete = () => resolve();
      };
    });
    expect(await loadSession("ns-x")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// shared/auth-runtime/src/worker/store.ts
import type { WrappedBlob } from "./crypto.js";

const DB_NAME = "stawi-auth-v1";
const STORE = "sessions";

export interface Session {
  wrapKey: CryptoKey;
  dpopKey: CryptoKeyPair;
  wrappedRT: WrappedBlob;
  lastIdToken?: string;
  updatedAt: number;
}

type PersistedShape = Omit<Session, "updatedAt"> & { updatedAt?: number };

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function isValid(v: unknown): v is PersistedShape {
  if (!v || typeof v !== "object") return false;
  const o = v as any;
  return (
    !!o.wrapKey &&
    !!o.dpopKey &&
    !!o.wrappedRT &&
    o.wrappedRT.iv instanceof Uint8Array &&
    o.wrappedRT.ciphertext instanceof Uint8Array
  );
}

export async function loadSession(namespace: string): Promise<Session | null> {
  const db = await openDb();
  try {
    return await new Promise<Session | null>((resolve) => {
      const req = tx(db, "readonly").get(namespace);
      req.onsuccess = () => {
        const v = req.result;
        if (!isValid(v)) return resolve(null);
        resolve({ ...v, updatedAt: v.updatedAt ?? 0 } as Session);
      };
      req.onerror = () => resolve(null);
    });
  } finally {
    db.close();
  }
}

export async function saveSession(
  namespace: string,
  s: Omit<Session, "updatedAt">,
): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const req = tx(db, "readwrite").put(
        { ...s, updatedAt: Date.now() },
        namespace,
      );
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function clearSession(namespace: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const req = tx(db, "readwrite").delete(namespace);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/src/worker/store.ts shared/auth-runtime/src/__tests__/worker/store.test.ts
git commit -m "feat(auth-runtime): namespaced IDB session store (ciphertext at rest)"
```

---

## Task A.9: Coordination (BroadcastChannel + Web Locks)

**Files:**

- Create: `shared/auth-runtime/src/worker/coordination.ts`
- Create: `shared/auth-runtime/src/__tests__/worker/coordination.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// shared/auth-runtime/src/__tests__/worker/coordination.test.ts
import { describe, it, expect, vi } from "vitest";
import { openChannel, withRefreshLock } from "../../worker/coordination.js";

describe("coordination", () => {
  it("broadcasts to peer channels in same ns", async () => {
    const a = openChannel("ns-x");
    const b = openChannel("ns-x");
    const msgs: unknown[] = [];
    b.onmessage = (e) => msgs.push(e.data);
    a.postMessage({ type: "logout" });
    await new Promise((r) => setTimeout(r, 5));
    expect(msgs).toEqual([{ type: "logout" }]);
    a.close();
    b.close();
  });

  it("serializes via lock", async () => {
    const order: number[] = [];
    await Promise.all([
      withRefreshLock("ns-y", async () => {
        order.push(1);
        await new Promise((r) => setTimeout(r, 10));
        order.push(2);
      }),
      withRefreshLock("ns-y", async () => {
        order.push(3);
      }),
    ]);
    expect(order).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// shared/auth-runtime/src/worker/coordination.ts
export function openChannel(namespace: string): BroadcastChannel {
  return new BroadcastChannel(`stawi-auth:${namespace}`);
}

export async function withRefreshLock<T>(
  namespace: string,
  fn: () => Promise<T>,
): Promise<T> {
  const locks = (navigator as any).locks;
  if (!locks?.request) return fn();
  return locks.request(
    `stawi-auth:refresh:${namespace}`,
    { mode: "exclusive" },
    fn,
  );
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/src/worker/coordination.ts shared/auth-runtime/src/__tests__/worker/coordination.test.ts
git commit -m "feat(auth-runtime): multi-tab coordination via BroadcastChannel + Web Locks"
```

---

## Task A.10: State-machine reducer

**Files:**

- Create: `shared/auth-runtime/src/worker/state-machine.ts`
- Create: `shared/auth-runtime/src/__tests__/worker/state-machine.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// shared/auth-runtime/src/__tests__/worker/state-machine.test.ts
import { describe, it, expect } from "vitest";
import { reduce } from "../../worker/state-machine.js";

describe("state-machine", () => {
  const err = {
    code: "TOKEN_REFRESH_FAILED" as const,
    message: "x",
    retryable: true,
  };

  it("init with tokens → authenticated; without → unauthenticated", () => {
    expect(reduce("initializing", { kind: "init_done", hasTokens: true })).toBe(
      "authenticated",
    );
    expect(
      reduce("initializing", { kind: "init_done", hasTokens: false }),
    ).toBe("unauthenticated");
  });

  it("sign-in transitions", () => {
    expect(reduce("unauthenticated", { kind: "sign_in_start" })).toBe(
      "initializing",
    );
    expect(reduce("initializing", { kind: "sign_in_done" })).toBe(
      "authenticated",
    );
    expect(reduce("initializing", { kind: "sign_in_fail", error: err })).toBe(
      "unauthenticated",
    );
  });

  it("refresh transitions", () => {
    expect(reduce("authenticated", { kind: "refresh_start" })).toBe(
      "refreshing",
    );
    expect(reduce("refreshing", { kind: "refresh_done" })).toBe(
      "authenticated",
    );
    expect(
      reduce("refreshing", { kind: "refresh_fail", error: err, wipe: true }),
    ).toBe("unauthenticated");
  });

  it("logout from any state → unauthenticated", () => {
    expect(reduce("authenticated", { kind: "logout" })).toBe("unauthenticated");
    expect(reduce("refreshing", { kind: "logout" })).toBe("unauthenticated");
  });

  it("security_wipe → unauthenticated", () => {
    expect(
      reduce("refreshing", {
        kind: "security_wipe",
        reason: "refresh_reuse_detected",
      }),
    ).toBe("unauthenticated");
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// shared/auth-runtime/src/worker/state-machine.ts
import type { AuthState, SecurityEvent } from "../shared/types.js";
import type { AuthErrorCode } from "../shared/errors.js";

export interface ReducerError {
  code: AuthErrorCode;
  message: string;
  retryable: boolean;
}

export type Input =
  | { kind: "init_done"; hasTokens: boolean }
  | { kind: "sign_in_start" }
  | { kind: "sign_in_done" }
  | { kind: "sign_in_fail"; error: ReducerError }
  | { kind: "refresh_start" }
  | { kind: "refresh_done" }
  | { kind: "refresh_fail"; error: ReducerError; wipe: boolean }
  | { kind: "logout" }
  | { kind: "security_wipe"; reason: SecurityEvent["type"] };

export function reduce(state: AuthState, input: Input): AuthState {
  switch (input.kind) {
    case "init_done":
      return input.hasTokens ? "authenticated" : "unauthenticated";
    case "sign_in_start":
      return "initializing";
    case "sign_in_done":
      return "authenticated";
    case "sign_in_fail":
      return "unauthenticated";
    case "refresh_start":
      return "refreshing";
    case "refresh_done":
      return "authenticated";
    case "refresh_fail":
      return "unauthenticated";
    case "logout":
      return "unauthenticated";
    case "security_wipe":
      return "unauthenticated";
    default:
      return state;
  }
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/src/worker/state-machine.ts shared/auth-runtime/src/__tests__/worker/state-machine.test.ts
git commit -m "feat(auth-runtime): pure state-machine reducer"
```

---

## Task A.11: JWT helpers (padded base64url decode + role extraction)

**Files:**

- Modify: `shared/auth-runtime/src/shared/jwt.ts` (moved from `src/jwt.ts`)
- Create: `shared/auth-runtime/src/__tests__/shared/jwt.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// shared/auth-runtime/src/__tests__/shared/jwt.test.ts
import { describe, it, expect } from "vitest";
import { decodeJwtPayload, extractRolesFromToken } from "../../shared/jwt.js";

function encodePayload(payload: object): string {
  const json = JSON.stringify(payload);
  const b64 = btoa(json)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  // header and signature don't need validity
  return `hh.${b64}.ss`;
}

describe("jwt", () => {
  it("decodes payloads of varied length (padding handled)", () => {
    for (let n = 1; n < 20; n++) {
      const token = encodePayload({ sub: "x".repeat(n) });
      const p = decodeJwtPayload(token);
      expect(p.sub).toBe("x".repeat(n));
    }
  });
  it("extracts roles from direct claim", () => {
    expect(
      extractRolesFromToken(encodePayload({ roles: ["admin", 1, "user"] })),
    ).toEqual(["admin", "user"]);
  });
  it("extracts from realm_access.roles", () => {
    expect(
      extractRolesFromToken(encodePayload({ realm_access: { roles: ["x"] } })),
    ).toEqual(["x"]);
  });
  it("returns [] on invalid JWTs", () => {
    expect(extractRolesFromToken("bad")).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement** (keep file at `src/shared/jwt.ts`)

```ts
// shared/auth-runtime/src/shared/jwt.ts
export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT: expected 3 parts");
  let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad === 2) b64 += "==";
  else if (pad === 3) b64 += "=";
  else if (pad === 1) throw new Error("Invalid JWT payload length");
  return JSON.parse(atob(b64)) as Record<string, unknown>;
}

export function extractRolesFromToken(token: string): string[] {
  try {
    const p = decodeJwtPayload(token);
    if (Array.isArray(p.roles))
      return (p.roles as unknown[]).filter(
        (r): r is string => typeof r === "string",
      );
    const r = (p.realm_access as { roles?: unknown })?.roles;
    if (Array.isArray(r))
      return (r as unknown[]).filter((x): x is string => typeof x === "string");
    return [];
  } catch {
    return [];
  }
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/src/shared/jwt.ts shared/auth-runtime/src/__tests__/shared/jwt.test.ts
git commit -m "fix(auth-runtime): pad JWT base64url before decode"
```

---

## Task A.12: Token exchange + refresh (with DPoP-nonce retry + clock-skew retry + reuse detection)

**Files:**

- Create: `shared/auth-runtime/src/worker/token-exchange.ts`
- Create: `shared/auth-runtime/src/__tests__/worker/token-exchange.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// shared/auth-runtime/src/__tests__/worker/token-exchange.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  exchangeCode,
  refreshTokens,
  RefreshOutcome,
} from "../../worker/token-exchange.js";
import {
  _setDiscoveryForTest,
  clearDiscoveryCache,
} from "../../shared/discovery.js";
import { generateDpopKey } from "../../worker/crypto.js";
import { makeDpopContext } from "../../worker/dpop.js";

const cfg = {
  clientId: "c",
  idpBaseUrl: "https://i",
  apiBaseUrl: "https://a",
  redirectUri: "https://r/cb",
  scopes: ["openid", "offline_access"],
  fedcmConfigUrl: "/.well-known/web-identity",
  skipFedCM: false,
  timeouts: { discovery: 1000, token: 1000, api: 1000, upload: 1000 },
};

beforeEach(() => {
  clearDiscoveryCache();
  _setDiscoveryForTest("https://i", {
    issuer: "https://i",
    authorization_endpoint: "https://i/auth",
    token_endpoint: "https://i/token",
    dpop_signing_alg_values_supported: ["ES256"],
  });
  globalThis.fetch = vi.fn();
});

describe("exchangeCode", () => {
  it("POSTs to token endpoint with DPoP header when supported", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "at",
          refresh_token: "rt",
          expires_in: 300,
          token_type: "DPoP",
        }),
        { status: 200 },
      ),
    );
    const ctx = await makeDpopContext(await generateDpopKey());
    const r = await exchangeCode(cfg as any, ctx, { code: "c", verifier: "v" });
    expect(r.accessToken).toBe("at");
    expect(r.refreshToken).toBe("rt");
    const call = (globalThis.fetch as any).mock.calls[0];
    expect(call[1].headers.DPoP).toBeTypeOf("string");
  });

  it("retries once on DPoP-Nonce challenge", async () => {
    (globalThis.fetch as any)
      .mockResolvedValueOnce(
        new Response(null, { status: 401, headers: { "dpop-nonce": "nn" } }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "at",
            refresh_token: "rt",
            expires_in: 300,
            token_type: "DPoP",
          }),
          { status: 200 },
        ),
      );
    const ctx = await makeDpopContext(await generateDpopKey());
    const r = await exchangeCode(cfg as any, ctx, { code: "c", verifier: "v" });
    expect(r.accessToken).toBe("at");
    expect((globalThis.fetch as any).mock.calls.length).toBe(2);
  });
});

describe("refreshTokens", () => {
  it("returns ROTATED on 200", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          access_token: "at2",
          refresh_token: "rt2",
          expires_in: 300,
          token_type: "DPoP",
        }),
        { status: 200 },
      ),
    );
    const ctx = await makeDpopContext(await generateDpopKey());
    const r = await refreshTokens(cfg as any, ctx, "rt1");
    expect(r.outcome).toBe("rotated");
    if (r.outcome === "rotated") expect(r.tokens.refreshToken).toBe("rt2");
  });

  it("returns REUSE_DETECTED on invalid_grant", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "refresh token reuse detected",
        }),
        { status: 400 },
      ),
    );
    const ctx = await makeDpopContext(await generateDpopKey());
    const r = await refreshTokens(cfg as any, ctx, "rt1");
    expect(r.outcome).toBe("reuse_detected");
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// shared/auth-runtime/src/worker/token-exchange.ts
import type { ResolvedConfig, TokenSet } from "../shared/types.js";
import { AuthError } from "../shared/errors.js";
import { getDiscovery, supportsDpop } from "../shared/discovery.js";
import type { DpopContext } from "./dpop.js";
import { proof, rememberNonce, rememberClockOffset } from "./dpop.js";
import { fetchT } from "./fetchWithTimeout.js";

export type RefreshOutcome =
  | { outcome: "rotated"; tokens: TokenSet }
  | { outcome: "reuse_detected" }
  | { outcome: "network_error"; error: AuthError };

function parseTokenBody(data: any): TokenSet {
  const accessToken = data.access_token as string;
  const refreshToken = data.refresh_token as string;
  const expiresIn = (data.expires_in as number) ?? 300;
  const tokenType =
    ((data.token_type as string) ?? "Bearer").toLowerCase() === "dpop"
      ? "DPoP"
      : "Bearer";
  if (!accessToken || !refreshToken) {
    throw new AuthError(
      "TOKEN_EXCHANGE_FAILED",
      "missing access_token or refresh_token",
    );
  }
  return {
    accessToken,
    refreshToken,
    tokenType,
    expiresAt: Date.now() + expiresIn * 1000,
    idToken: typeof data.id_token === "string" ? data.id_token : undefined,
  };
}

async function postForm(
  cfg: ResolvedConfig,
  ctx: DpopContext,
  useDpop: boolean,
  form: URLSearchParams,
): Promise<Response> {
  const { token_endpoint } = await getDiscovery(cfg.idpBaseUrl, cfg.timeouts);
  const headers: Record<string, string> = {
    "Content-Type": "application/x-www-form-urlencoded",
  };
  if (useDpop)
    headers.DPoP = await proof(ctx, { htm: "POST", htu: token_endpoint });
  let res = await fetchT(
    token_endpoint,
    { method: "POST", headers, body: form.toString() },
    cfg.timeouts.token,
  );
  // DPoP nonce retry
  if (useDpop && res.status === 401 && res.headers.get("dpop-nonce")) {
    rememberNonce(ctx, token_endpoint, res.headers);
    const headers2 = {
      ...headers,
      DPoP: await proof(ctx, { htm: "POST", htu: token_endpoint }),
    };
    res = await fetchT(
      token_endpoint,
      { method: "POST", headers: headers2, body: form.toString() },
      cfg.timeouts.token,
    );
  }
  // Clock skew retry
  if (useDpop && res.status === 400) {
    const txt = await res.clone().text();
    if (/invalid_dpop_proof/i.test(txt)) {
      rememberClockOffset(ctx, res.headers);
      const headers2 = {
        ...headers,
        DPoP: await proof(ctx, { htm: "POST", htu: token_endpoint }),
      };
      res = await fetchT(
        token_endpoint,
        { method: "POST", headers: headers2, body: form.toString() },
        cfg.timeouts.token,
      );
    }
  }
  rememberNonce(ctx, token_endpoint, res.headers);
  return res;
}

export async function exchangeCode(
  cfg: ResolvedConfig,
  ctx: DpopContext,
  args: { code: string; verifier: string },
): Promise<TokenSet> {
  const d = await getDiscovery(cfg.idpBaseUrl, cfg.timeouts);
  const useDpop = supportsDpop(d);
  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    code: args.code,
    redirect_uri: cfg.redirectUri,
    code_verifier: args.verifier,
  });
  const res = await postForm(cfg, ctx, useDpop, form);
  if (!res.ok)
    throw new AuthError(
      "TOKEN_EXCHANGE_FAILED",
      `token exchange failed ${res.status}`,
    );
  return parseTokenBody(await res.json());
}

export async function exchangeFedcmIdToken(
  cfg: ResolvedConfig,
  ctx: DpopContext,
  idToken: string,
): Promise<TokenSet> {
  const d = await getDiscovery(cfg.idpBaseUrl, cfg.timeouts);
  const useDpop = supportsDpop(d);
  const form = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:token-exchange",
    client_id: cfg.clientId,
    subject_token: idToken,
    subject_token_type: "urn:ietf:params:oauth:token-type:id_token",
  });
  const res = await postForm(cfg, ctx, useDpop, form);
  if (!res.ok)
    throw new AuthError(
      "TOKEN_EXCHANGE_FAILED",
      `FedCM token exchange failed ${res.status}`,
    );
  return parseTokenBody(await res.json());
}

export async function refreshTokens(
  cfg: ResolvedConfig,
  ctx: DpopContext,
  refreshToken: string,
): Promise<RefreshOutcome> {
  try {
    const d = await getDiscovery(cfg.idpBaseUrl, cfg.timeouts);
    const useDpop = supportsDpop(d);
    const form = new URLSearchParams({
      grant_type: "refresh_token",
      client_id: cfg.clientId,
      refresh_token: refreshToken,
    });
    const res = await postForm(cfg, ctx, useDpop, form);
    if (res.ok)
      return { outcome: "rotated", tokens: parseTokenBody(await res.json()) };
    const body = await res.text().catch(() => "");
    if (res.status === 400 && /invalid_grant|reuse/i.test(body)) {
      return { outcome: "reuse_detected" };
    }
    return {
      outcome: "network_error",
      error: new AuthError(
        "TOKEN_REFRESH_FAILED",
        `refresh failed ${res.status} ${body}`,
      ),
    };
  } catch (err) {
    const e =
      err instanceof AuthError
        ? err
        : new AuthError("TOKEN_REFRESH_FAILED", "refresh failed", err);
    return { outcome: "network_error", error: e };
  }
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/src/worker/token-exchange.ts shared/auth-runtime/src/__tests__/worker/token-exchange.test.ts
git commit -m "feat(auth-runtime): token exchange and refresh with DPoP/nonce/clock-skew/reuse-detection"
```

---

## Task A.13: API proxy (fetch/upload via DPoP + 401-refresh retry)

**Files:**

- Create: `shared/auth-runtime/src/worker/api-proxy.ts`
- Create: `shared/auth-runtime/src/__tests__/worker/api-proxy.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// shared/auth-runtime/src/__tests__/worker/api-proxy.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { proxyFetch } from "../../worker/api-proxy.js";
import { makeDpopContext } from "../../worker/dpop.js";
import { generateDpopKey } from "../../worker/crypto.js";

const cfg = {
  clientId: "c",
  idpBaseUrl: "https://i",
  apiBaseUrl: "https://a",
  redirectUri: "https://r/cb",
  scopes: [],
  fedcmConfigUrl: "/x",
  skipFedCM: true,
  timeouts: { discovery: 1000, token: 1000, api: 1000, upload: 1000 },
} as any;

beforeEach(() => {
  globalThis.fetch = vi.fn();
});

describe("proxyFetch", () => {
  it("attaches Authorization and DPoP when token type is DPoP", async () => {
    (globalThis.fetch as any).mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const ctx = await makeDpopContext(await generateDpopKey());
    const onRefreshCalled = vi.fn();
    await proxyFetch(
      cfg,
      ctx,
      {
        accessToken: "at",
        tokenType: "DPoP",
        ensureFresh: async () => ({ accessToken: "at", tokenType: "DPoP" }),
        onRefresh: onRefreshCalled,
      },
      { path: "/v1/me", method: "GET" },
    );
    const call = (globalThis.fetch as any).mock.calls[0];
    expect(call[0]).toBe("https://a/v1/me");
    expect(call[1].headers.Authorization).toBe("DPoP at");
    expect(call[1].headers.DPoP).toBeTypeOf("string");
  });

  it("refreshes once and retries on 401", async () => {
    const ensureFresh = vi
      .fn()
      .mockResolvedValueOnce({ accessToken: "at1", tokenType: "Bearer" })
      .mockResolvedValueOnce({ accessToken: "at2", tokenType: "Bearer" });
    (globalThis.fetch as any)
      .mockResolvedValueOnce(new Response("no", { status: 401 }))
      .mockResolvedValueOnce(new Response("{}", { status: 200 }));
    const ctx = await makeDpopContext(await generateDpopKey());
    const res = await proxyFetch(
      cfg,
      ctx,
      {
        accessToken: "at1",
        tokenType: "Bearer",
        ensureFresh,
        onRefresh: () => {},
      },
      { path: "/x", method: "GET" },
    );
    expect(res.status).toBe(200);
    expect(ensureFresh).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// shared/auth-runtime/src/worker/api-proxy.ts
import type { ResolvedConfig, ApiResponse } from "../shared/types.js";
import { AuthError } from "../shared/errors.js";
import type { DpopContext } from "./dpop.js";
import { proof, rememberNonce } from "./dpop.js";
import { fetchT } from "./fetchWithTimeout.js";

export interface TokenProvider {
  accessToken: string;
  tokenType: "Bearer" | "DPoP";
  ensureFresh(
    force?: boolean,
  ): Promise<{ accessToken: string; tokenType: "Bearer" | "DPoP" }>;
  onRefresh(): void;
}

export interface FetchArgs {
  path: string;
  method: string;
  headers?: Record<string, string>;
  body?: string | ArrayBuffer | FormData | null;
  timeoutMs?: number;
}

export async function proxyFetch(
  cfg: ResolvedConfig,
  ctx: DpopContext,
  tp: TokenProvider,
  args: FetchArgs,
): Promise<ApiResponse<ArrayBuffer>> {
  const url = `${cfg.apiBaseUrl}${args.path}`;
  const timeout = args.timeoutMs ?? cfg.timeouts.api;

  async function doCall(
    accessToken: string,
    tokenType: "Bearer" | "DPoP",
  ): Promise<Response> {
    const headers: Record<string, string> = { ...(args.headers ?? {}) };
    headers.Authorization = `${tokenType} ${accessToken}`;
    headers.Accept ??= "application/json";
    if (tokenType === "DPoP") {
      headers.DPoP = await proof(ctx, {
        htm: args.method,
        htu: url,
        accessToken,
      });
    }
    if (typeof args.body === "string" && !headers["Content-Type"]) {
      headers["Content-Type"] = "application/json";
    }
    return fetchT(
      url,
      { method: args.method, headers, body: args.body ?? undefined },
      timeout,
    );
  }

  let res = await doCall(tp.accessToken, tp.tokenType);
  rememberNonce(ctx, url, res.headers);

  if (res.status === 401) {
    // try DPoP-nonce first
    if (res.headers.get("dpop-nonce")) {
      res = await doCall(tp.accessToken, tp.tokenType);
      rememberNonce(ctx, url, res.headers);
    }
  }
  if (res.status === 401) {
    // force refresh + retry once
    const fresh = await tp.ensureFresh(true);
    tp.onRefresh();
    res = await doCall(fresh.accessToken, fresh.tokenType);
    rememberNonce(ctx, url, res.headers);
  }

  if (!res.ok && res.status !== 204) {
    const text = await res.text().catch(() => "");
    const code =
      res.status === 401
        ? "API_UNAUTHORIZED"
        : res.status === 403
          ? "API_FORBIDDEN"
          : res.status === 404
            ? "API_NOT_FOUND"
            : res.status >= 500
              ? "API_SERVER_ERROR"
              : "API_VALIDATION";
    throw new AuthError(
      code,
      `API ${res.status}: ${text.slice(0, 200)}`,
      undefined,
      res.headers.get("x-trace-id") ?? undefined,
    );
  }

  const buf = res.status === 204 ? new ArrayBuffer(0) : await res.arrayBuffer();
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    headers[k] = v;
  });
  return { status: res.status, headers, body: buf };
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/src/worker/api-proxy.ts shared/auth-runtime/src/__tests__/worker/api-proxy.test.ts
git commit -m "feat(auth-runtime): API proxy with DPoP, nonce retry, and 401-refresh retry"
```

---

## Task A.14: Worker entry — assembly

**Files:**

- Create: `shared/auth-runtime/src/worker/auth-worker.ts`
- Create: `shared/auth-runtime/src/__tests__/worker/auth-worker.test.ts`

- [ ] **Step 1: Write failing test** (exercises the handler function directly, not a spawned Worker)

```ts
// shared/auth-runtime/src/__tests__/worker/auth-worker.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createWorkerCore } from "../../worker/auth-worker.js";
import {
  _setDiscoveryForTest,
  clearDiscoveryCache,
} from "../../shared/discovery.js";

const cfg = {
  clientId: "c",
  idpBaseUrl: "https://i",
  apiBaseUrl: "https://a",
  redirectUri: "https://r/cb",
  scopes: ["openid", "offline_access"],
  fedcmConfigUrl: "/.well-known/web-identity",
  skipFedCM: true,
  timeouts: { discovery: 1000, token: 1000, api: 1000, upload: 1000 },
};

beforeEach(() => {
  clearDiscoveryCache();
  _setDiscoveryForTest("https://i", {
    issuer: "https://i",
    authorization_endpoint: "https://i/auth",
    token_endpoint: "https://i/token",
    dpop_signing_alg_values_supported: ["ES256"],
  });
  globalThis.fetch = vi.fn();
});

describe("worker core", () => {
  it("initializes to unauthenticated with no stored session", async () => {
    const core = await createWorkerCore(cfg as any);
    expect(core.state).toBe("unauthenticated");
  });

  it("prepare-auth returns a valid authorization URL and records verifier", async () => {
    const core = await createWorkerCore(cfg as any);
    const { authUrl, state, verifier } = await core.prepareAuth();
    const u = new URL(authUrl);
    expect(u.origin).toBe("https://i");
    expect(u.pathname).toBe("/auth");
    expect(u.searchParams.get("client_id")).toBe("c");
    expect(u.searchParams.get("code_challenge_method")).toBe("S256");
    expect(state).toBeTypeOf("string");
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement** (partial — just enough to pass the test; remaining handlers covered by later integration test task)

```ts
// shared/auth-runtime/src/worker/auth-worker.ts
import type {
  AuthState,
  ResolvedConfig,
  TokenSet,
  SecurityEvent,
} from "../shared/types.js";
import { AuthError } from "../shared/errors.js";
import { namespaceOf } from "../shared/config.js";
import { getDiscovery, supportsDpop } from "../shared/discovery.js";
import { generatePkcePair } from "../shared/pkce.js";
import {
  generateDpopKey,
  generateWrapKey,
  wrap,
  unwrap,
  type WrappedBlob,
} from "./crypto.js";
import { makeDpopContext, type DpopContext } from "./dpop.js";
import {
  exchangeCode,
  exchangeFedcmIdToken,
  refreshTokens,
} from "./token-exchange.js";
import {
  loadSession,
  saveSession,
  clearSession,
  type Session,
} from "./store.js";
import { openChannel, withRefreshLock } from "./coordination.js";
import { proxyFetch } from "./api-proxy.js";
import { reduce } from "./state-machine.js";
import { decodeJwtPayload } from "../shared/jwt.js";

const REFRESH_BUFFER_MS = 60_000;
const MAX_TIMER_MS = 24 * 60 * 60 * 1000;

export interface WorkerCore {
  state: AuthState;
  namespace: string;
  prepareAuth(): Promise<{ authUrl: string; state: string; verifier: string }>;
  completeAuth(args: {
    code: string;
    verifier: string;
    state: string;
    expectedState: string;
  }): Promise<void>;
  completeFedcm(idToken: string): Promise<void>;
  getAccessToken(
    forceRefresh?: boolean,
  ): Promise<{ accessToken: string; tokenType: "Bearer" | "DPoP" }>;
  fetch(
    path: string,
    init: {
      method: string;
      headers?: Record<string, string>;
      body?: ArrayBuffer | string | null;
      timeoutMs?: number;
    },
  ): Promise<{
    status: number;
    headers: Record<string, string>;
    body: ArrayBuffer;
  }>;
  upload(
    path: string,
    file: { name: string; type: string; bytes: ArrayBuffer },
    timeoutMs?: number,
  ): Promise<{
    status: number;
    headers: Record<string, string>;
    body: ArrayBuffer;
  }>;
  getRoles(): Promise<string[]>;
  logout(): Promise<void>;
  destroy(): void;
  onState(cb: (s: AuthState) => void): () => void;
  onSecurity(cb: (e: SecurityEvent) => void): () => void;
}

export async function createWorkerCore(
  cfg: ResolvedConfig,
): Promise<WorkerCore> {
  const namespace = namespaceOf(cfg);
  const channel = openChannel(namespace);
  let state: AuthState = "initializing";
  let tokens: TokenSet | null = null;
  let wrapKey: CryptoKey | null = null;
  let dpopCtx: DpopContext | null = null;
  let session: Session | null = null;
  let refreshTimer: ReturnType<typeof setTimeout> | null = null;
  let refreshInFlight: Promise<{
    accessToken: string;
    tokenType: "Bearer" | "DPoP";
  }> | null = null;
  const stateListeners = new Set<(s: AuthState) => void>();
  const secListeners = new Set<(e: SecurityEvent) => void>();

  function setState(next: AuthState) {
    if (state === next) return;
    state = next;
    for (const cb of stateListeners) {
      try {
        cb(state);
      } catch {}
    }
  }

  function emitSecurity(event: SecurityEvent) {
    for (const cb of secListeners) {
      try {
        cb(event);
      } catch {}
    }
    channel.postMessage({ type: "security-wipe", event });
  }

  function cancelTimer() {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
      refreshTimer = null;
    }
  }

  function scheduleRefresh() {
    cancelTimer();
    if (!tokens) return;
    const delay = Math.max(
      0,
      Math.min(MAX_TIMER_MS, tokens.expiresAt - Date.now() - REFRESH_BUFFER_MS),
    );
    refreshTimer = setTimeout(() => {
      void ensureFreshAccess(true).catch(() => {});
    }, delay);
  }

  async function persistTokens(newTokens: TokenSet): Promise<void> {
    if (!wrapKey || !dpopCtx || !session)
      throw new AuthError("INVALID_CONFIG", "persistTokens without init");
    const wrapped = await wrap(wrapKey, newTokens.refreshToken);
    session = {
      ...session,
      wrappedRT: wrapped,
      lastIdToken: newTokens.idToken ?? session.lastIdToken,
    };
    await saveSession(namespace, session);
    tokens = newTokens;
    scheduleRefresh();
    channel.postMessage({
      type: "tokens-updated",
      expiresAt: newTokens.expiresAt,
    });
  }

  async function wipe(reason: SecurityEvent["type"]): Promise<void> {
    cancelTimer();
    tokens = null;
    wrapKey = null;
    dpopCtx = null;
    session = null;
    await clearSession(namespace).catch(() => {});
    emitSecurity({ type: reason, at: Date.now() });
    setState(reduce(state, { kind: "security_wipe", reason }));
  }

  // ----- init -----
  try {
    const loaded = await loadSession(namespace);
    if (loaded) {
      session = loaded;
      wrapKey = loaded.wrapKey;
      dpopCtx = await makeDpopContext(loaded.dpopKey);
      const rt = await unwrap(wrapKey, loaded.wrappedRT).catch(() => null);
      if (!rt) {
        await wipe("storage_corruption");
      } else {
        // leave tokens null; will refresh on first getAccessToken
        tokens = {
          accessToken: "",
          refreshToken: rt,
          expiresAt: 0,
          tokenType: "Bearer",
          idToken: loaded.lastIdToken,
        };
        setState("authenticated");
      }
    } else {
      setState("unauthenticated");
    }
  } catch {
    setState("unauthenticated");
  }

  // ----- handlers -----

  async function prepareAuth() {
    const { verifier, challenge } = await generatePkcePair();
    const s = crypto.randomUUID();
    const d = await getDiscovery(cfg.idpBaseUrl, cfg.timeouts);
    const u = new URL(d.authorization_endpoint);
    u.searchParams.set("client_id", cfg.clientId);
    u.searchParams.set("redirect_uri", cfg.redirectUri);
    u.searchParams.set("response_type", "code");
    u.searchParams.set("scope", cfg.scopes.join(" "));
    u.searchParams.set("state", s);
    u.searchParams.set("code_challenge", challenge);
    u.searchParams.set("code_challenge_method", "S256");
    if (cfg.installationId)
      u.searchParams.set("installation_id", cfg.installationId);
    if (supportsDpop(d)) u.searchParams.set("dpop_jkt", "-"); // hydra hint
    return { authUrl: u.toString(), state: s, verifier };
  }

  async function completeAuth(args: {
    code: string;
    verifier: string;
    state: string;
    expectedState: string;
  }) {
    if (args.state !== args.expectedState)
      throw new AuthError("OAUTH_STATE_MISMATCH", "state mismatch");
    const kp = await generateDpopKey();
    const wk = await generateWrapKey();
    const ctx = await makeDpopContext(kp);
    const newTokens = await exchangeCode(cfg, ctx, {
      code: args.code,
      verifier: args.verifier,
    });
    const wrapped = await wrap(wk, newTokens.refreshToken);
    const s: Session = {
      wrapKey: wk,
      dpopKey: kp,
      wrappedRT: wrapped,
      lastIdToken: newTokens.idToken,
      updatedAt: Date.now(),
    };
    await saveSession(namespace, s);
    wrapKey = wk;
    dpopCtx = ctx;
    session = s;
    tokens = newTokens;
    scheduleRefresh();
    setState(reduce(state, { kind: "sign_in_done" }));
  }

  async function completeFedcm(idToken: string) {
    const claims = decodeJwtPayload(idToken);
    const iss = claims.iss;
    if (typeof iss !== "string" || iss.replace(/\/$/, "") !== cfg.idpBaseUrl) {
      throw new AuthError("FEDCM_ISS_MISMATCH", "FedCM iss mismatch");
    }
    const kp = await generateDpopKey();
    const wk = await generateWrapKey();
    const ctx = await makeDpopContext(kp);
    const newTokens = await exchangeFedcmIdToken(cfg, ctx, idToken);
    const wrapped = await wrap(wk, newTokens.refreshToken);
    const s: Session = {
      wrapKey: wk,
      dpopKey: kp,
      wrappedRT: wrapped,
      lastIdToken: newTokens.idToken,
      updatedAt: Date.now(),
    };
    await saveSession(namespace, s);
    wrapKey = wk;
    dpopCtx = ctx;
    session = s;
    tokens = newTokens;
    scheduleRefresh();
    setState(reduce(state, { kind: "sign_in_done" }));
  }

  async function ensureFreshAccess(force = false) {
    if (!tokens || !dpopCtx || !wrapKey)
      throw new AuthError("TOKEN_EXPIRED", "not authenticated");
    const nearExpiry = Date.now() >= tokens.expiresAt - REFRESH_BUFFER_MS;
    if (!force && !nearExpiry && tokens.accessToken) {
      return { accessToken: tokens.accessToken, tokenType: tokens.tokenType };
    }
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = withRefreshLock(namespace, async () => {
      // Re-read RT from IDB — peer may have rotated.
      const fresh = await loadSession(namespace);
      if (fresh) {
        const rt = await unwrap(fresh.wrapKey, fresh.wrappedRT);
        if (tokens && rt !== tokens.refreshToken)
          tokens = { ...tokens, refreshToken: rt };
      }
      setState(reduce(state, { kind: "refresh_start" }));
      const outcome = await refreshTokens(cfg, dpopCtx!, tokens!.refreshToken);
      if (outcome.outcome === "rotated") {
        await persistTokens(outcome.tokens);
        setState(reduce(state, { kind: "refresh_done" }));
        return {
          accessToken: outcome.tokens.accessToken,
          tokenType: outcome.tokens.tokenType,
        };
      }
      if (outcome.outcome === "reuse_detected") {
        await wipe("refresh_reuse_detected");
        throw new AuthError(
          "REFRESH_REUSE_DETECTED",
          "refresh token reuse detected",
        );
      }
      setState(
        reduce(state, {
          kind: "refresh_fail",
          error: {
            code: outcome.error.code,
            message: outcome.error.message,
            retryable: outcome.error.retryable,
          },
          wipe: false,
        }),
      );
      throw outcome.error;
    }).finally(() => {
      refreshInFlight = null;
    });
    return refreshInFlight;
  }

  async function apiFetch(
    path: string,
    init: {
      method: string;
      headers?: Record<string, string>;
      body?: ArrayBuffer | string | null;
      timeoutMs?: number;
    },
  ) {
    if (!dpopCtx || !tokens)
      throw new AuthError("TOKEN_EXPIRED", "not authenticated");
    const fresh = await ensureFreshAccess();
    return proxyFetch(
      cfg,
      dpopCtx,
      {
        accessToken: fresh.accessToken,
        tokenType: fresh.tokenType,
        ensureFresh: async (force) => ensureFreshAccess(force),
        onRefresh: () => {},
      },
      {
        path,
        method: init.method,
        headers: init.headers,
        body: init.body ?? undefined,
        timeoutMs: init.timeoutMs,
      },
    );
  }

  async function apiUpload(
    path: string,
    file: { name: string; type: string; bytes: ArrayBuffer },
    timeoutMs?: number,
  ) {
    if (!dpopCtx || !tokens)
      throw new AuthError("TOKEN_EXPIRED", "not authenticated");
    const fresh = await ensureFreshAccess();
    const form = new FormData();
    form.append("file", new Blob([file.bytes], { type: file.type }), file.name);
    return proxyFetch(
      cfg,
      dpopCtx,
      {
        accessToken: fresh.accessToken,
        tokenType: fresh.tokenType,
        ensureFresh: async (force) => ensureFreshAccess(force),
        onRefresh: () => {},
      },
      {
        path,
        method: "PUT",
        body: form as any,
        timeoutMs: timeoutMs ?? cfg.timeouts.upload,
      },
    );
  }

  async function getRoles() {
    const fresh = await ensureFreshAccess();
    try {
      const p = decodeJwtPayload(fresh.accessToken);
      if (Array.isArray(p.roles))
        return (p.roles as unknown[]).filter(
          (r): r is string => typeof r === "string",
        );
      const r = (p.realm_access as any)?.roles;
      if (Array.isArray(r))
        return (r as unknown[]).filter(
          (x): x is string => typeof x === "string",
        );
      return [];
    } catch {
      return [];
    }
  }

  async function logout() {
    cancelTimer();
    const d = await getDiscovery(cfg.idpBaseUrl, cfg.timeouts).catch(
      () => null,
    );
    if (d?.end_session_endpoint && session?.lastIdToken) {
      const form = new URLSearchParams({
        client_id: cfg.clientId,
        id_token_hint: session.lastIdToken,
      });
      if (cfg.redirectUri)
        form.set("post_logout_redirect_uri", cfg.redirectUri);
      await fetch(d.end_session_endpoint, {
        method: "POST",
        body: form,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }).catch(() => {});
    }
    if (d?.revocation_endpoint && tokens?.refreshToken) {
      const form = new URLSearchParams({
        client_id: cfg.clientId,
        token: tokens.refreshToken,
        token_type_hint: "refresh_token",
      });
      await fetch(d.revocation_endpoint, {
        method: "POST",
        body: form,
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }).catch(() => {});
    }
    tokens = null;
    wrapKey = null;
    dpopCtx = null;
    session = null;
    await clearSession(namespace).catch(() => {});
    channel.postMessage({ type: "logout" });
    setState(reduce(state, { kind: "logout" }));
  }

  function destroy() {
    cancelTimer();
    stateListeners.clear();
    secListeners.clear();
    channel.close();
  }

  channel.onmessage = (ev) => {
    const data = ev.data as { type?: string };
    if (data?.type === "logout") {
      void wipe("logged_out_elsewhere");
    }
    if (data?.type === "tokens-updated") {
      /* peer rotated; next ensureFreshAccess reloads */
    }
  };

  return {
    get state() {
      return state;
    },
    namespace,
    prepareAuth,
    completeAuth,
    completeFedcm,
    getAccessToken: ensureFreshAccess,
    fetch: apiFetch,
    upload: apiUpload,
    getRoles,
    logout,
    destroy,
    onState: (cb) => {
      stateListeners.add(cb);
      cb(state);
      return () => {
        stateListeners.delete(cb);
      };
    },
    onSecurity: (cb) => {
      secListeners.add(cb);
      return () => {
        secListeners.delete(cb);
      };
    },
  };
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/src/worker/auth-worker.ts shared/auth-runtime/src/__tests__/worker/auth-worker.test.ts
git commit -m "feat(auth-runtime): worker core assembly (init, auth, refresh, fetch, logout, wipe)"
```

---

## Task A.15: Runtime proxy (main thread)

**Files:**

- Create: `shared/auth-runtime/src/runtime.ts`
- Create: `shared/auth-runtime/src/shared/fedcm.ts`
- Create: `shared/auth-runtime/src/__tests__/runtime.test.ts`

Runtime proxy currently operates in "in-thread mode" only for unit tests. An actual Worker-backed path is assembled in Task A.16 (build). This proxy is agnostic of which backend is used.

- [ ] **Step 1: Write failing test**

```ts
// shared/auth-runtime/src/__tests__/runtime.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createAuthRuntime } from "../runtime.js";
import {
  _setDiscoveryForTest,
  clearDiscoveryCache,
} from "../shared/discovery.js";

beforeEach(() => {
  clearDiscoveryCache();
  _setDiscoveryForTest("https://i", {
    issuer: "https://i",
    authorization_endpoint: "https://i/auth",
    token_endpoint: "https://i/token",
    dpop_signing_alg_values_supported: ["ES256"],
  });
  globalThis.fetch = vi.fn();
});

describe("createAuthRuntime", () => {
  it("starts unauthenticated with no session", async () => {
    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      apiBaseUrl: "https://a",
      skipFedCM: true,
    });
    // wait for init
    await new Promise<void>((resolve) => {
      const off = rt.onAuthStateChange((s) => {
        if (s !== "initializing") {
          off();
          resolve();
        }
      });
    });
    expect(rt.getState()).toBe("unauthenticated");
    rt.destroy();
  });

  it("exposes version", () => {
    const rt = createAuthRuntime({ clientId: "c", skipFedCM: true });
    expect(typeof rt.version).toBe("string");
    rt.destroy();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement** — delegates to the worker core in in-thread mode; the full Worker switch comes in A.16.

```ts
// shared/auth-runtime/src/shared/fedcm.ts
import type { ResolvedConfig } from "./types.js";
import { fetchT } from "../worker/fetchWithTimeout.js";

const probeCache = new Map<string, boolean>();

export function isFedCMSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    "IdentityCredential" in window &&
    typeof navigator.credentials?.get === "function"
  );
}

export async function isFedCMConfigAvailable(
  cfg: ResolvedConfig,
): Promise<boolean> {
  const key = cfg.idpBaseUrl + cfg.fedcmConfigUrl;
  const cached = probeCache.get(key);
  if (cached !== undefined) return cached;
  try {
    const r = await fetchT(
      `${cfg.idpBaseUrl}${cfg.fedcmConfigUrl}`,
      { method: "HEAD", credentials: "omit" },
      cfg.timeouts.discovery,
    );
    probeCache.set(key, r.ok);
    return r.ok;
  } catch {
    probeCache.set(key, false);
    return false;
  }
}

export async function attemptFedCM(
  cfg: ResolvedConfig,
  mediation: CredentialMediationRequirement,
): Promise<string | null> {
  if (!isFedCMSupported() || cfg.skipFedCM) return null;
  if (!(await isFedCMConfigAvailable(cfg))) return null;
  try {
    const credential = (await navigator.credentials.get({
      identity: {
        providers: [
          {
            configURL: `${cfg.idpBaseUrl}${cfg.fedcmConfigUrl}`,
            clientId: cfg.clientId,
          },
        ],
        context: "signin",
      },
      mediation,
    } as CredentialRequestOptions)) as any;
    return credential?.token ?? null;
  } catch {
    return null;
  }
}
```

```ts
// shared/auth-runtime/src/runtime.ts
import type {
  AuthConfig,
  AuthState,
  SecurityEvent,
  ApiResponse,
} from "./shared/types.js";
import { AuthError } from "./shared/errors.js";
import { resolveConfig } from "./shared/config.js";
import { getDiscovery } from "./shared/discovery.js";
import { attemptFedCM, isFedCMSupported } from "./shared/fedcm.js";
import { createWorkerCore, type WorkerCore } from "./worker/auth-worker.js";

declare const __STAWI_AUTH_VERSION__: string | undefined;

export interface AuthRuntime {
  ensureAuthenticated(): Promise<void>;
  fetch<T = unknown>(
    path: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string | ArrayBuffer | null;
      timeoutMs?: number;
    },
  ): Promise<T>;
  upload<T = unknown>(path: string, file: File): Promise<T>;
  getRoles(): Promise<string[]>;
  logout(): Promise<void>;
  onAuthStateChange(cb: (s: AuthState) => void): () => void;
  onSecurityEvent(cb: (e: SecurityEvent) => void): () => void;
  getState(): AuthState;
  prefetchDiscovery(): Promise<void>;
  destroy(): void;
  readonly version: string;
}

export function createAuthRuntime(config: AuthConfig): AuthRuntime {
  const cfg = resolveConfig(config);
  let corePromise: Promise<WorkerCore> = createWorkerCore(cfg);
  const version =
    typeof __STAWI_AUTH_VERSION__ === "string" ? __STAWI_AUTH_VERSION__ : "dev";

  // proactive FedCM probe on idle — main thread only
  if (typeof window !== "undefined" && isFedCMSupported() && !cfg.skipFedCM) {
    const run = async () => {
      const token = await attemptFedCM(cfg, "silent");
      if (!token) return;
      const core = await corePromise;
      if (core.state === "authenticated") return;
      await core.completeFedcm(token).catch(() => {});
    };
    if ("requestIdleCallback" in window)
      (window as any).requestIdleCallback(run, { timeout: 1500 });
    else setTimeout(run, 0);
  }

  async function ensureAuthenticated() {
    const core = await corePromise;
    if (core.state === "authenticated") return;
    // Try optional FedCM once
    const token = await attemptFedCM(cfg, "optional");
    if (token) {
      await core.completeFedcm(token);
      return;
    }
    // Fall through to popup (main-thread helper in separate module)
    const { runOAuthPopup } = await import("./oauth-popup.js");
    await runOAuthPopup(cfg, core);
  }

  async function parse<T>(
    body: ArrayBuffer,
    headers: Record<string, string>,
  ): Promise<T> {
    if (body.byteLength === 0) return undefined as T;
    const ct = headers["content-type"] ?? "";
    if (ct.includes("application/json")) {
      return JSON.parse(new TextDecoder().decode(body)) as T;
    }
    return new TextDecoder().decode(body) as unknown as T;
  }

  return {
    version,
    getState() {
      let s: AuthState = "initializing";
      void corePromise.then((c) => {
        s = c.state;
      });
      return s;
    },
    onAuthStateChange(cb) {
      let off: (() => void) | null = null;
      void corePromise.then((c) => {
        off = c.onState(cb);
      });
      return () => {
        off?.();
      };
    },
    onSecurityEvent(cb) {
      let off: (() => void) | null = null;
      void corePromise.then((c) => {
        off = c.onSecurity(cb);
      });
      return () => {
        off?.();
      };
    },
    ensureAuthenticated,
    async fetch<T = unknown>(
      path: string,
      init?: {
        method?: string;
        headers?: Record<string, string>;
        body?: string | ArrayBuffer | null;
        timeoutMs?: number;
      },
    ) {
      const core = await corePromise;
      const res = await core.fetch(path, {
        method: init?.method ?? "GET",
        headers: init?.headers,
        body: init?.body ?? null,
        timeoutMs: init?.timeoutMs,
      });
      return parse<T>(res.body, res.headers);
    },
    async upload<T = unknown>(path: string, file: File) {
      const core = await corePromise;
      const bytes = await file.arrayBuffer();
      const res = await core.upload(path, {
        name: file.name,
        type: file.type,
        bytes,
      });
      return parse<T>(res.body, res.headers);
    },
    async getRoles() {
      return (await corePromise).getRoles();
    },
    async logout() {
      await (await corePromise).logout();
    },
    async prefetchDiscovery() {
      await getDiscovery(cfg.idpBaseUrl, cfg.timeouts);
    },
    destroy() {
      void corePromise.then((c) => c.destroy());
    },
  };
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/src/runtime.ts shared/auth-runtime/src/shared/fedcm.ts shared/auth-runtime/src/__tests__/runtime.test.ts
git commit -m "feat(auth-runtime): public AuthRuntime with FedCM + in-thread worker core"
```

---

## Task A.16: OAuth popup driver (gesture-preserving)

**Files:**

- Create: `shared/auth-runtime/src/oauth-popup.ts`
- Create: `shared/auth-runtime/src/__tests__/oauth-popup.test.ts`

- [ ] **Step 1: Write failing test**

```ts
// shared/auth-runtime/src/__tests__/oauth-popup.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";
import { runOAuthPopup } from "../oauth-popup.js";

describe("runOAuthPopup", () => {
  beforeEach(() => {
    /* jsdom */
  });

  it("throws OAUTH_POPUP_BLOCKED if window.open returns null", async () => {
    const core = {
      prepareAuth: vi.fn().mockResolvedValue({
        authUrl: "https://i/auth?a=1",
        state: "s",
        verifier: "v",
      }),
      completeAuth: vi.fn(),
    } as any;
    vi.stubGlobal("open", () => null);
    const cfg = { redirectUri: "https://r/cb" } as any;
    await expect(runOAuthPopup(cfg, core)).rejects.toMatchObject({
      code: "OAUTH_POPUP_BLOCKED",
    });
  });

  it("completes auth when postMessage arrives with matching origin", async () => {
    const core = {
      prepareAuth: vi.fn().mockResolvedValue({
        authUrl: "https://i/auth?a=1",
        state: "s",
        verifier: "v",
      }),
      completeAuth: vi.fn().mockResolvedValue(undefined),
    } as any;
    const popup = { location: { href: "" }, closed: false, close: vi.fn() };
    vi.stubGlobal("open", () => popup);
    const cfg = { redirectUri: "https://r/cb" } as any;

    const promise = runOAuthPopup(cfg, core);
    // Simulate callback page posting back
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "stawi-auth", code: "CODE", state: "s" },
        origin: "https://r",
      }),
    );
    await promise;
    expect(core.completeAuth).toHaveBeenCalledWith({
      code: "CODE",
      state: "s",
      verifier: "v",
      expectedState: "s",
    });
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// shared/auth-runtime/src/oauth-popup.ts
import type { ResolvedConfig } from "./shared/types.js";
import { AuthError } from "./shared/errors.js";
import type { WorkerCore } from "./worker/auth-worker.js";

const POPUP_W = 500,
  POPUP_H = 600;
const TIMEOUT_MS = 5 * 60 * 1000;

export async function runOAuthPopup(
  cfg: ResolvedConfig,
  core: WorkerCore,
): Promise<void> {
  const left = window.screenX + Math.max(0, (window.outerWidth - POPUP_W) / 2);
  const top = window.screenY + Math.max(0, (window.outerHeight - POPUP_H) / 2);
  const popup = window.open(
    "about:blank",
    "stawi-auth",
    `width=${POPUP_W},height=${POPUP_H},left=${left},top=${top},popup=yes`,
  );
  if (!popup)
    throw new AuthError("OAUTH_POPUP_BLOCKED", "popup blocked by browser");

  let authUrl: string, state: string, verifier: string;
  try {
    ({ authUrl, state, verifier } = await core.prepareAuth());
  } catch (err) {
    popup.close();
    throw err;
  }
  popup.location.href = authUrl;

  const redirectOrigin = new URL(cfg.redirectUri).origin;

  return new Promise<void>((resolve, reject) => {
    let done = false;
    const onMsg = async (ev: MessageEvent) => {
      if (ev.origin !== redirectOrigin) return;
      const data = ev.data as {
        type?: string;
        code?: string;
        state?: string;
      } | null;
      if (!data || data.type !== "stawi-auth" || !data.code || !data.state)
        return;
      if (done) return;
      done = true;
      cleanup();
      try {
        await core.completeAuth({
          code: data.code,
          state: data.state,
          verifier,
          expectedState: state,
        });
        popup.close();
        resolve();
      } catch (err) {
        popup.close();
        reject(err);
      }
    };
    const interval = setInterval(() => {
      if (done) return;
      if (popup.closed) {
        done = true;
        cleanup();
        reject(new AuthError("OAUTH_POPUP_CLOSED", "popup closed by user"));
      } else {
        // same-origin polling fallback
        try {
          if (
            popup.location.origin === redirectOrigin &&
            popup.location.search
          ) {
            const params = new URLSearchParams(popup.location.search);
            const code = params.get("code"),
              returnedState = params.get("state");
            if (code && returnedState) {
              done = true;
              cleanup();
              core
                .completeAuth({
                  code,
                  state: returnedState,
                  verifier,
                  expectedState: state,
                })
                .then(() => {
                  popup.close();
                  resolve();
                })
                .catch((err) => {
                  popup.close();
                  reject(err);
                });
            }
          }
        } catch {
          /* cross-origin, keep polling */
        }
      }
    }, 200);
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      cleanup();
      popup.close();
      reject(new AuthError("OAUTH_POPUP_TIMEOUT", "popup timed out"));
    }, TIMEOUT_MS);
    function cleanup() {
      window.removeEventListener("message", onMsg);
      clearInterval(interval);
      clearTimeout(timer);
    }
    window.addEventListener("message", onMsg);
  });
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add shared/auth-runtime/src/oauth-popup.ts shared/auth-runtime/src/__tests__/oauth-popup.test.ts
git commit -m "feat(auth-runtime): OAuth popup driver with postMessage + polling fallback + timeout"
```

---

## Task A.17: Public index (exports) and delete legacy files

**Files:**

- Rewrite: `shared/auth-runtime/src/index.ts`
- Delete: `shared/auth-runtime/src/api-client.ts`
- Delete: `shared/auth-runtime/src/token-manager.ts`
- Delete: `shared/auth-runtime/src/token-store.ts`
- Delete: `shared/auth-runtime/src/oauth.ts`
- Delete: `shared/auth-runtime/src/fedcm.ts`
- Delete: `shared/auth-runtime/src/pkce.ts`
- Delete: `shared/auth-runtime/src/jwt.ts`
- Delete: `shared/auth-runtime/src/discovery.ts`
- Delete: `shared/auth-runtime/src/config.ts`
- Delete: `shared/auth-runtime/src/errors.ts`
- Delete: `shared/auth-runtime/src/types.ts`
- Delete: `shared/auth-runtime/src/fedcm-types.d.ts` (move contents if still needed)
- Delete legacy tests under `shared/auth-runtime/src/__tests__/` whose subjects were deleted
- Modify: `shared/auth-runtime/tsup.config.ts` to inject `__STAWI_AUTH_VERSION__`
- Modify: `shared/auth-runtime/package.json` bump to `1.0.0`

- [ ] **Step 1: Rewrite `index.ts`**

```ts
// shared/auth-runtime/src/index.ts
export type {
  AuthConfig,
  AuthState,
  AuthStateCallback,
  SecurityEvent,
  SecurityEventCallback,
  TokenSet,
  UserInfo,
} from "./shared/types.js";
export type { AuthErrorCode } from "./shared/errors.js";
export { AuthError } from "./shared/errors.js";
export { decodeJwtPayload, extractRolesFromToken } from "./shared/jwt.js";
export { createAuthRuntime, type AuthRuntime } from "./runtime.js";
```

- [ ] **Step 2: Update `tsup.config.ts`**

```ts
// shared/auth-runtime/tsup.config.ts
import { defineConfig } from "tsup";
import pkg from "./package.json";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["cjs", "esm"],
  dts: true,
  clean: true,
  sourcemap: true,
  treeshake: true,
  define: { __STAWI_AUTH_VERSION__: JSON.stringify(pkg.version) },
});
```

- [ ] **Step 3: Delete legacy files and their tests**

```bash
rm shared/auth-runtime/src/api-client.ts shared/auth-runtime/src/token-manager.ts \
   shared/auth-runtime/src/token-store.ts shared/auth-runtime/src/oauth.ts \
   shared/auth-runtime/src/fedcm.ts shared/auth-runtime/src/pkce.ts \
   shared/auth-runtime/src/jwt.ts shared/auth-runtime/src/discovery.ts \
   shared/auth-runtime/src/config.ts shared/auth-runtime/src/errors.ts \
   shared/auth-runtime/src/types.ts shared/auth-runtime/src/fedcm-types.d.ts
rm shared/auth-runtime/src/__tests__/api-client.test.ts \
   shared/auth-runtime/src/__tests__/token-manager*.test.ts \
   shared/auth-runtime/src/__tests__/token-store*.test.ts \
   shared/auth-runtime/src/__tests__/oauth*.test.ts \
   shared/auth-runtime/src/__tests__/fedcm*.test.ts \
   shared/auth-runtime/src/__tests__/pkce.test.ts \
   shared/auth-runtime/src/__tests__/jwt.test.ts \
   shared/auth-runtime/src/__tests__/discovery.test.ts \
   shared/auth-runtime/src/__tests__/config.test.ts \
   shared/auth-runtime/src/__tests__/index*.test.ts
```

- [ ] **Step 4: Bump version and build**

Edit `shared/auth-runtime/package.json`: `"version": "1.0.0"`.

Run:

```bash
pnpm --filter @stawi/auth-runtime build && pnpm --filter @stawi/auth-runtime test
```

Expected: build succeeds; remaining tests (new ones from A.1–A.16) pass.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(auth-runtime)!: v1 rewrite — Worker-isolated DPoP with adaptive fallback

BREAKING:
- getAuthRuntime() singleton removed; use createAuthRuntime() per mount.
- getAccessToken() removed; route API calls via runtime.fetch/upload.
- ApiClient class removed.
- Default scopes now include offline_access."
```

---

## Task A.18: Changeset for auth-runtime major

**Files:**

- Create: `.changeset/auth-runtime-v1.md`

- [ ] **Step 1: Write the changeset**

```md
---
"@stawi/auth-runtime": major
---

v1 rewrite. Web Worker token isolation, adaptive DPoP, non-extractable CryptoKeys for signing and AES-GCM refresh-token encryption at rest, refresh-token rotation with reuse-detection wipe, `navigator.locks` + `BroadcastChannel` multi-tab coordination, proactive FedCM probe on idle, gesture-preserving OAuth popup, per-phase timeouts, namespaced storage.

Breaking: `getAuthRuntime` singleton, `getAccessToken`, and `ApiClient` removed. Migrate to `createAuthRuntime(config)` and `runtime.fetch(path, init)` / `runtime.upload(path, file)`.
```

- [ ] **Step 2: Commit**

```bash
git add .changeset/auth-runtime-v1.md
git commit -m "changeset: auth-runtime v1 major"
```

---

# Part B — `@stawi/profile` v1.0

Continues the plan in `docs/superpowers/plans/2026-04-19-profile-v1-hardening-part-b.md` (split for readability; pick up from Task B.1 there).
