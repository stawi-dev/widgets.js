import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  attemptFedCM,
  probeFedCMConfig,
  _resetProbeCache,
  isFedCMSupported,
} from "../../shared/fedcm.js";
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

describe("probeFedCMConfig", () => {
  beforeEach(() => {
    _resetProbeCache();
    globalThis.fetch = vi.fn() as unknown as typeof fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("returns {available:true, loginUrl} on 200 with login_url", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ login_url: "https://i/login" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await probeFedCMConfig(baseCfg)).toEqual({
      available: true,
      loginUrl: "https://i/login",
    });
  });

  it("returns {available:true} on 200 without login_url", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response(JSON.stringify({ accounts_endpoint: "/fedcm/accounts" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    expect(await probeFedCMConfig(baseCfg)).toEqual({ available: true });
  });

  it("returns {available:false} on 404", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("nope", { status: 404 }),
    );
    expect(await probeFedCMConfig(baseCfg)).toEqual({ available: false });
  });

  it("returns {available:false} on non-JSON body", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Response("<html>not json</html>", {
        status: 200,
        headers: { "content-type": "text/html" },
      }),
    );
    expect(await probeFedCMConfig(baseCfg)).toEqual({ available: false });
  });

  it("returns {available:false} when fetch throws", async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("boom"),
    );
    expect(await probeFedCMConfig(baseCfg)).toEqual({ available: false });
  });

  it("caches across calls (only one fetch)", async () => {
    const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ login_url: "https://i/login" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const a = await probeFedCMConfig(baseCfg);
    const b = await probeFedCMConfig(baseCfg);
    expect(a).toEqual(b);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("attemptFedCM (static branches)", () => {
  beforeEach(() => {
    _resetProbeCache();
  });

  it("returns unsupported when skipFedCM is true", async () => {
    const outcome = await attemptFedCM(
      { ...baseCfg, skipFedCM: true },
      { mediation: "silent" },
    );
    expect(outcome).toEqual({ kind: "unsupported" });
  });

  it("returns unsupported when FedCM API is absent", async () => {
    // The test setup installs a polyfilled IdentityCredential so that
    // production feature-detection resolves truthy. To simulate "FedCM API
    // absent", temporarily strip IdentityCredential for this test.
    const holder = window as unknown as { IdentityCredential?: unknown };
    const saved = holder.IdentityCredential;
    delete holder.IdentityCredential;
    try {
      expect(isFedCMSupported()).toBe(false);
      const outcome = await attemptFedCM(baseCfg, { mediation: "silent" });
      expect(outcome).toEqual({ kind: "unsupported" });
    } finally {
      if (saved !== undefined) holder.IdentityCredential = saved;
    }
  });
});

describe("attemptFedCM error-name → outcome mapping", () => {
  let originalIdentityCredential: unknown;
  let originalCredentials: unknown;

  beforeEach(() => {
    _resetProbeCache();
    // Mock probe fetch to say "available".
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ login_url: "https://i/login" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ) as unknown as typeof fetch;

    // Pretend FedCM is supported: stub window.IdentityCredential + navigator.credentials.
    originalIdentityCredential = (window as unknown as { IdentityCredential?: unknown })
      .IdentityCredential;
    (window as unknown as { IdentityCredential: unknown }).IdentityCredential =
      function IdentityCredential() {} as unknown;

    originalCredentials = (navigator as unknown as { credentials?: unknown }).credentials;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    if (originalIdentityCredential === undefined) {
      delete (window as unknown as { IdentityCredential?: unknown }).IdentityCredential;
    } else {
      (window as unknown as { IdentityCredential: unknown }).IdentityCredential =
        originalIdentityCredential;
    }
    if (originalCredentials === undefined) {
      delete (navigator as unknown as { credentials?: unknown }).credentials;
    } else {
      (navigator as unknown as { credentials: unknown }).credentials = originalCredentials;
    }
  });

  function stubCredentialsGet(impl: () => Promise<unknown>) {
    (navigator as unknown as { credentials: { get: typeof impl } }).credentials = {
      get: impl,
    };
  }

  it("maps AbortError → aborted", async () => {
    stubCredentialsGet(() => {
      const e = new Error("aborted");
      e.name = "AbortError";
      return Promise.reject(e);
    });
    const outcome = await attemptFedCM(baseCfg, { mediation: "optional" });
    expect(outcome).toEqual({ kind: "aborted" });
  });

  it("maps NetworkError → no-session with loginUrl", async () => {
    stubCredentialsGet(() => {
      const e = new Error("no session");
      e.name = "NetworkError";
      return Promise.reject(e);
    });
    const outcome = await attemptFedCM(baseCfg, { mediation: "optional" });
    expect(outcome).toEqual({ kind: "no-session", loginUrl: "https://i/login" });
  });

  it("maps NotAllowedError → dismissed for mediation=optional", async () => {
    stubCredentialsGet(() => {
      const e = new Error("dismissed");
      e.name = "NotAllowedError";
      return Promise.reject(e);
    });
    const outcome = await attemptFedCM(baseCfg, { mediation: "optional" });
    expect(outcome).toEqual({ kind: "dismissed" });
  });

  it("maps NotAllowedError → not-allowed for mediation=silent", async () => {
    stubCredentialsGet(() => {
      const e = new Error("silent not allowed");
      e.name = "NotAllowedError";
      return Promise.reject(e);
    });
    const outcome = await attemptFedCM(baseCfg, { mediation: "silent" });
    expect(outcome).toEqual({ kind: "not-allowed" });
  });

  it("maps IdentityCredentialError → error with code/url", async () => {
    stubCredentialsGet(() => {
      const e = Object.assign(new Error("server rejected"), {
        name: "IdentityCredentialError",
        code: "invalid_request",
        url: "https://i/err",
      });
      return Promise.reject(e);
    });
    const outcome = await attemptFedCM(baseCfg, { mediation: "optional" });
    expect(outcome).toEqual({
      kind: "error",
      message: "server rejected",
      code: "invalid_request",
      url: "https://i/err",
    });
  });

  it("maps unknown errors → error with message", async () => {
    stubCredentialsGet(() => Promise.reject(new Error("weird")));
    const outcome = await attemptFedCM(baseCfg, { mediation: "optional" });
    expect(outcome).toEqual({ kind: "error", message: "weird" });
  });

  it("returns token outcome on success", async () => {
    stubCredentialsGet(() =>
      Promise.resolve({ type: "identity", token: "abc.def.ghi", isAutoSelected: true }),
    );
    const outcome = await attemptFedCM(baseCfg, { mediation: "optional" });
    expect(outcome).toEqual({ kind: "token", token: "abc.def.ghi", autoSelected: true });
  });
});
