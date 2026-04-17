/**
 * @vitest-environment jsdom
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  getDiscovery,
  clearDiscoveryCache,
  type OidcDiscovery,
} from "../discovery.js";
import { AuthError } from "../errors.js";

const HYDRA: OidcDiscovery = {
  issuer: "https://stawi.org",
  authorization_endpoint: "https://oauth2.stawi.org/oauth2/auth",
  token_endpoint: "https://oauth2.stawi.org/oauth2/token",
  jwks_uri: "https://oauth2.stawi.org/.well-known/jwks.json",
  end_session_endpoint: "https://stawi.org/oauth2/sessions/logout",
  revocation_endpoint: "https://stawi.org/oauth2/revoke",
  userinfo_endpoint: "https://profile.stawi.org/public/user/info",
};

function mockDiscoveryResponse(doc: Partial<OidcDiscovery>) {
  return new Response(JSON.stringify(doc), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("getDiscovery", () => {
  beforeEach(() => {
    clearDiscoveryCache();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("fetches /.well-known/openid-configuration from the idpBaseUrl", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockDiscoveryResponse(HYDRA));

    const doc = await getDiscovery("https://oauth2.stawi.org");

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://oauth2.stawi.org/.well-known/openid-configuration",
      expect.objectContaining({ credentials: "omit" }),
    );
    expect(doc.authorization_endpoint).toBe(
      "https://oauth2.stawi.org/oauth2/auth",
    );
    expect(doc.token_endpoint).toBe("https://oauth2.stawi.org/oauth2/token");
  });

  it("caches the discovery doc in memory — second call does not refetch", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockDiscoveryResponse(HYDRA));

    await getDiscovery("https://oauth2.stawi.org");
    await getDiscovery("https://oauth2.stawi.org");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("deduplicates concurrent calls to the same idpBaseUrl", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(mockDiscoveryResponse(HYDRA));

    const [a, b] = await Promise.all([
      getDiscovery("https://oauth2.stawi.org"),
      getDiscovery("https://oauth2.stawi.org"),
    ]);

    expect(a).toBe(b);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it("throws DISCOVERY_FAILED when the server returns non-2xx", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response("gone", { status: 500 }),
    );

    await expect(getDiscovery("https://bad.example")).rejects.toMatchObject({
      code: "DISCOVERY_FAILED",
    });
  });

  it("throws DISCOVERY_FAILED when the response is missing required fields", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      mockDiscoveryResponse({ issuer: "https://x" }),
    );

    await expect(
      getDiscovery("https://oauth2.stawi.org"),
    ).rejects.toMatchObject({
      code: "DISCOVERY_FAILED",
    });
  });

  it("does not cache a failed lookup — next call retries", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("nope", { status: 503 }))
      .mockResolvedValueOnce(mockDiscoveryResponse(HYDRA));

    await expect(getDiscovery("https://oauth2.stawi.org")).rejects.toThrow();
    const doc = await getDiscovery("https://oauth2.stawi.org");

    expect(doc.authorization_endpoint).toBe(
      "https://oauth2.stawi.org/oauth2/auth",
    );
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it("error is an AuthError with underlying cause surfaced", async () => {
    const boom = new TypeError("network down");
    vi.spyOn(globalThis, "fetch").mockRejectedValue(boom);

    await expect(
      getDiscovery("https://oauth2.stawi.org"),
    ).rejects.toBeInstanceOf(AuthError);
  });
});
