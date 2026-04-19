import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { fetchT } from "../../worker/fetchWithTimeout.js";
import { AuthError } from "../../shared/errors.js";

describe("fetchT", () => {
  let origFetch: typeof fetch;
  beforeEach(() => { origFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = origFetch; });

  it("returns response on fast fetch", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(new Response("ok", { status: 200 }));
    const r = await fetchT("http://x", {}, 1000);
    expect(r.status).toBe(200);
  });

  it("throws NETWORK_TIMEOUT when fetch exceeds timeout", async () => {
    globalThis.fetch = vi.fn().mockImplementation((_, init: RequestInit) =>
      new Promise((_res, rej) => init.signal!.addEventListener("abort", () => rej(new Error("aborted"))))
    );
    await expect(fetchT("http://x", {}, 10)).rejects.toMatchObject({ code: "NETWORK_TIMEOUT" });
  });

  it("wraps network errors as NETWORK_ERROR", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new TypeError("net"));
    await expect(fetchT("http://x", {}, 100)).rejects.toMatchObject({ code: "NETWORK_ERROR" });
  });
});
