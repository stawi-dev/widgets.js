import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import {
  IdentityProvider,
  useIdentity,
} from "../../context/identity-context.js";
import { RolesView } from "../../components/roles/RolesView.js";
import type { IdentityClient } from "../../services/identity-client.js";
import type {
  ProfileResolver,
  ProfileSummary,
} from "../../services/profile-resolver.js";
import type {
  AccessRoleAssignment,
  InternalTeam,
  Organization,
  OrgUnit,
  WorkforceMember,
} from "../../types.js";

const ORG: Organization = { id: "o1", name: "Acme", code: "ACME" };

function member(over: Partial<WorkforceMember> = {}): WorkforceMember {
  return {
    id: "m1",
    organizationId: "o1",
    profileId: "p1",
    engagementType: "employee",
    state: "ACTIVE",
    ...over,
  };
}

function team(over: Partial<InternalTeam> = {}): InternalTeam {
  return {
    id: "t1",
    organizationId: "o1",
    name: "Sales East",
    code: "SLE",
    teamType: "sales",
    state: "ACTIVE",
    ...over,
  };
}

function unit(over: Partial<OrgUnit> = {}): OrgUnit {
  return {
    id: "u1",
    organizationId: "o1",
    name: "Nairobi",
    code: "NBO",
    ...over,
  };
}

function assignment(
  over: Partial<AccessRoleAssignment> = {},
): AccessRoleAssignment {
  return {
    id: "a1",
    memberId: "m1",
    roleKey: "identity_administrator",
    scopeType: "ACCESS_SCOPE_TYPE_ORGANIZATION",
    scopeId: "o1",
    state: "ACTIVE",
    ...over,
  };
}

function makeClient(overrides: Partial<IdentityClient> = {}): IdentityClient {
  return {
    organizationSearch: vi.fn().mockResolvedValue([]),
    organizationSave: vi.fn(),
    orgUnitSearch: vi.fn().mockResolvedValue([]),
    orgUnitSave: vi.fn(),
    workforceMemberSearch: vi.fn().mockResolvedValue([member()]),
    workforceMemberGet: vi.fn(),
    workforceMemberSave: vi.fn(),
    internalTeamSearch: vi.fn().mockResolvedValue([]),
    internalTeamSave: vi.fn(),
    teamMembershipSearch: vi.fn().mockResolvedValue([]),
    teamMembershipSave: vi.fn(),
    accessRoleAssignmentSearch: vi.fn().mockResolvedValue([]),
    accessRoleAssignmentSave: vi.fn().mockResolvedValue(assignment()),
    ...overrides,
  } as IdentityClient;
}

function makeResolver(summaries: ProfileSummary[] = []): ProfileResolver {
  return {
    resolve: vi
      .fn()
      .mockResolvedValue(new Map(summaries.map((s) => [s.id, s]))),
    byContact: vi.fn().mockResolvedValue(null),
  };
}

function SelectOrganization({ children }: { children: ReactNode }) {
  const { organization, setOrganization } = useIdentity();
  useEffect(() => {
    setOrganization(ORG);
  }, [setOrganization]);
  return organization ? <>{children}</> : null;
}

function renderRoles(
  client: IdentityClient,
  resolver: ProfileResolver = makeResolver([
    { id: "p1", name: "Ada Lovelace" },
  ]),
  features?: { orgUnits?: boolean; platformRoles?: boolean },
) {
  return render(
    <IdentityProvider
      client={client}
      profileResolver={resolver}
      features={features}
    >
      <SelectOrganization>
        <RolesView />
      </SelectOrganization>
    </IdentityProvider>,
  );
}

/** The assignments table, scoped so matrix labels don't collide. */
async function assignmentsTable() {
  return within(await screen.findByRole("table", { name: "Role assignments" }));
}

