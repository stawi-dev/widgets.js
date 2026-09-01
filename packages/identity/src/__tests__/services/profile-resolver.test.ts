import { describe, it, expect, vi } from "vitest";
import { createProfileResolver } from "../../services/profile-resolver.js";

const BASE = "https://api.example.test/profile";
const GET_BY_ID = `${BASE}/profile.v1.ProfileService/GetById`;
const GET_BY_CONTACT = `${BASE}/profile.v1.ProfileService/GetByContact`;

function profileBody(id: string, name?: string) {
  return {
    data: {
      id,
      properties: name ? { au_name: name } : {},
      contacts: [
        { type: "EMAIL", detail: `${id}@example.test` },
        { type: "MSISDN", detail: "+254700000000" },
      ],
    },
  };
}

function bodyId(init: unknown): string {
  return JSON.parse((init as { body: string }).body).id as string;
}

describe("createProfileResolver", () => {
  it("resolves ids to summaries via GetById", async () => {
    const fetch = vi.fn(async (_url: string, init: unknown) =>
      profileBody(bodyId(init), `Name ${bodyId(init)}`),
    );
    const resolver = createProfileResolver({
      runtime: { fetch } as never,
      profileApiBaseUrl: BASE,
    });

    const out = await resolver.resolve(["a", "b"]);

    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0]![0]).toBe(GET_BY_ID);
    expect(out.get("a")).toEqual({
      id: "a",
      name: "Name a",
      email: "a@example.test",
      phone: "+254700000000",
    });
    expect(out.get("b")?.name).toBe("Name b");
  });

  it("caches resolved ids and de-duplicates the input", async () => {
    const fetch = vi.fn(async (_url: string, init: unknown) =>
      profileBody(bodyId(init)),
    );
    const resolver = createProfileResolver({
      runtime: { fetch } as never,
      profileApiBaseUrl: BASE,
    });

    await resolver.resolve(["a", "a", "b"]);
    expect(fetch).toHaveBeenCalledTimes(2);

    const again = await resolver.resolve(["a", "b"]);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(again.get("a")?.id).toBe("a");
  });

  it("keeps at most four requests in flight", async () => {
    let inFlight = 0;
    let peak = 0;
    const release: Array<() => void> = [];
    const fetch = vi.fn((_url: string, init: unknown) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      const id = bodyId(init);
      return new Promise((resolve) => {
        release.push(() => {
          inFlight -= 1;
          resolve(profileBody(id));
        });
      });
    });
    const resolver = createProfileResolver({
      runtime: { fetch } as never,
      profileApiBaseUrl: BASE,
    });

    const ids = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    const pending = resolver.resolve(ids);

    // Drain the queue, releasing whatever is currently in flight.
    for (let guard = 0; guard < 100 && release.length > 0; guard += 1) {
      release.splice(0).forEach((fn) => fn());
      await new Promise((r) => setTimeout(r, 0));
    }

    const out = await pending;
    expect(out.size).toBe(ids.length);
    expect(peak).toBeLessThanOrEqual(4);
    expect(peak).toBe(4);
  });

  it("disables itself after a permission failure and never retries", async () => {
    const fetch = vi.fn(async () => {
      throw Object.assign(new Error("API 403: forbidden"), {
        code: "API_FORBIDDEN",
      });
    });
    const resolver = createProfileResolver({
      runtime: { fetch } as never,
      profileApiBaseUrl: BASE,
    });

    expect((await resolver.resolve(["a"])).size).toBe(0);
    const callsAfterFirst = fetch.mock.calls.length;

    expect((await resolver.resolve(["b"])).size).toBe(0);
    expect(await resolver.byContact("a@example.test")).toBeNull();
    expect(fetch.mock.calls.length).toBe(callsAfterFirst);
  });

  it("disables itself on a Connect permission_denied too", async () => {
    const fetch = vi.fn(async () => {
      throw Object.assign(
        new Error('API 403: {"code":"permission_denied","message":"no"}'),
        { code: "API_VALIDATION" },
      );
    });
    const resolver = createProfileResolver({
      runtime: { fetch } as never,
      profileApiBaseUrl: BASE,
    });

    await resolver.resolve(["a"]);
    await resolver.resolve(["b"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("skips ids that fail for other reasons without failing the batch", async () => {
    const fetch = vi.fn(async (_url: string, init: unknown) => {
      if (bodyId(init) === "a") throw new Error("boom");
      return profileBody(bodyId(init));
    });
    const resolver = createProfileResolver({
      runtime: { fetch } as never,
      profileApiBaseUrl: BASE,
    });

    const out = await resolver.resolve(["a", "b"]);
    expect(out.has("a")).toBe(false);
    expect(out.get("b")?.id).toBe("b");
  });

  it("byContact returns a summary on a hit and populates the id cache", async () => {
    const fetch = vi.fn(async () => profileBody("p1", "Ada"));
    const resolver = createProfileResolver({
      runtime: { fetch } as never,
      profileApiBaseUrl: BASE,
    });

    const hit = await resolver.byContact("p1@example.test");
    expect(fetch).toHaveBeenCalledWith(GET_BY_CONTACT, expect.anything());
    expect(hit).toEqual({
      id: "p1",
      name: "Ada",
      email: "p1@example.test",
      phone: "+254700000000",
    });

    await resolver.resolve(["p1"]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("byContact returns null when the contact is unknown", async () => {
    const fetch = vi.fn(async () => {
      throw Object.assign(new Error("API 404: not found"), {
        code: "API_NOT_FOUND",
      });
    });
    const resolver = createProfileResolver({
      runtime: { fetch } as never,
      profileApiBaseUrl: BASE,
    });

    expect(await resolver.byContact("nobody@example.test")).toBeNull();
  });

  it("byContact rethrows unexpected failures", async () => {
    const fetch = vi.fn(async () => {
      throw new Error("boom");
    });
    const resolver = createProfileResolver({
      runtime: { fetch } as never,
      profileApiBaseUrl: BASE,
    });

    await expect(resolver.byContact("x@example.test")).rejects.toThrow(/boom/);
  });

  it("evicts the least recently used entry past 500 profiles", async () => {
    const fetch = vi.fn(async (_url: string, init: unknown) =>
      profileBody(bodyId(init)),
    );
    const resolver = createProfileResolver({
      runtime: { fetch } as never,
      profileApiBaseUrl: BASE,
    });

    const ids = Array.from({ length: 500 }, (_, i) => `p${i}`);
    await resolver.resolve(ids);
    expect(fetch).toHaveBeenCalledTimes(500);

    // Touch p0 so it becomes the most recent, then overflow by one.
    await resolver.resolve(["p0"]);
    await resolver.resolve(["overflow"]);
    expect(fetch).toHaveBeenCalledTimes(501);

    // p1 was the least recently used and is gone; p0 is still cached.
    await resolver.resolve(["p0"]);
    expect(fetch).toHaveBeenCalledTimes(501);
    await resolver.resolve(["p1"]);
    expect(fetch).toHaveBeenCalledTimes(502);
  });
});
