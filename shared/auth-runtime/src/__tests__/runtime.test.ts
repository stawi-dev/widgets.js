import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createAuthRuntime } from "../runtime.js";
import { _setDiscoveryForTest, clearDiscoveryCache } from "../shared/discovery.js";

beforeEach(() => {
  clearDiscoveryCache();
  _setDiscoveryForTest("https://i", {
    issuer: "https://i", authorization_endpoint: "https://i/auth", token_endpoint: "https://i/token",
    dpop_signing_alg_values_supported: ["ES256"],
  });
  globalThis.fetch = vi.fn();
});

afterEach(() => {
  // Restore any mutations to navigator.credentials / IdentityCredential set up by tests.
  try { delete (globalThis as any).IdentityCredential; } catch { /* ignore */ }
  if ((navigator as any).credentials) {
    try { delete (navigator as any).credentials; } catch { /* ignore */ }
  }
});

function waitForState(rt: ReturnType<typeof createAuthRuntime>, target: string): Promise<void> {
  return new Promise<void>((resolve) => {
    const off = rt.onAuthStateChange((s) => {
      if (s === target) { off(); resolve(); }
    });
  });
}

describe("createAuthRuntime", () => {
  it("starts unauthenticated with no session", async () => {
    const rt = createAuthRuntime({ clientId: "c", idpBaseUrl: "https://i", apiBaseUrl: "https://a", skipFedCM: true });
    // wait for init
    await new Promise<void>((resolve) => {
      const off = rt.onAuthStateChange((s) => {
        if (s !== "initializing") { off(); resolve(); }
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

  it("logout calls preventSilentAccess when available", async () => {
    const preventSilentAccess = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: { preventSilentAccess, get: vi.fn() },
    });
    const rt = createAuthRuntime({ clientId: "c", idpBaseUrl: "https://i", apiBaseUrl: "https://a", skipFedCM: true });
    await waitForState(rt, "unauthenticated");
    await rt.logout();
    expect(preventSilentAccess).toHaveBeenCalled();
    rt.destroy();
  });

  it("logout calls IdentityCredential.disconnect when available", async () => {
    const disconnect = vi.fn().mockResolvedValue(undefined);
    (globalThis as any).IdentityCredential = { disconnect };
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: { preventSilentAccess: vi.fn().mockResolvedValue(undefined), get: vi.fn() },
    });
    const rt = createAuthRuntime({
      clientId: "c", idpBaseUrl: "https://i", apiBaseUrl: "https://a",
      fedcmConfigUrl: "/.well-known/web-identity",
      skipFedCM: true,
    });
    await waitForState(rt, "unauthenticated");
    await rt.logout();
    expect(disconnect).toHaveBeenCalledWith({
      configURL: "https://i/.well-known/web-identity",
      clientId: "c",
    });
    rt.destroy();
  });

  it("logout tolerates missing FedCM methods", async () => {
    Object.defineProperty(navigator, "credentials", {
      configurable: true,
      value: { preventSilentAccess: undefined, get: vi.fn() },
    });
    (globalThis as any).IdentityCredential = undefined;
    const rt = createAuthRuntime({ clientId: "c", idpBaseUrl: "https://i", apiBaseUrl: "https://a", skipFedCM: true });
    await waitForState(rt, "unauthenticated");
    await expect(rt.logout()).resolves.toBeUndefined();
    rt.destroy();
  });
});