/** Opens the assign dialog once the member list has settled. */
async function openAssign() {
  const button = await screen.findByRole("button", { name: "Assign role" });
  await waitFor(() => expect(button.hasAttribute("disabled")).toBe(false));
  fireEvent.click(button);
  return screen.findByRole("dialog");
}

describe("RolesView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists the assignments of the organization's members", async () => {
    const client = makeClient({
      accessRoleAssignmentSearch: vi.fn().mockResolvedValue([assignment()]),
    });
    renderRoles(client);

    const table = await assignmentsTable();
    expect(table.getByText("Ada Lovelace")).toBeTruthy();
    expect(table.getByText("Administrator")).toBeTruthy();
    expect(table.getByText("Organization · Acme")).toBeTruthy();
    expect(client.accessRoleAssignmentSearch).toHaveBeenCalledWith({
      cursor: { limit: 50 },
    });
    expect(client.workforceMemberSearch).toHaveBeenCalledWith({
      organizationId: "o1",
      cursor: { limit: 50 },
    });
  });

  it("hides assignments that belong to members of another organization", async () => {
    renderRoles(
      makeClient({
        accessRoleAssignmentSearch: vi
          .fn()
          .mockResolvedValue([
            assignment(),
            assignment({ id: "a2", memberId: "other", roleKey: "outsider" }),
          ]),
      }),
    );

    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
    expect(screen.queryByText("Outsider")).toBeNull();
  });

  it("names the scope target of unit and team assignments", async () => {
    renderRoles(
      makeClient({
        internalTeamSearch: vi.fn().mockResolvedValue([team()]),
        orgUnitSearch: vi.fn().mockResolvedValue([unit()]),
        accessRoleAssignmentSearch: vi.fn().mockResolvedValue([
          assignment({
            id: "a2",
            scopeType: "ACCESS_SCOPE_TYPE_TEAM",
            scopeId: "t1",
          }),
          assignment({
            id: "a3",
            scopeType: "ACCESS_SCOPE_TYPE_ORG_UNIT",
            scopeId: "u1",
          }),
          assignment({
            id: "a4",
            scopeType: "ACCESS_SCOPE_TYPE_GLOBAL",
            scopeId: undefined,
          }),
        ]),
      }),
      makeResolver([{ id: "p1", name: "Ada Lovelace" }]),
      { orgUnits: true },
    );

    const table = await assignmentsTable();
    expect(table.getByText("Team · Sales East")).toBeTruthy();
    expect(table.getByText("Org unit · Nairobi")).toBeTruthy();
    expect(table.getByText("Global")).toBeTruthy();
  });

  it("falls back to Title Case for role keys outside the vocabulary", async () => {
    renderRoles(
      makeClient({
        accessRoleAssignmentSearch: vi
          .fn()
          .mockResolvedValue([assignment({ roleKey: "field_auditor" })]),
      }),
    );

    expect((await assignmentsTable()).getByText("Field Auditor")).toBeTruthy();
  });

  it("counts only active assignments in the matrix", async () => {
    renderRoles(
      makeClient({
        accessRoleAssignmentSearch: vi.fn().mockResolvedValue([
          assignment(),
          assignment({ id: "a2", scopeType: "ACCESS_SCOPE_TYPE_GLOBAL" }),
          assignment({ id: "a3", state: "INACTIVE" }),
          assignment({
            id: "a4",
            memberId: "other",
            scopeType: "ACCESS_SCOPE_TYPE_GLOBAL",
          }),
        ]),
      }),
    );

    const matrix = await screen.findByRole("table", {
      name: "Assignments by role and scope",
    });
    const row = within(matrix)
      .getByRole("rowheader", { name: "Administrator" })
      .closest("tr")!;
    expect(
      within(row)
        .getAllByRole("cell")
        .map((c) => c.textContent),
    ).toEqual(["1", "1", "0", "0"]);
  });

  it("passes the chosen role key and scope type to the search", async () => {
    const search = vi.fn().mockResolvedValue([]);
    renderRoles(makeClient({ accessRoleAssignmentSearch: search }));

    fireEvent.change(await screen.findByLabelText("Filter by role"), {
      target: { value: "approval_approver" },
    });
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith({
        roleKey: "approval_approver",
        cursor: { limit: 50 },
      }),
    );

    fireEvent.change(screen.getByLabelText("Filter by scope type"), {
      target: { value: "ACCESS_SCOPE_TYPE_TEAM" },
    });
    await waitFor(() =>
      expect(search).toHaveBeenLastCalledWith({
        roleKey: "approval_approver",
        scopeType: "ACCESS_SCOPE_TYPE_TEAM",
        cursor: { limit: 50 },
      }),
    );
  });

  it("hides revoked assignments until the toggle is on", async () => {
    renderRoles(
      makeClient({
        accessRoleAssignmentSearch: vi
          .fn()
          .mockResolvedValue([assignment({ state: "INACTIVE" })]),
      }),
    );

    expect(await screen.findByText("No role assignments yet")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Show revoked"));
    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Revoke" })).toBeNull();
  });

  it("revokes an assignment by marking it inactive", async () => {
    const search = vi.fn().mockResolvedValue([assignment()]);
    const save = vi.fn().mockResolvedValue(assignment({ state: "INACTIVE" }));
    renderRoles(
      makeClient({
        accessRoleAssignmentSearch: search,
        accessRoleAssignmentSave: save,
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ ...assignment(), state: "INACTIVE" }),
    );
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
  });

  it("reports a failed revoke without losing the list", async () => {
    renderRoles(
      makeClient({
        accessRoleAssignmentSearch: vi.fn().mockResolvedValue([assignment()]),
        accessRoleAssignmentSave: vi
          .fn()
          .mockRejectedValue(new Error("forbidden")),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Revoke" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "forbidden",
    );
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
  });

  it("surfaces a load failure with a retry", async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValue([assignment()]);
    renderRoles(makeClient({ accessRoleAssignmentSearch: search }));

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
  });

  it("keeps the assign action shut until the members have loaded", async () => {
    let release: (members: WorkforceMember[]) => void = () => {};
    const pending = new Promise<WorkforceMember[]>((resolve) => {
      release = resolve;
    });
    renderRoles(
      makeClient({ workforceMemberSearch: vi.fn().mockReturnValue(pending) }),
    );

    const assign = await screen.findByRole("button", { name: "Assign role" });
    expect(assign.hasAttribute("disabled")).toBe(true);

    release([member()]);
    await waitFor(() => expect(assign.hasAttribute("disabled")).toBe(false));
  });
});

