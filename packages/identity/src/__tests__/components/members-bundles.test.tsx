import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import {
  IdentityProvider,
  useIdentity,
  type MemberChangeEvent,
} from "../../context/identity-context.js";
import { MembersView } from "../../components/members/MembersView.js";
import type { IdentityClient } from "../../services/identity-client.js";
import type { TenancyClient } from "../../services/tenancy-client.js";
import type { PermissionModel } from "../../permissions/types.js";
import type { ProfileResolver } from "../../services/profile-resolver.js";
import type { Organization, WorkforceMember } from "../../types.js";

const ORG: Organization = { id: "o1", name: "Acme", code: "ACME" };
const NS = "service_imports";

const AGENT_PERMISSIONS = ["vehicles_view", "requests_view", "quotes_view"];
const SALES_PERMISSIONS = ["quotes_view", "quotes_create", "assign"];

const MODEL: PermissionModel = {
  namespaces: [
    {
      namespace: NS,
      label: "Imports",
      bundles: [
        {
          key: "sales",
          label: "Sales",
          platformRole: "member",
          permissions: SALES_PERMISSIONS,
        },
        {
          key: "sales_agent",
          label: "Sales agent",
          platformRole: "member",
          scoped: true,
          permissions: AGENT_PERMISSIONS,
        },
      ],
    },
  ],
};

function member(over: Partial<WorkforceMember> = {}): WorkforceMember {
  return {
    id: "m1",
    organizationId: "o1",
    profileId: "p1",
    engagementType: "employee",
    state: "CREATED",
    ...over,
  };
}

/** A member carrying the sales_agent bundle and its recorded grants. */
function agent(over: Partial<WorkforceMember> = {}): WorkforceMember {
  return member({
    properties: {
      access_bundle: { [NS]: "sales_agent" },
      permission_grants: { [NS]: [...AGENT_PERMISSIONS] },
    },
    ...over,
  });
}

function makeClient(overrides: Partial<IdentityClient> = {}): IdentityClient {
  return {
    organizationSearch: vi.fn().mockResolvedValue([]),
    organizationSave: vi.fn(),
    orgUnitSearch: vi.fn().mockResolvedValue([]),
    orgUnitSave: vi.fn(),
    workforceMemberSearch: vi.fn().mockResolvedValue([]),
    workforceMemberGet: vi.fn(),
    workforceMemberSave: vi.fn().mockResolvedValue(member()),
    internalTeamSearch: vi.fn(),
    internalTeamSave: vi.fn(),
    teamMembershipSearch: vi.fn(),
    teamMembershipSave: vi.fn(),
    accessRoleAssignmentSearch: vi.fn(),
    accessRoleAssignmentSave: vi.fn(),
    ...overrides,
  } as IdentityClient;
}

function makeResolver(): ProfileResolver {
  return {
    resolve: vi.fn().mockResolvedValue(new Map()),
    byContact: vi.fn().mockResolvedValue(null),
  };
}

