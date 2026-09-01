import { describe, it, expect } from "vitest";
import { createIdentityClient } from "../../services/identity-client.js";
import { IdentityError } from "../../services/errors.js";
import { concat, envelope } from "./envelope-fixture.js";

type Call = [string, any];

/** Mirrors @stawi/auth-runtime's AuthError as thrown by the worker API proxy
 *  on a non-2xx response: `API <status>: <first 200 bytes of body>`. */
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

describe("createIdentityClient", () => {
  it("posts unary JSON to the RPC path with the Connect header", async () => {
    const { calls, runtime } = fakeRuntime(() => ({
      data: { id: "o1", name: "Acme", code: "ACME" },
    }));
    const c = createIdentityClient({
      runtime,
      apiBaseUrl: "https://api.stawi.org/identity",
    });

    const saved = await c.organizationSave({ name: "Acme", code: "ACME" });

    expect(saved).toEqual({ id: "o1", name: "Acme", code: "ACME" });
    expect(calls[0][0]).toBe(
      "https://api.stawi.org/identity/identity.v1.IdentityService/OrganizationSave",
    );
    expect(calls[0][1].method).toBe("POST");
    expect(calls[0][1].headers["Content-Type"]).toBe("application/json");
    expect(calls[0][1].headers["Connect-Protocol-Version"]).toBe("1");
    expect(JSON.parse(calls[0][1].body)).toEqual({
      data: { name: "Acme", code: "ACME" },
    });
  });

  it("requests search RPCs as arraybuffer and flattens stream data", async () => {
    const { calls, runtime } = fakeRuntime(() =>
      concat(
        envelope(0, '{"data":[{"id":"t1"},{"id":"t2"}]}'),
        envelope(0, '{"data":[{"id":"t3"}]}'),
        envelope(2, "{}"),
      ),
    );
    const c = createIdentityClient({
      runtime,
      apiBaseUrl: "https://api.stawi.org/identity",
    });

    const teams = await c.internalTeamSearch({
      organizationId: "org1",
      cursor: { limit: 50 },
    });

    expect(teams.map((t) => t.id)).toEqual(["t1", "t2", "t3"]);
    expect(calls[0][0]).toBe(
      "https://api.stawi.org/identity/identity.v1.IdentityService/InternalTeamSearch",
    );
    expect(calls[0][1].responseType).toBe("arraybuffer");
    expect(JSON.parse(calls[0][1].body)).toEqual({
      organizationId: "org1",
      cursor: { limit: 50 },
    });
  });

  it("tolerates a single object in a stream data envelope", async () => {
    const { runtime } = fakeRuntime(() =>
      concat(envelope(0, '{"data":{"id":"u1"}}'), envelope(2, "{}")),
    );
    const c = createIdentityClient({
      runtime,
      apiBaseUrl: "https://api.stawi.org/identity",
    });

    expect((await c.orgUnitSearch({})).map((u) => u.id)).toEqual(["u1"]);
  });

  it("skips stream envelopes without data", async () => {
    const { runtime } = fakeRuntime(() =>
      concat(envelope(0, "{}"), envelope(2, "{}")),
    );
    const c = createIdentityClient({
      runtime,
      apiBaseUrl: "https://api.stawi.org/identity",
    });

    expect(await c.organizationSearch({})).toEqual([]);
  });

  it("strips a trailing slash from apiBaseUrl", async () => {
    const { calls, runtime } = fakeRuntime(() => ({ data: { id: "o1" } }));
    const c = createIdentityClient({
      runtime,
      apiBaseUrl: "https://api.stawi.org/identity/",
    });

    await c.organizationSave({ code: "ACME" });

    expect(calls[0][0]).toBe(
      "https://api.stawi.org/identity/identity.v1.IdentityService/OrganizationSave",
    );
  });

  it("throws invalid_response when a unary response is shapeless", async () => {
    const { runtime } = fakeRuntime(() => ({}));
    const c = createIdentityClient({
      runtime,
      apiBaseUrl: "https://api.stawi.org/identity",
    });

    const err = await c.organizationSave({ code: "ACME" }).catch((e) => e);

    expect(err.code).toBe("invalid_response");
  });

  it("surfaces the Connect error carried by a thrown AuthError", async () => {
    const { runtime } = fakeRuntime(() => {
      throw authError(
        "API_FORBIDDEN",
        'API 403: {"code":"permission_denied","message":"missing role"}',
      );
    });
    const c = createIdentityClient({
      runtime,
      apiBaseUrl: "https://api.stawi.org/identity",
    });

    const err = await c.organizationSave({ code: "ACME" }).catch((e) => e);

    expect(err).toBeInstanceOf(IdentityError);
    expect(err.code).toBe("permission_denied");
    expect(err.message).toContain("missing role");
  });

  it("surfaces a thrown Connect error from a search RPC too", async () => {
    const { runtime } = fakeRuntime(() => {
      throw authError(
        "API_UNAUTHORIZED",
        'API 401: {"code":"unauthenticated","message":"token expired"}',
      );
    });
    const c = createIdentityClient({
      runtime,
      apiBaseUrl: "https://api.stawi.org/identity",
    });

    const err = await c.internalTeamSearch({}).catch((e) => e);

    expect(err).toBeInstanceOf(IdentityError);
    expect(err.code).toBe("unauthenticated");
    expect(err.message).toContain("token expired");
  });

  it("falls back to the AuthError code when the body is not a Connect error", async () => {
    const { runtime } = fakeRuntime(() => {
      throw authError("API_SERVER_ERROR", "API 500: upstream exploded");
    });
    const c = createIdentityClient({
      runtime,
      apiBaseUrl: "https://api.stawi.org/identity",
    });

    const err = await c.organizationSave({ code: "ACME" }).catch((e) => e);

    expect(err.code).toBe("API_SERVER_ERROR");
    expect(err.message).toContain("upstream exploded");
  });

  it("falls back to the AuthError code when the body JSON is truncated", async () => {
    const { runtime } = fakeRuntime(() => {
      throw authError("API_SERVER_ERROR", 'API 500: {"code":"internal","mess');
    });
    const c = createIdentityClient({
      runtime,
      apiBaseUrl: "https://api.stawi.org/identity",
    });

    const err = await c.organizationSave({ code: "ACME" }).catch((e) => e);

    expect(err.code).toBe("API_SERVER_ERROR");
    expect(err.message).toContain("API 500");
  });

  it("wraps a non-Error rejection", async () => {
    const { runtime } = fakeRuntime(() => {
      throw "boom";
    });
    const c = createIdentityClient({
      runtime,
      apiBaseUrl: "https://api.stawi.org/identity",
    });

    const err = await c.organizationSave({ code: "ACME" }).catch((e) => e);

    expect(err).toBeInstanceOf(IdentityError);
    expect(err.code).toBe("unknown");
    expect(err.message).toContain("boom");
  });

  it("passes an already-normalised IdentityError through unchanged", async () => {
    const original = new IdentityError("aborted", "aborted: cancelled");
    const { runtime } = fakeRuntime(() => {
      throw original;
    });
    const c = createIdentityClient({
      runtime,
      apiBaseUrl: "https://api.stawi.org/identity",
    });

    await expect(c.organizationSave({ code: "ACME" })).rejects.toBe(original);
  });

  it("surfaces a resolved Connect error body that carries no data", async () => {
    const { runtime } = fakeRuntime(() => ({
      code: "not_found",
      message: "no such organization",
    }));
    const c = createIdentityClient({
      runtime,
      apiBaseUrl: "https://api.stawi.org/identity",
    });

    const err = await c.organizationSave({ code: "ACME" }).catch((e) => e);

    expect(err.code).toBe("not_found");
    expect(err.message).toContain("no such organization");
  });

  it("maps every RPC to its Connect method name", async () => {
    const unaryResponse = { data: { id: "x" } };
    const streamResponse = concat(
      envelope(0, '{"data":[{"id":"x"}]}'),
      envelope(2, "{}"),
    );
    const { calls, runtime } = fakeRuntime((_path, init) =>
      init?.responseType === "arraybuffer" ? streamResponse : unaryResponse,
    );
    const c = createIdentityClient({
      runtime,
      apiBaseUrl: "https://api.stawi.org/identity",
    });

    await c.organizationSearch({ query: "a" });
    await c.orgUnitSearch({ rootOnly: true });
    await c.orgUnitSave({ code: "U" });
    await c.workforceMemberSearch({ homeOrgUnitId: "u1" });
    await c.workforceMemberGet("m1");
    await c.workforceMemberSave({ profileId: "p1" });
    await c.internalTeamSave({ code: "T" });
    await c.teamMembershipSearch({ teamId: "t1" });
    await c.teamMembershipSave({ memberId: "m1" });
    await c.accessRoleAssignmentSearch({ roleKey: "admin" });
    await c.accessRoleAssignmentSave({ roleKey: "admin" });

    expect(
      calls.map(([path]) =>
        path.replace(
          "https://api.stawi.org/identity/identity.v1.IdentityService/",
          "",
        ),
      ),
    ).toEqual([
      "OrganizationSearch",
      "OrgUnitSearch",
      "OrgUnitSave",
      "WorkforceMemberSearch",
      "WorkforceMemberGet",
      "WorkforceMemberSave",
      "InternalTeamSave",
      "TeamMembershipSearch",
      "TeamMembershipSave",
      "AccessRoleAssignmentSearch",
      "AccessRoleAssignmentSave",
    ]);
  });

  it("sends the id in the get request body", async () => {
    const { calls, runtime } = fakeRuntime(() => ({ data: { id: "m1" } }));
    const c = createIdentityClient({
      runtime,
      apiBaseUrl: "https://api.stawi.org/identity",
    });

    await c.workforceMemberGet("m1");

    expect(JSON.parse(calls[0][1].body)).toEqual({ id: "m1" });
  });
});
