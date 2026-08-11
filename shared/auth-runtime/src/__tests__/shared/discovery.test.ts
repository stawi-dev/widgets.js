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
