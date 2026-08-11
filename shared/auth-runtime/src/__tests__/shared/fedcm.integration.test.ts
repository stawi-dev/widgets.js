import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { attemptFedCM, _resetProbeCache } from "../../shared/fedcm.js";
import type { ResolvedConfig } from "../../shared/types.js";

const baseCfg: ResolvedConfig = {
  clientId: "c",
  idpBaseUrl: "https://i",
  apiBaseUrl: "https://a",
  redirectUri: "https://r/cb",
  scopes: ["openid"],
  fedcmBaseUrl: "https://i",
  fedcmConfigUrl: "/.well-known/web-identity",
  skipFedCM: false,
  timeouts: { discovery: 1000, token: 1000, api: 1000, upload: 1000 },
  fedcm: {},
};

const originalFetch = globalThis.fetch;

function stubProbeOk(loginUrl?: string) {
  globalThis.fetch = vi
    .fn()
    .mockResolvedValue(
      new Response(
        JSON.stringify(
          loginUrl
            ? { login_url: loginUrl }
            : { accounts_endpoint: "/fedcm/accounts" },
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    ) as unknown as typeof fetch;
}

describe("attemptFedCM integration via FedCM polyfill", () => {
  beforeEach(() => {
    _resetProbeCache();
    globalThis.__TEST_FEDCM.reset();
    stubProbeOk("https://i/login");
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.__TEST_FEDCM.reset();
  });

  it("passes nonce through to the provider and returns token outcome", async () => {
    globalThis.__TEST_FEDCM.handleGet = (req) => {
      const provider = (req.providers as Array<{ nonce?: string }>)[0];
      expect(provider.nonce).toBe("test-nonce");
      return { type: "identity", token: "id-token", isAutoSelected: false };
    };

    const outcome = await attemptFedCM(baseCfg, {
      mediation: "optional",
      mode: "active",
      nonce: "test-nonce",
    });

    expect(outcome).toEqual({
      kind: "token",
      token: "id-token",
      autoSelected: false,
    });
    expect(globalThis.__TEST_FEDCM.calls.get).toHaveLength(1);
  });

  it("propagates isAutoSelected:true into outcome", async () => {
    globalThis.__TEST_FEDCM.handleGet = () => ({
      type: "identity",
      token: "id-token",
      isAutoSelected: true,
    });

    const outcome = await attemptFedCM(baseCfg, { mediation: "silent" });
    expect(outcome).toEqual({
      kind: "token",
      token: "id-token",
      autoSelected: true,
    });
  });

  it("maps NetworkError → no-session with loginUrl from probe", async () => {
    globalThis.__TEST_FEDCM.handleGet = () => {
      const e = new Error("no session");
      e.name = "NetworkError";
      throw e;
    };

    const outcome = await attemptFedCM(baseCfg, { mediation: "optional" });
    expect(outcome).toEqual({
      kind: "no-session",
      loginUrl: "https://i/login",
    });
  });

  it("maps NotAllowedError → dismissed for mediation:optional", async () => {
    globalThis.__TEST_FEDCM.handleGet = () => {
      const e = new Error("user dismissed");
      e.name = "NotAllowedError";
      throw e;
    };
    const outcome = await attemptFedCM(baseCfg, { mediation: "optional" });
    expect(outcome).toEqual({ kind: "dismissed" });
  });

  it("maps NotAllowedError → not-allowed for mediation:silent", async () => {
    globalThis.__TEST_FEDCM.handleGet = () => {
      const e = new Error("silent denied");
      e.name = "NotAllowedError";
      throw e;
    };
    const outcome = await attemptFedCM(baseCfg, { mediation: "silent" });
    expect(outcome).toEqual({ kind: "not-allowed" });
  });

  it("maps AbortError → aborted", async () => {
    globalThis.__TEST_FEDCM.handleGet = () => {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    };
    const outcome = await attemptFedCM(baseCfg, { mediation: "optional" });
    expect(outcome).toEqual({ kind: "aborted" });
  });

  it("maps IdentityCredentialError with code/url → error outcome", async () => {
    globalThis.__TEST_FEDCM.handleGet = () => {
      const Ctor = (
        globalThis as unknown as {
          IdentityCredentialError: new (
            msg: string,
            init: { code?: string; url?: string },
          ) => Error & { code?: string; url?: string };
        }
      ).IdentityCredentialError;
      throw new Ctor("server rejected", {
        code: "invalid_request",
        url: "https://i/err",
      });
    };
    const outcome = await attemptFedCM(baseCfg, { mediation: "optional" });
    expect(outcome).toEqual({
      kind: "error",
      message: "server rejected",
      code: "invalid_request",
      url: "https://i/err",
    });
  });

  it("passes mode:active when opts.mode is active", async () => {
    globalThis.__TEST_FEDCM.handleGet = () => ({
      type: "identity",
      token: "t",
    });
    await attemptFedCM(baseCfg, { mediation: "optional", mode: "active" });
    expect(globalThis.__TEST_FEDCM.calls.get[0].mode).toBe("active");
  });

  it("passes mode:passive when opts.mode is passive", async () => {
    globalThis.__TEST_FEDCM.handleGet = () => ({
      type: "identity",
      token: "t",
    });
    await attemptFedCM(baseCfg, { mediation: "silent", mode: "passive" });
    expect(globalThis.__TEST_FEDCM.calls.get[0].mode).toBe("passive");
  });

  it("merges cfg.fedcm fields / loginHint / domainHint / params into the provider", async () => {
    const cfg: ResolvedConfig = {
      ...baseCfg,
      fedcm: {
        fields: ["name", "email"],
        loginHint: "alice@example",
        domainHint: "example.com",
        params: { tier: "gold" },
      },
    };

    globalThis.__TEST_FEDCM.handleGet = () => ({
      type: "identity",
      token: "t",
    });
    await attemptFedCM(cfg, { mediation: "optional", nonce: "n" });

    const provider = globalThis.__TEST_FEDCM.calls.get[0].providers?.[0] as {
      configURL?: string;
      clientId?: string;
      nonce?: string;
      fields?: string[];
      loginHint?: string;
      domainHint?: string;
      params?: Record<string, string>;
    };
    expect(provider).toMatchObject({
      configURL: "https://i/.well-known/web-identity",
      clientId: "c",
      nonce: "n",
      fields: ["name", "email"],
      loginHint: "alice@example",
      domainHint: "example.com",
      params: { tier: "gold" },
    });
  });

  it("forwards the abort signal onto navigator.credentials.get", async () => {
    globalThis.__TEST_FEDCM.handleGet = () => ({
      type: "identity",
      token: "t",
    });
    const ac = new AbortController();
    await attemptFedCM(baseCfg, { mediation: "optional", signal: ac.signal });
    expect(globalThis.__TEST_FEDCM.calls.get[0].signal).toBe(ac.signal);
  });
});
