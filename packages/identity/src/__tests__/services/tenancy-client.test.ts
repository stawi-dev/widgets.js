import { describe, it, expect } from "vitest";
import {
  createTenancyClient,
  deriveTenancyApiBaseUrl,
} from "../../services/tenancy-client.js";
import { IdentityError } from "../../services/errors.js";

type Call = [string, any];

/** Mirrors @stawi/auth-runtime's AuthError on a non-2xx response. */
function authError(code: string, message: string): Error & { code: string } {
  const err = new Error(message) as Error & { code: string };
  err.name = "AuthError";
  err.code = code;
  return err;
}

function fakeRuntime(respond: (path: string, init: any) => unknown) {
  const calls: Call[] = [];
  return {
    calls,
    runtime: {
      fetch: async (path: string, init?: any) => {
        calls.push([path, init]);
        return respond(path, init) as never;
      },
    },
  };
}

const BASE = "https://api.stawi.org/tenancy";
const SVC = `${BASE}/tenancy.v1.TenancyService`;

describe("createTenancyClient", () => {
  it("posts an empty body to ListServiceNamespaces and returns the catalogue", async () => {
    const { calls, runtime } = fakeRuntime(() => ({
      data: [
        {
          namespace: "service_imports",
          permissions: ["requests_view", "assign"],
          roleBindings: { operator: { permissions: ["requests_view"] } },
          registeredAt: "2026-01-01T00:00:00Z",
        },
      ],
    }));
    const c = createTenancyClient({ runtime, apiBaseUrl: BASE });

    const namespaces = await c.listServiceNamespaces();

    expect(namespaces).toEqual([
      {
        namespace: "service_imports",
        permissions: ["requests_view", "assign"],
        roleBindings: { operator: { permissions: ["requests_view"] } },
        registeredAt: "2026-01-01T00:00:00Z",
      },
    ]);
    expect(calls[0][0]).toBe(`${SVC}/ListServiceNamespaces`);
    expect(calls[0][1].method).toBe("POST");
    expect(calls[0][1].headers["Content-Type"]).toBe("application/json");
    expect(calls[0][1].headers["Connect-Protocol-Version"]).toBe("1");
    expect(JSON.parse(calls[0][1].body)).toEqual({});
  });

  it("returns an empty catalogue when the response carries no data", async () => {
    const { runtime } = fakeRuntime(() => ({}));
    const c = createTenancyClient({ runtime, apiBaseUrl: BASE });

    expect(await c.listServiceNamespaces()).toEqual([]);
  });

  it("strips a trailing slash from apiBaseUrl", async () => {
    const { calls, runtime } = fakeRuntime(() => ({ data: [] }));
    const c = createTenancyClient({ runtime, apiBaseUrl: `${BASE}/` });

    await c.listServiceNamespaces();

    expect(calls[0][0]).toBe(`${SVC}/ListServiceNamespaces`);
  });

  it("posts namespace, permission and profileId to GrantPermission", async () => {
    const { calls, runtime } = fakeRuntime(() => ({}));
    const c = createTenancyClient({ runtime, apiBaseUrl: BASE });

    await expect(
      c.grantPermission({
        namespace: "service_imports",
        permission: "assign",
        profileId: "p1",
      }),
    ).resolves.toBeUndefined();

    expect(calls[0][0]).toBe(`${SVC}/GrantPermission`);
    expect(calls[0][1].headers["Connect-Protocol-Version"]).toBe("1");
    expect(JSON.parse(calls[0][1].body)).toEqual({
      namespace: "service_imports",
      permission: "assign",
      profileId: "p1",
    });
  });

  it("treats any 2xx body as success for RevokePermission", async () => {
    const { calls, runtime } = fakeRuntime(() => ({ data: { ok: true } }));
    const c = createTenancyClient({ runtime, apiBaseUrl: BASE });

    await expect(
      c.revokePermission({
        namespace: "service_imports",
        permission: "assign",
        profileId: "p1",
      }),
    ).resolves.toBeUndefined();

    expect(calls[0][0]).toBe(`${SVC}/RevokePermission`);
  });

  it("normalises a Connect permission_denied into an IdentityError", async () => {
    const { runtime } = fakeRuntime(() => {
      throw authError(
        "forbidden",
        'API 403: {"code":"permission_denied","message":"service_tenancy:permission_grant required"}',
      );
    });
    const c = createTenancyClient({ runtime, apiBaseUrl: BASE });

    const err = await c.listServiceNamespaces().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(IdentityError);
    expect((err as IdentityError).code).toBe("permission_denied");
    expect((err as IdentityError).message).toContain(
      "service_tenancy:permission_grant required",
    );
  });

  it("throws when a 200 body is a bare Connect error", async () => {
    const { runtime } = fakeRuntime(() => ({
      code: "permission_denied",
      message: "nope",
    }));
    const c = createTenancyClient({ runtime, apiBaseUrl: BASE });

    await expect(c.listServiceNamespaces()).rejects.toMatchObject({
      code: "permission_denied",
    });
    await expect(
      c.grantPermission({
        namespace: "service_imports",
        permission: "assign",
        profileId: "p1",
      }),
    ).rejects.toMatchObject({ code: "permission_denied" });
  });

  it("normalises a transport failure without a Connect body", async () => {
    const { runtime } = fakeRuntime(() => {
      throw new Error("network down");
    });
    const c = createTenancyClient({ runtime, apiBaseUrl: BASE });

    const err = await c
      .revokePermission({
        namespace: "service_imports",
        permission: "assign",
        profileId: "p1",
      })
      .catch((e: unknown) => e);

    expect(err).toBeInstanceOf(IdentityError);
    expect((err as IdentityError).code).toBe("unknown");
  });
});

describe("deriveTenancyApiBaseUrl", () => {
  it("swaps the last path segment for tenancy", () => {
    expect(deriveTenancyApiBaseUrl("https://api.stawi.org/identity")).toBe(
      "https://api.stawi.org/tenancy",
    );
  });

  it("ignores a trailing slash", () => {
    expect(deriveTenancyApiBaseUrl("https://api.stawi.org/identity/")).toBe(
      "https://api.stawi.org/tenancy",
    );
  });

  it("appends when the URL has no path", () => {
    expect(deriveTenancyApiBaseUrl("https://api.stawi.org")).toBe(
      "https://api.stawi.org/tenancy",
    );
    expect(deriveTenancyApiBaseUrl("https://api.stawi.org/")).toBe(
      "https://api.stawi.org/tenancy",
    );
  });

  it("keeps deeper path prefixes", () => {
    expect(
      deriveTenancyApiBaseUrl("https://api.example.com/api/v1/identity"),
    ).toBe("https://api.example.com/api/v1/tenancy");
  });

  it("handles a path-only base URL", () => {
    expect(deriveTenancyApiBaseUrl("/identity")).toBe("/tenancy");
  });
});