function makeTenancy(overrides: Partial<TenancyClient> = {}): TenancyClient {
  return {
    listServiceNamespaces: vi.fn().mockResolvedValue([]),
    grantPermission: vi.fn().mockResolvedValue(undefined),
    revokePermission: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function SelectOrganization({ children }: { children: ReactNode }) {
  const { organization, setOrganization } = useIdentity();
  useEffect(() => {
    setOrganization(ORG);
  }, [setOrganization]);
  return organization ? <>{children}</> : null;
}

interface Options {
  client: IdentityClient;
  tenancy?: TenancyClient;
  permissionModel?: PermissionModel;
  onMemberChange?: (event: MemberChangeEvent) => void;
}

function renderMembers(options: Options) {
  const { client, tenancy = makeTenancy(), onMemberChange } = options;
  // An explicit `permissionModel: undefined` means "no model", so the key
  // is checked rather than defaulted.
  const permissionModel =
    "permissionModel" in options ? options.permissionModel : MODEL;
  render(
    <IdentityProvider
      client={client}
      tenancy={tenancy}
      permissionModel={permissionModel}
      onMemberChange={onMemberChange}
      profileResolver={makeResolver()}
    >
      <SelectOrganization>
        <MembersView />
      </SelectOrganization>
    </IdentityProvider>,
  );
  return { client, tenancy };
}

describe("members with access bundles", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the bundle column with a scope marker instead of the role", async () => {
    renderMembers({
      client: makeClient({
        workforceMemberSearch: vi.fn().mockResolvedValue([agent()]),
      }),
    });

    expect(await screen.findByText("Sales agent")).toBeTruthy();
    expect(screen.getByText("Access bundle")).toBeTruthy();
    expect(screen.getByText("Team scope")).toBeTruthy();
    expect(screen.queryByText("Platform role")).toBeNull();
  });

  it("activates a member and grants the bundle's permissions in order", async () => {
    const calls: string[] = [];
    const save = vi.fn(async (m: Partial<WorkforceMember>) => {
      calls.push(`save:${m.state}`);
      return { ...agent(), state: "ACTIVE" } as WorkforceMember;
    });
    const tenancy = makeTenancy({
      grantPermission: vi.fn(async (p) => {
        calls.push(`grant:${p.permission}`);
      }),
    });
    const changes: MemberChangeEvent[] = [];
    renderMembers({
      client: makeClient({
        workforceMemberSearch: vi.fn().mockResolvedValue([agent()]),
        workforceMemberSave: save,
      }),
      tenancy,
      onMemberChange: (e) => changes.push(e),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));

    await waitFor(() => expect(calls.length).toBe(4));
    // The record is written first, then the grants, in bundle order.
    expect(calls).toEqual([
      "save:ACTIVE",
      "grant:vehicles_view",
      "grant:requests_view",
      "grant:quotes_view",
    ]);
    expect(tenancy.grantPermission).toHaveBeenCalledWith({
      namespace: NS,
      permission: "vehicles_view",
      profileId: "p1",
    });
    expect(changes).toEqual([
      { member: { ...agent(), state: "ACTIVE" }, change: "activated" },
    ]);
  });

  it("keeps the member active and retries only the failed grants", async () => {
    const save = vi
      .fn()
      .mockResolvedValue({ ...agent(), state: "ACTIVE" } as WorkforceMember);
    const grant = vi.fn(async (p: { permission: string }) => {
      if (p.permission === "requests_view") throw new Error("keto down");
    });
    const tenancy = makeTenancy({ grantPermission: grant });
    const changes: MemberChangeEvent[] = [];
    renderMembers({
      client: makeClient({
        workforceMemberSearch: vi.fn().mockResolvedValue([agent()]),
        workforceMemberSave: save,
      }),
      tenancy,
      onMemberChange: (e) => changes.push(e),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));

    const alert = await screen.findByText(/requests_view: keto down/);
    expect(alert).toBeTruthy();
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith({ ...agent(), state: "ACTIVE" });
    expect(changes.map((c) => c.change)).toEqual(["activated"]);

    grant.mockResolvedValue(undefined);
    grant.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Retry grants" }));

    await waitFor(() => expect(grant).toHaveBeenCalledTimes(1));
    expect(grant).toHaveBeenCalledWith({
      namespace: NS,
      permission: "requests_view",
      profileId: "p1",
    });
    await waitFor(() => expect(screen.queryByText(/keto down/)).toBeNull());
    expect(changes.map((c) => c.change)).toEqual(["activated", "grants"]);
    // The record was never rewritten by the retry.
    expect(save).toHaveBeenCalledTimes(1);
  });

  it("revokes every recorded grant before saving INACTIVE", async () => {
    const calls: string[] = [];
    const save = vi.fn(async (m: Partial<WorkforceMember>) => {
      calls.push(`save:${m.state}`);
      return { ...agent(), state: "INACTIVE" } as WorkforceMember;
    });
    const tenancy = makeTenancy({
      revokePermission: vi.fn(async (p) => {
        calls.push(`revoke:${p.permission}`);
      }),
    });
    const changes: MemberChangeEvent[] = [];
    renderMembers({
      client: makeClient({
        workforceMemberSearch: vi
          .fn()
          .mockResolvedValue([agent({ state: "ACTIVE" })]),
        workforceMemberSave: save,
      }),
      tenancy,
      onMemberChange: (e) => changes.push(e),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Deactivate" }));

    await waitFor(() => expect(calls.length).toBe(4));
    expect(calls).toEqual([
      "revoke:vehicles_view",
      "revoke:requests_view",
      "revoke:quotes_view",
      "save:INACTIVE",
    ]);
    expect(changes.map((c) => c.change)).toEqual(["deactivated"]);
  });

  it("applies the grant difference when an active member's bundle changes", async () => {
    const calls: string[] = [];
    const existing = agent({ state: "ACTIVE" });
    const save = vi.fn(async () => {
      calls.push("save");
      return existing;
    });
    const tenancy = makeTenancy({
      grantPermission: vi.fn(async (p) => {
        calls.push(`grant:${p.permission}`);
      }),
      revokePermission: vi.fn(async (p) => {
        calls.push(`revoke:${p.permission}`);
      }),
    });
    const changes: MemberChangeEvent[] = [];
    renderMembers({
      client: makeClient({
        workforceMemberSearch: vi.fn().mockResolvedValue([existing]),
        workforceMemberSave: save,
      }),
      tenancy,
      onMemberChange: (e) => changes.push(e),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/Access bundle/), {
      target: { value: "sales" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(save).toHaveBeenCalled());
    // Only the difference is written, grants before revokes, and the
    // record is persisted afterwards.
    expect(calls).toEqual([
      "grant:assign",
      "grant:quotes_create",
      "revoke:requests_view",
      "revoke:vehicles_view",
      "save",
    ]);
    expect(save).toHaveBeenCalledWith({
      ...existing,
      organizationId: "o1",
      profileId: "p1",
      engagementType: "employee",
      state: "ACTIVE",
      properties: {
        access_bundle: { [NS]: "sales" },
        permission_grants: { [NS]: SALES_PERMISSIONS },
        permission_revokes: {},
        platform_role: "member",
      },
    });
    expect(changes.map((c) => c.change)).toEqual(["updated"]);
  });

  it("registers a member on the first bundle and reports the change", async () => {
    const save = vi.fn().mockResolvedValue(member());
    const changes: MemberChangeEvent[] = [];
    const tenancy = makeTenancy();
    renderMembers({
      client: makeClient({ workforceMemberSave: save }),
      tenancy,
      onMemberChange: (e) => changes.push(e),
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Register member" }),
    );
    fireEvent.click(screen.getByLabelText("Profile"));
    fireEvent.change(screen.getByLabelText(/Profile id/), {
      target: { value: "p7" },
    });
    expect(screen.queryByLabelText(/Platform role/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        organizationId: "o1",
        profileId: "p7",
        engagementType: "employee",
        state: "CREATED",
        properties: {
          access_bundle: { [NS]: "sales" },
          permission_grants: { [NS]: SALES_PERMISSIONS },
          permission_revokes: {},
          platform_role: "member",
        },
      }),
    );
    // Grants wait for activation.
    expect(tenancy.grantPermission).not.toHaveBeenCalled();
    expect(changes.map((c) => c.change)).toEqual(["created"]);
  });

  it("clears a member's bundle when no bundle is chosen", async () => {
    const existing = agent();
    const save = vi.fn().mockResolvedValue(existing);
    renderMembers({
      client: makeClient({
        workforceMemberSearch: vi.fn().mockResolvedValue([existing]),
        workforceMemberSave: save,
      }),
    });

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/Access bundle/), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith(
        expect.objectContaining({
          properties: {
            access_bundle: {},
            permission_grants: {},
            permission_revokes: {},
          },
        }),
      ),
    );
  });

  it("keeps the platform role select when no model is configured", async () => {
    renderMembers({
      client: makeClient({
        workforceMemberSearch: vi
          .fn()
          .mockResolvedValue([
            member({ properties: { platform_role: "admin" } }),
          ]),
      }),
      permissionModel: undefined,
    });

    expect(await screen.findByText("Platform role")).toBeTruthy();
    expect(screen.queryByText("Access bundle")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText(/Platform role/)).toBeTruthy();
    expect(screen.queryByLabelText(/Access bundle/)).toBeNull();
  });
});
