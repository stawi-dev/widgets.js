import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openLoginUrl } from "../login-url.js";
import type { ResolvedConfig } from "../shared/types.js";

const baseCfg: ResolvedConfig = {
  clientId: "c",
  idpBaseUrl: "https://i",
  apiBaseUrl: "https://a",
  redirectUri: "https://r/cb",
  scopes: ["openid"],
  fedcmConfigUrl: "/.well-known/web-identity",
  skipFedCM: false,
  timeouts: { discovery: 1000, token: 1000, api: 1000, upload: 1000 },
  fedcm: {},
};

describe("openLoginUrl", () => {
  let originalOpen: typeof window.open;

  beforeEach(() => {
    originalOpen = window.open;
  });

  afterEach(() => {
    window.open = originalOpen;
    vi.useRealTimers();
  });

  it("rejects with OAUTH_POPUP_BLOCKED when window.open returns null", async () => {
    vi.stubGlobal("open", () => null);
    await expect(openLoginUrl(baseCfg, "https://i/login")).rejects.toMatchObject({
      code: "OAUTH_POPUP_BLOCKED",
    });
  });

  it("resolves and closes popup when postMessage arrives from matching origin", async () => {
    const close = vi.fn();
    const popup = { closed: false, close };
    vi.stubGlobal("open", () => popup);

    const promise = openLoginUrl(baseCfg, "https://i/login");
    // Let listener attach
    await new Promise((r) => setTimeout(r, 0));
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "stawi-login-complete" },
        origin: "https://i",
      }),
    );
    await expect(promise).resolves.toBeUndefined();
    expect(close).toHaveBeenCalled();
  });

  it("ignores postMessage from wrong origin", async () => {
    const close = vi.fn();
    const popup = { closed: false, close };
    vi.stubGlobal("open", () => popup);

    const promise = openLoginUrl(baseCfg, "https://i/login");
    await new Promise((r) => setTimeout(r, 0));
    // Wrong origin — must be ignored
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "stawi-login-complete" },
        origin: "https://evil.example",
      }),
    );
    // Give microtasks a tick
    await new Promise((r) => setTimeout(r, 10));
    // Promise should still be pending — simulate popup close to unblock
    popup.closed = true;
    await expect(promise).rejects.toMatchObject({ code: "OAUTH_POPUP_CLOSED" });
  });

  it("rejects and closes popup when abort signal fires", async () => {
    const close = vi.fn();
    const popup = { closed: false, close };
    vi.stubGlobal("open", () => popup);

    const ac = new AbortController();
    const promise = openLoginUrl(baseCfg, "https://i/login", { signal: ac.signal });
    await new Promise((r) => setTimeout(r, 0));
    ac.abort();
    await expect(promise).rejects.toMatchObject({ code: "OAUTH_POPUP_CLOSED" });
    expect(close).toHaveBeenCalled();
  });

  it("rejects with OAUTH_POPUP_CLOSED if signal already aborted", async () => {
    const close = vi.fn();
    const popup = { closed: false, close };
    vi.stubGlobal("open", () => popup);

    const ac = new AbortController();
    ac.abort();
    await expect(
      openLoginUrl(baseCfg, "https://i/login", { signal: ac.signal }),
    ).rejects.toMatchObject({ code: "OAUTH_POPUP_CLOSED" });
  });
});
