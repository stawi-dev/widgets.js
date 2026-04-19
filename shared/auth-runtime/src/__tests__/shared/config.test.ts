import { describe, it, expect } from "vitest";
import { resolveConfig } from "../../shared/config.js";
import { AuthError } from "../../shared/errors.js";

describe("resolveConfig", () => {
  it("throws INVALID_CONFIG when clientId missing", () => {
    expect(() => resolveConfig({} as any)).toThrow(AuthError);
  });
  it("strips trailing slashes and applies defaults", () => {
    const c = resolveConfig({ clientId: "abc", idpBaseUrl: "https://i/", apiBaseUrl: "https://a/" });
    expect(c.idpBaseUrl).toBe("https://i");
    expect(c.apiBaseUrl).toBe("https://a");
    expect(c.scopes).toContain("openid");
    expect(c.scopes).toContain("offline_access");
    expect(c.timeouts).toEqual({ discovery: 10000, token: 10000, api: 30000, upload: 60000 });
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
