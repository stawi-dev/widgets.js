import { describe, it, expect } from "vitest";
import { createIdentityClient } from "../../services/identity-client.js";
import { concat, envelope } from "./envelope-fixture.js";

type Call = [string, any];

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

  it("throws IdentityError when a unary response carries no data", async () => {
    const { runtime } = fakeRuntime(() => ({}));
    const c = createIdentityClient({
      runtime,
      apiBaseUrl: "https://api.stawi.org/identity",
    });

    await expect(c.organizationSave({ code: "ACME" })).rejects.toThrow(
      /empty response/i,
    );
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
