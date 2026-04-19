import { describe, it, expect, vi, beforeEach } from "vitest";
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
});
