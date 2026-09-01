import { describe, it, expect, vi } from "vitest";
import { resolveConfig, resolveApiUrl } from "../shared/config.js";
import { AuthError } from "../shared/errors.js";
import type { AuthState } from "../shared/types.js";

const base = { clientId: "c", apiBaseUrl: "https://api.stawi.trade" };

describe("resolveApiUrl", () => {
  it("prefixes relative paths with apiBaseUrl", () => {
    expect(resolveApiUrl(resolveConfig(base), "/x/Y")).toBe(
      "https://api.stawi.trade/x/Y",
    );
  });
  it("accepts absolute URLs on the apiBaseUrl origin", () => {
    expect(
      resolveApiUrl(resolveConfig(base), "https://api.stawi.trade/x"),
    ).toBe("https://api.stawi.trade/x");
  });
  it("accepts absolute URLs on an allowed origin", () => {
    const cfg = resolveConfig({
      ...base,
      allowedApiOrigins: ["https://api.stawi.org"],
    });
    expect(resolveApiUrl(cfg, "https://api.stawi.org/identity/x")).toBe(
      "https://api.stawi.org/identity/x",
    );
  });
  it("rejects absolute URLs on other origins", () => {
    expect(() =>
      resolveApiUrl(resolveConfig(base), "https://evil.example/x"),
    ).toThrow(AuthError);
  });
  it("normalizes an allowedApiOrigins entry given with a path to its bare origin", () => {
    const cfg = resolveConfig({
      ...base,
      allowedApiOrigins: ["https://api.stawi.org/identity"],
    });
    expect(cfg.allowedApiOrigins).toEqual(["https://api.stawi.org"]);
    expect(resolveApiUrl(cfg, "https://api.stawi.org/identity/x")).toBe(
      "https://api.stawi.org/identity/x",
    );
  });
  it("normalizes an allowedApiOrigins entry with an uppercase host to match", () => {
    const cfg = resolveConfig({
      ...base,
      allowedApiOrigins: ["https://API.stawi.org"],
    });
    expect(resolveApiUrl(cfg, "https://api.stawi.org/x")).toBe(
      "https://api.stawi.org/x",
    );
  });
  it("throws INVALID_CONFIG at resolveConfig time for an invalid allowedApiOrigins entry", () => {
    expect(() =>
      resolveConfig({ ...base, allowedApiOrigins: ["not-a-url"] }),
    ).toThrow(AuthError);
  });
});

// Module-level mock of the worker core so runtime.fetch's parse() logic can
// be exercised without spinning up a real worker/IndexedDB session.
const coreFetchMock = vi.fn();

vi.mock("../worker/auth-worker.js", () => ({
  createWorkerCore: vi.fn(async () => ({
    state: "unauthenticated",
    namespace: "ns",
    prepareAuth: vi.fn(),
    completeAuth: vi.fn(),
    completeFedcm: vi.fn(),
    getAccessToken: vi.fn(),
    fetch: coreFetchMock,
    upload: vi.fn(),
    getRoles: vi.fn(),
    getClaims: vi.fn(),
    logout: vi.fn().mockResolvedValue({}),
    destroy: vi.fn(),
    onState: (cb: (s: AuthState) => void) => {
      cb("unauthenticated");
      return () => {};
    },
    onSecurity: () => () => {},
  })),
}));

// Import after the mock is registered.
import { createAuthRuntime } from "../runtime.js";

function waitForState(
  rt: ReturnType<typeof createAuthRuntime>,
  target: string,
): Promise<void> {
  return new Promise<void>((resolve) => {
    const off = rt.onAuthStateChange((s) => {
      if (s === target) {
        off();
        resolve();
      }
    });
  });
}

describe("runtime.fetch responseType", () => {
  it("responseType: arraybuffer returns the raw ArrayBuffer", async () => {
    const body = new TextEncoder().encode('{"a":1}').buffer;
    coreFetchMock.mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/connect+json" },
      body,
    });
    const rt = createAuthRuntime({
      clientId: "c",
      apiBaseUrl: "https://a",
      skipFedCM: true,
    });
    await waitForState(rt, "unauthenticated");
    const result = await rt.fetch("/x", { responseType: "arraybuffer" });
    expect(result).toBe(body);
    rt.destroy();
  });

  it("default (no responseType) still JSON-parses application/json", async () => {
    const body = new TextEncoder().encode('{"a":1}').buffer;
    coreFetchMock.mockResolvedValue({
      status: 200,
      headers: { "content-type": "application/json" },
      body,
    });
    const rt = createAuthRuntime({
      clientId: "c",
      apiBaseUrl: "https://a",
      skipFedCM: true,
    });
    await waitForState(rt, "unauthenticated");
    const result = await rt.fetch("/x");
    expect(result).toEqual({ a: 1 });
    rt.destroy();
  });
});
