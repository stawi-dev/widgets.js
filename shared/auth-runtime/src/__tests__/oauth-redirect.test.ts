import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { startRedirect, completeRedirect, __redirectInternals } from "../oauth-redirect.js";

const cfg = { redirectUri: "https://r/cb" } as never;

function makeCore(overrides: Partial<{
  prepareAuth: () => Promise<{ authUrl: string; state: string; verifier: string }>;
  completeAuth: (a: { code: string; state: string; verifier: string; expectedState: string }) => Promise<void>;
}> = {}) {
  return {
    prepareAuth: overrides.prepareAuth ?? vi.fn().mockResolvedValue({
      authUrl: "https://idp/auth?x=1",
      state: "STATE",
      verifier: "VERIFIER",
    }),
    completeAuth: overrides.completeAuth ?? vi.fn().mockResolvedValue(undefined),
  } as never;
}

// jsdom's window.location is a sealed Location object — individual
// properties like `assign` / `search` can't be redefined with
// Object.defineProperty. Replacing the entire `location` property on
// `window` is the cleanest jsdom-friendly route. Helper keeps the
// per-test setup terse.
function stubLocation(parts: { pathname?: string; search?: string; assign?: (url: string) => void }): void {
  const fake = {
    pathname: parts.pathname ?? "/",
    search: parts.search ?? "",
    assign: parts.assign ?? (() => {}),
  } as unknown as Location;
  Object.defineProperty(window, "location", { configurable: true, value: fake });
}

describe("startRedirect", () => {
  let assignSpy: ReturnType<typeof vi.fn>;
  let originalLocation: Location;

  beforeEach(() => {
    sessionStorage.clear();
    originalLocation = window.location;
    assignSpy = vi.fn();
    stubLocation({ pathname: "/jobs/", search: "?from=nav", assign: assignSpy });
  });

  afterEach(() => {
    sessionStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("writes state/verifier/returnTo to sessionStorage and navigates", async () => {
    const core = makeCore();
    void startRedirect(cfg, core);
    await new Promise((r) => setTimeout(r, 0));

    expect(assignSpy).toHaveBeenCalledWith("https://idp/auth?x=1");
    const raw = sessionStorage.getItem(__redirectInternals.STASH_KEY)!;
    expect(JSON.parse(raw)).toEqual({ state: "STATE", verifier: "VERIFIER", returnTo: "/jobs/?from=nav" });
  });
});

describe("completeRedirect", () => {
  let originalLocation: Location;

  beforeEach(() => {
    sessionStorage.clear();
    originalLocation = window.location;
    stubLocation({ search: "?code=CODE&state=STATE" });
  });

  afterEach(() => {
    sessionStorage.clear();
    Object.defineProperty(window, "location", { configurable: true, value: originalLocation });
  });

  it("happy path: completes auth and returns stashed returnTo", async () => {
    sessionStorage.setItem(__redirectInternals.STASH_KEY, JSON.stringify({
      state: "STATE", verifier: "VERIFIER", returnTo: "/dashboard/",
    }));
    const completeAuth = vi.fn().mockResolvedValue(undefined);
    const core = makeCore({ completeAuth });

    const { returnTo } = await completeRedirect(cfg, core);

    expect(completeAuth).toHaveBeenCalledWith({
      code: "CODE", state: "STATE", verifier: "VERIFIER", expectedState: "STATE",
    });
    expect(returnTo).toBe("/dashboard/");
    expect(sessionStorage.getItem(__redirectInternals.STASH_KEY)).toBeNull();
  });

  it("throws OAUTH_REDIRECT_STORAGE_MISSING when stash is absent", async () => {
    const core = makeCore();
    await expect(completeRedirect(cfg, core)).rejects.toMatchObject({
      code: "OAUTH_REDIRECT_STORAGE_MISSING",
    });
  });

  it("throws OAUTH_FAILED when callback URL is missing code/state", async () => {
    stubLocation({ search: "" });
    sessionStorage.setItem(__redirectInternals.STASH_KEY, JSON.stringify({
      state: "STATE", verifier: "VERIFIER", returnTo: "/",
    }));
    const core = makeCore();
    await expect(completeRedirect(cfg, core)).rejects.toMatchObject({ code: "OAUTH_FAILED" });
    expect(sessionStorage.getItem(__redirectInternals.STASH_KEY)).toBeNull();
  });

  it("clears the stash even when core.completeAuth rejects", async () => {
    sessionStorage.setItem(__redirectInternals.STASH_KEY, JSON.stringify({
      state: "STATE", verifier: "VERIFIER", returnTo: "/",
    }));
    const completeAuth = vi.fn().mockRejectedValue(new Error("token exchange failed"));
    const core = makeCore({ completeAuth });
    await expect(completeRedirect(cfg, core)).rejects.toThrow();
    expect(sessionStorage.getItem(__redirectInternals.STASH_KEY)).toBeNull();
  });
});
