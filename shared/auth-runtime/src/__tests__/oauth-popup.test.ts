import { describe, it, expect, vi, beforeEach } from "vitest";
import { runOAuthPopup } from "../oauth-popup.js";

describe("runOAuthPopup", () => {
  beforeEach(() => { /* jsdom */ });

  it("throws OAUTH_POPUP_BLOCKED if window.open returns null", async () => {
    const core = {
      prepareAuth: vi.fn().mockResolvedValue({ authUrl: "https://i/auth?a=1", state: "s", verifier: "v" }),
      completeAuth: vi.fn(),
    } as any;
    vi.stubGlobal("open", () => null);
    const cfg = { redirectUri: "https://r/cb" } as any;
    await expect(runOAuthPopup(cfg, core)).rejects.toMatchObject({ code: "OAUTH_POPUP_BLOCKED" });
  });

  it("completes auth when postMessage arrives with matching origin", async () => {
    const core = {
      prepareAuth: vi.fn().mockResolvedValue({ authUrl: "https://i/auth?a=1", state: "s", verifier: "v" }),
      completeAuth: vi.fn().mockResolvedValue(undefined),
    } as any;
    const popup = { location: { href: "" }, closed: false, close: vi.fn() };
    vi.stubGlobal("open", () => popup);
    const cfg = { redirectUri: "https://r/cb" } as any;

    const promise = runOAuthPopup(cfg, core);
    // Wait for internal prepareAuth() await to resolve and listener to attach
    await new Promise((r) => setTimeout(r, 0));
    // Simulate callback page posting back
    window.dispatchEvent(new MessageEvent("message", {
      data: { type: "stawi-auth", code: "CODE", state: "s" },
      origin: "https://r",
    }));
    await promise;
    expect(core.completeAuth).toHaveBeenCalledWith({ code: "CODE", state: "s", verifier: "v", expectedState: "s" });
  });
});
