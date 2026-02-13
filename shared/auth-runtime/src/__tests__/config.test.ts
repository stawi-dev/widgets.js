import { describe, it, expect } from "vitest";
import { resolveConfig } from "../config.js";

describe("resolveConfig", () => {
  it("throws if clientId is missing", () => {
    expect(() => resolveConfig({ clientId: "" })).toThrow("clientId");
  });

  it("applies defaults for stawi.org", () => {
    const config = resolveConfig({ clientId: "test-client" });
    expect(config.idpBaseUrl).toBe("https://oauth2.stawi.org");
    expect(config.apiBaseUrl).toBe("https://api.stawi.org");
    expect(config.scopes).toEqual(["openid", "profile", "email"]);
    expect(config.fedcmConfigUrl).toBe("/.well-known/web-identity");
    expect(config.clientId).toBe("test-client");
  });

  it("strips trailing slashes from URLs", () => {
    const config = resolveConfig({
      clientId: "c",
      idpBaseUrl: "https://accounts.example.com/",
      apiBaseUrl: "https://api.example.com/",
    });
    expect(config.idpBaseUrl).toBe("https://accounts.example.com");
    expect(config.apiBaseUrl).toBe("https://api.example.com");
  });

  it("allows overriding all fields", () => {
    const config = resolveConfig({
      clientId: "my-app",
      idpBaseUrl: "https://idp.test",
      apiBaseUrl: "https://api.test",
      redirectUri: "https://app.test/cb",
      scopes: ["openid"],
      fedcmConfigUrl: "/fedcm/config",
      installationId: "inst_123",
    });
    expect(config.clientId).toBe("my-app");
    expect(config.idpBaseUrl).toBe("https://idp.test");
    expect(config.apiBaseUrl).toBe("https://api.test");
    expect(config.redirectUri).toBe("https://app.test/cb");
    expect(config.scopes).toEqual(["openid"]);
    expect(config.fedcmConfigUrl).toBe("/fedcm/config");
    expect(config.installationId).toBe("inst_123");
  });
});
