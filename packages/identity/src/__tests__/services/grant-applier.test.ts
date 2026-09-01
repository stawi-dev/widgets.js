import { describe, it, expect, vi } from "vitest";
import { applyGrants } from "../../services/grant-applier.js";
import type { TenancyClient } from "../../services/tenancy-client.js";

const NS = "service_imports";

function makeTenancy(overrides: Partial<TenancyClient> = {}): TenancyClient {
  return {
    listServiceNamespaces: vi.fn().mockResolvedValue([]),
    grantPermission: vi.fn().mockResolvedValue(undefined),
    revokePermission: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

describe("applyGrants", () => {
  it("grants then revokes, sequentially and in order", async () => {
    const calls: string[] = [];
    const tenancy = makeTenancy({
      grantPermission: vi.fn(async (p) => {
        calls.push(`grant:${p.permission}`);
      }),
      revokePermission: vi.fn(async (p) => {
        calls.push(`revoke:${p.permission}`);
      }),
    });

    const result = await applyGrants(
      tenancy,
      "p1",
      { grant: ["quotes_view", "quotes_create"], revoke: ["orders_view"] },
      NS,
    );

    expect(result.failed).toEqual([]);
    expect(calls).toEqual([
      "grant:quotes_view",
      "grant:quotes_create",
      "revoke:orders_view",
    ]);
    expect(tenancy.grantPermission).toHaveBeenCalledWith({
      namespace: NS,
      permission: "quotes_view",
      profileId: "p1",
    });
  });

  it("continues past a failure and records it", async () => {
    const tenancy = makeTenancy({
      grantPermission: vi.fn(async (p) => {
        if (p.permission === "quotes_view") throw new Error("boom");
      }),
      revokePermission: vi.fn().mockRejectedValue("nope"),
    });

    const result = await applyGrants(
      tenancy,
      "p1",
      { grant: ["quotes_view", "quotes_create"], revoke: ["orders_view"] },
      NS,
    );

    expect(result.failed).toEqual([
      { permission: "quotes_view", op: "grant", error: "boom" },
      { permission: "orders_view", op: "revoke", error: "nope" },
    ]);
    expect(tenancy.grantPermission).toHaveBeenCalledTimes(2);
  });

  it("does nothing for an empty diff", async () => {
    const tenancy = makeTenancy();
    const result = await applyGrants(
      tenancy,
      "p1",
      { grant: [], revoke: [] },
      NS,
    );
    expect(result.failed).toEqual([]);
    expect(tenancy.grantPermission).not.toHaveBeenCalled();
    expect(tenancy.revokePermission).not.toHaveBeenCalled();
  });
});
