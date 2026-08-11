import { describe, it, expect } from "vitest";
import {
  AuthError,
  createAuthRuntime,
  decodeJwtPayload,
  extractRolesFromToken,
} from "../index.js";

// Public re-exports through src/index.ts. Vitest's coverage reporter
// doesn't credit re-export statements without a corresponding import,
// so this file ensures each entry on the public surface is touched
// at least once.

describe("public api surface", () => {
  it("exports AuthError class", () => {
    const err = new AuthError("OAUTH_FAILED", "boom");
    expect(err).toBeInstanceOf(AuthError);
    expect(err.code).toBe("OAUTH_FAILED");
    expect(err.retryable).toBe(true);
  });

  it("exports decodeJwtPayload helper", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
      "base64url",
    );
    const payload = Buffer.from(
      JSON.stringify({ sub: "u1", name: "Alice" }),
    ).toString("base64url");
    const tok = `${header}.${payload}.sig`;
    expect(decodeJwtPayload(tok)).toMatchObject({ sub: "u1", name: "Alice" });
  });

  it("exports extractRolesFromToken helper", () => {
    const header = Buffer.from(JSON.stringify({ alg: "none" })).toString(
      "base64url",
    );
    const payload = Buffer.from(
      JSON.stringify({ roles: ["admin", "user"] }),
    ).toString("base64url");
    const tok = `${header}.${payload}.sig`;
    expect(extractRolesFromToken(tok)).toEqual(["admin", "user"]);
  });

  it("exports createAuthRuntime factory", () => {
    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      skipFedCM: true,
    });
    expect(rt).toBeDefined();
    expect(typeof rt.ensureAuthenticated).toBe("function");
    expect(typeof rt.completeRedirect).toBe("function");
    expect(typeof rt.fetch).toBe("function");
    expect(typeof rt.logout).toBe("function");
    expect(typeof rt.version).toBe("string");
    rt.destroy();
  });

  it("runtime.fetch / upload / getRoles / getClaims throw TOKEN_EXPIRED before sign-in", async () => {
    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      skipFedCM: true,
    });
    // Wait for init.
    await new Promise<void>((resolve) => {
      const off = rt.onAuthStateChange((s) => {
        if (s !== "initializing") {
          off();
          resolve();
        }
      });
    });
    await expect(rt.fetch("/whatever")).rejects.toMatchObject({
      code: "TOKEN_EXPIRED",
    });
    // upload is intentionally skipped here — jsdom's File polyfill
    // lacks arrayBuffer() so the runtime's `file.arrayBuffer()` call
    // throws before reaching the worker's TOKEN_EXPIRED check. The
    // upload path is covered by the worker test that exercises
    // apiUpload directly.
    await expect(rt.getRoles()).rejects.toMatchObject({
      code: "TOKEN_EXPIRED",
    });
    await expect(rt.getClaims()).rejects.toMatchObject({
      code: "TOKEN_EXPIRED",
    });
    rt.destroy();
  });

  it("runtime.prefetchDiscovery resolves without throwing", async () => {
    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      skipFedCM: true,
    });
    // Mock fetch so the discovery call doesn't go out.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            issuer: "https://i",
            authorization_endpoint: "https://i/auth",
            token_endpoint: "https://i/token",
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )) as typeof fetch;
    try {
      await rt.prefetchDiscovery();
    } finally {
      globalThis.fetch = originalFetch;
      rt.destroy();
    }
  });

  it("runtime.onAuthStateChange / onSecurityEvent / onFedcmEvent return working unsubscribers", async () => {
    const rt = createAuthRuntime({
      clientId: "c",
      idpBaseUrl: "https://i",
      skipFedCM: true,
    });
    const offA = rt.onAuthStateChange(() => {});
    const offB = rt.onSecurityEvent(() => {});
    const offC = rt.onFedcmEvent(() => {});
    // Allow the corePromise microtask to attach the listeners.
    await new Promise((r) => setTimeout(r, 5));
    expect(() => offA()).not.toThrow();
    expect(() => offB()).not.toThrow();
    expect(() => offC()).not.toThrow();
    rt.destroy();
  });
});