describe("AssignRoleDialog", () => {
  beforeEach(() => vi.clearAllMocks());

  it("assigns a team-scoped role with the chosen team", async () => {
    const save = vi.fn().mockResolvedValue(assignment());
    const search = vi.fn().mockResolvedValue([]);
    renderRoles(
      makeClient({
        internalTeamSearch: vi
          .fn()
          .mockResolvedValue([team(), team({ id: "t2", name: "Support" })]),
        accessRoleAssignmentSearch: search,
        accessRoleAssignmentSave: save,
      }),
    );

    await openAssign();
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "approval_approver" },
    });
    fireEvent.change(screen.getByLabelText("Scope"), {
      target: { value: "ACCESS_SCOPE_TYPE_TEAM" },
    });
    fireEvent.change(screen.getByLabelText("Team"), {
      target: { value: "t2" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        memberId: "m1",
        roleKey: "approval_approver",
        scopeType: "ACCESS_SCOPE_TYPE_TEAM",
        scopeId: "t2",
        state: "ACTIVE",
      }),
    );
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
  });

  it("omits the scope id for a global assignment", async () => {
    const save = vi.fn().mockResolvedValue(assignment());
    renderRoles(makeClient({ accessRoleAssignmentSave: save }));

    await openAssign();
    fireEvent.change(screen.getByLabelText("Scope"), {
      target: { value: "ACCESS_SCOPE_TYPE_GLOBAL" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        memberId: "m1",
        roleKey: "identity_administrator",
        scopeType: "ACCESS_SCOPE_TYPE_GLOBAL",
        state: "ACTIVE",
      }),
    );
  });

  it("scopes to the current organization by default", async () => {
    const save = vi.fn().mockResolvedValue(assignment());
    renderRoles(makeClient({ accessRoleAssignmentSave: save }));

    await openAssign();
    expect(screen.getByText("Acme")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        memberId: "m1",
        roleKey: "identity_administrator",
        scopeType: "ACCESS_SCOPE_TYPE_ORGANIZATION",
        scopeId: "o1",
        state: "ACTIVE",
      }),
    );
  });

  it("assigns a unit-scoped role when org units are enabled", async () => {
    const save = vi.fn().mockResolvedValue(assignment());
    renderRoles(
      makeClient({
        orgUnitSearch: vi.fn().mockResolvedValue([unit()]),
        accessRoleAssignmentSave: save,
      }),
      makeResolver([{ id: "p1", name: "Ada Lovelace" }]),
      { orgUnits: true },
    );

    await openAssign();
    fireEvent.change(screen.getByLabelText("Scope"), {
      target: { value: "ACCESS_SCOPE_TYPE_ORG_UNIT" },
    });
    fireEvent.change(screen.getByLabelText("Org unit"), {
      target: { value: "u1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        memberId: "m1",
        roleKey: "identity_administrator",
        scopeType: "ACCESS_SCOPE_TYPE_ORG_UNIT",
        scopeId: "u1",
        state: "ACTIVE",
      }),
    );
  });

  it("posts a custom role key typed by the operator", async () => {
    const save = vi.fn().mockResolvedValue(assignment());
    renderRoles(makeClient({ accessRoleAssignmentSave: save }));

    await openAssign();
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "__custom__" },
    });
    fireEvent.change(screen.getByLabelText(/Custom role key/), {
      target: { value: "field_auditor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        memberId: "m1",
        roleKey: "field_auditor",
        scopeType: "ACCESS_SCOPE_TYPE_ORGANIZATION",
        scopeId: "o1",
        state: "ACTIVE",
      }),
    );
  });

  it("rejects a custom role key that isn't a valid key", async () => {
    const save = vi.fn();
    renderRoles(makeClient({ accessRoleAssignmentSave: save }));

    await openAssign();
    fireEvent.change(screen.getByLabelText("Role"), {
      target: { value: "__custom__" },
    });
    fireEvent.change(screen.getByLabelText(/Custom role key/), {
      target: { value: "Field Auditor" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    expect(
      await screen.findByText(
        "Use lowercase letters, digits and underscores, e.g. field_auditor",
      ),
    ).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("shows the save error inline", async () => {
    renderRoles(
      makeClient({
        accessRoleAssignmentSave: vi
          .fn()
          .mockRejectedValue(new Error("already assigned")),
      }),
    );

    await openAssign();
    fireEvent.click(screen.getByRole("button", { name: "Assign" }));

    expect((await screen.findByRole("alert")).textContent).toContain(
      "already assigned",
    );
  });

  it("offers an assign action from the empty state", async () => {
    renderRoles(makeClient());

    const first = await screen.findByRole("button", {
      name: "Assign the first role",
    });
    await waitFor(() => expect(first.hasAttribute("disabled")).toBe(false));
    fireEvent.click(first);
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });

  it("tells the operator when there is nobody to assign", async () => {
    renderRoles(
      makeClient({ workforceMemberSearch: vi.fn().mockResolvedValue([]) }),
    );

    await openAssign();
    expect(
      screen.getByText("Register a member before assigning roles"),
    ).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Assign" }).hasAttribute("disabled"),
    ).toBe(true);
  });
});
