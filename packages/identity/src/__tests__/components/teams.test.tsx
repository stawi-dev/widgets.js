import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import {
  IdentityProvider,
  useIdentity,
} from "../../context/identity-context.js";
import { TeamsView } from "../../components/teams/TeamsView.js";
import type { IdentityClient } from "../../services/identity-client.js";
import type {
  ProfileResolver,
  ProfileSummary,
} from "../../services/profile-resolver.js";
import type {
  InternalTeam,
  Organization,
  TeamMembership,
  WorkforceMember,
} from "../../types.js";

const ORG: Organization = { id: "o1", name: "Acme", code: "ACME" };

function team(over: Partial<InternalTeam> = {}): InternalTeam {
  return {
    id: "t1",
    organizationId: "o1",
    name: "Sales East",
    code: "SLE",
    teamType: "sales",
    objective: "Grow the eastern region",
    state: "ACTIVE",
    ...over,
  };
}

function membership(over: Partial<TeamMembership> = {}): TeamMembership {
  return {
    id: "tm1",
    teamId: "t1",
    memberId: "m1",
    membershipRole: "lead",
    isPrimaryTeam: true,
    state: "ACTIVE",
    ...over,
  };
}

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

function makeClient(overrides: Partial<IdentityClient> = {}): IdentityClient {
  return {
    organizationSearch: vi.fn().mockResolvedValue([]),
    organizationSave: vi.fn(),
    orgUnitSearch: vi.fn().mockResolvedValue([]),
    orgUnitSave: vi.fn(),
    workforceMemberSearch: vi.fn().mockResolvedValue([]),
    workforceMemberGet: vi.fn(),
    workforceMemberSave: vi.fn(),
    internalTeamSearch: vi.fn().mockResolvedValue([]),
    internalTeamSave: vi.fn().mockResolvedValue(team()),
    teamMembershipSearch: vi.fn().mockResolvedValue([]),
    teamMembershipSave: vi.fn().mockResolvedValue(membership()),
    accessRoleAssignmentSearch: vi.fn(),
    accessRoleAssignmentSave: vi.fn(),
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

function renderTeams(
  client: IdentityClient,
  resolver: ProfileResolver = makeResolver(),
  features?: { orgUnits?: boolean; platformRoles?: boolean },
) {
  return render(
    <IdentityProvider
      client={client}
      profileResolver={resolver}
      features={features}
    >
      <SelectOrganization>
        <TeamsView />
      </SelectOrganization>
    </IdentityProvider>,
  );
}

describe("TeamsView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists teams for the organization", async () => {
    const client = makeClient({
      internalTeamSearch: vi.fn().mockResolvedValue([team()]),
    });
    renderTeams(client);

    expect(await screen.findByText("Sales East")).toBeTruthy();
    expect(screen.getByText("SLE")).toBeTruthy();
    expect(screen.getByText("Sales")).toBeTruthy();
    expect(screen.getByText("Grow the eastern region")).toBeTruthy();
    expect(client.internalTeamSearch).toHaveBeenCalledWith({
      organizationId: "o1",
      cursor: { limit: 50 },
    });
  });

  it("falls back to Title Case for team types outside the vocabulary", async () => {
    renderTeams(
      makeClient({
        internalTeamSearch: vi
          .fn()
          .mockResolvedValue([team({ teamType: "field_ops" })]),
      }),
    );

    expect(await screen.findByText("Field Ops")).toBeTruthy();
  });

  it("re-queries after the search input settles", async () => {
    vi.useFakeTimers();
    try {
      const search = vi.fn().mockResolvedValue([]);
      renderTeams(makeClient({ internalTeamSearch: search }));
      await act(async () => {
        await Promise.resolve();
      });

      fireEvent.change(screen.getByLabelText("Search teams"), {
        target: { value: "sales" },
      });
      expect(search).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(search).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(search).toHaveBeenLastCalledWith({
        organizationId: "o1",
        query: "sales",
        cursor: { limit: 50 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("surfaces a load failure with a retry", async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValue([team()]);
    renderTeams(makeClient({ internalTeamSearch: search }));

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Sales East")).toBeTruthy();
  });

  it("offers a create action from the empty state", async () => {
    renderTeams(makeClient());

    fireEvent.click(
      await screen.findByRole("button", { name: "Create the first team" }),
    );
    expect(await screen.findByRole("dialog")).toBeTruthy();
  });
});

describe("TeamForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a team with the organization and entered fields", async () => {
    const save = vi.fn().mockResolvedValue(team());
    const search = vi.fn().mockResolvedValue([]);
    renderTeams(
      makeClient({ internalTeamSearch: search, internalTeamSave: save }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Create team" }));
    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: "Sales East" },
    });
    fireEvent.change(screen.getByLabelText(/Code/), {
      target: { value: "SLE" },
    });
    fireEvent.change(screen.getByLabelText(/Type/), {
      target: { value: "operations" },
    });
    fireEvent.change(screen.getByLabelText(/Objective/), {
      target: { value: "Grow the eastern region" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        organizationId: "o1",
        name: "Sales East",
        code: "SLE",
        teamType: "operations",
        objective: "Grow the eastern region",
        state: "ACTIVE",
      }),
    );
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
  });

  it("requires a name and a code", async () => {
    const save = vi.fn();
    renderTeams(makeClient({ internalTeamSave: save }));

    fireEvent.click(await screen.findByRole("button", { name: "Create team" }));
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect((await screen.findAllByText("Required")).length).toBe(2);
    expect(save).not.toHaveBeenCalled();
  });

  it("posts the parent team and home unit when chosen", async () => {
    const save = vi.fn().mockResolvedValue(team());
    renderTeams(
      makeClient({
        internalTeamSearch: vi
          .fn()
          .mockResolvedValue([team({ id: "t9", name: "Sales", code: "SL" })]),
        internalTeamSave: save,
        orgUnitSearch: vi
          .fn()
          .mockResolvedValue([
            { id: "u1", organizationId: "o1", name: "Nairobi", code: "NBO" },
          ]),
      }),
      makeResolver(),
      { orgUnits: true },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Create team" }));
    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: "Sales East" },
    });
    fireEvent.change(screen.getByLabelText(/Code/), {
      target: { value: "SLE" },
    });
    fireEvent.change(screen.getByLabelText(/Parent team/), {
      target: { value: "t9" },
    });
    fireEvent.change(screen.getByLabelText(/Home unit/), {
      target: { value: "u1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        organizationId: "o1",
        name: "Sales East",
        code: "SLE",
        teamType: "sales",
        objective: "",
        parentTeamId: "t9",
        homeOrgUnitId: "u1",
        state: "ACTIVE",
      }),
    );
  });

  it("edits an existing team, spreading its untouched fields", async () => {
    const save = vi.fn().mockResolvedValue(team());
    const existing = team({ geoId: "ke", properties: { note: "keep" } });
    renderTeams(
      makeClient({
        internalTeamSearch: vi.fn().mockResolvedValue([existing]),
        internalTeamSave: save,
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Sales East" }));
    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/Objective/), {
      target: { value: "Grow faster" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        ...existing,
        objective: "Grow faster",
      }),
    );
  });

  it("shows the save error inline", async () => {
    renderTeams(
      makeClient({
        internalTeamSave: vi
          .fn()
          .mockRejectedValue(new Error("duplicate code")),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Create team" }));
    fireEvent.change(screen.getByLabelText(/Name/), {
      target: { value: "Sales East" },
    });
    fireEvent.change(screen.getByLabelText(/Code/), {
      target: { value: "SLE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("duplicate code");
  });
});

describe("TeamDetail", () => {
  beforeEach(() => vi.clearAllMocks());

  function detailClient(overrides: Partial<IdentityClient> = {}) {
    return makeClient({
      internalTeamSearch: vi.fn().mockResolvedValue([team()]),
      teamMembershipSearch: vi.fn().mockResolvedValue([membership()]),
      workforceMemberSearch: vi
        .fn()
        .mockResolvedValue([member(), member({ id: "m2", profileId: "p2" })]),
      ...overrides,
    });
  }

  async function selectTeam(
    client: IdentityClient,
    resolver: ProfileResolver = makeResolver([
      { id: "p1", name: "Ada Lovelace" },
    ]),
  ) {
    renderTeams(client, resolver);
    fireEvent.click(await screen.findByRole("button", { name: "Sales East" }));
    // Let the detail panel's loads settle before the test acts on it.
    await screen.findByRole("button", { name: "Add member" });
  }

  it("loads the memberships of the selected team with member names", async () => {
    const client = detailClient();
    await selectTeam(client);

    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
    expect(client.teamMembershipSearch).toHaveBeenCalledWith({
      teamId: "t1",
      cursor: { limit: 50 },
    });
    expect(client.workforceMemberSearch).toHaveBeenCalledWith({
      organizationId: "o1",
      cursor: { limit: 50 },
    });
    expect(screen.getByText("Lead")).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
  });

  it("falls back to the profile id when the name is unknown", async () => {
    await selectTeam(
      detailClient({
        teamMembershipSearch: vi
          .fn()
          .mockResolvedValue([membership({ memberId: "m2" })]),
      }),
      makeResolver(),
    );

    expect(await screen.findByText("p2")).toBeTruthy();
  });

  it("adds a member to the team", async () => {
    const save = vi.fn().mockResolvedValue(membership());
    const search = vi.fn().mockResolvedValue([membership()]);
    await selectTeam(
      detailClient({ teamMembershipSearch: search, teamMembershipSave: save }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Add member" }));
    fireEvent.change(screen.getByLabelText("Member"), {
      target: { value: "m2" },
    });
    fireEvent.change(screen.getByLabelText(/Membership role/), {
      target: { value: "supervisor" },
    });
    fireEvent.click(screen.getByLabelText(/Primary team/));
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        teamId: "t1",
        memberId: "m2",
        membershipRole: "supervisor",
        isPrimaryTeam: true,
        state: "ACTIVE",
      }),
    );
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
  });

  it("excludes members already in the team from the add dialog", async () => {
    await selectTeam(detailClient());

    fireEvent.click(await screen.findByRole("button", { name: "Add member" }));
    const options = Array.from(
      (screen.getByLabelText("Member") as HTMLSelectElement).options,
    ).map((o) => o.value);
    expect(options).toEqual(["m2"]);
  });

  it("removes a membership by marking it inactive", async () => {
    const save = vi.fn().mockResolvedValue(membership({ state: "INACTIVE" }));
    await selectTeam(detailClient({ teamMembershipSave: save }));

    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        ...membership(),
        state: "INACTIVE",
      }),
    );
  });

  it("hides removed memberships until the toggle is on", async () => {
    await selectTeam(
      detailClient({
        teamMembershipSearch: vi
          .fn()
          .mockResolvedValue([membership({ state: "INACTIVE" })]),
      }),
    );

    expect(await screen.findByText("No members in this team yet")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Show removed"));
    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
  });

  it("reports a failed membership save without losing the list", async () => {
    await selectTeam(
      detailClient({
        teamMembershipSave: vi.fn().mockRejectedValue(new Error("forbidden")),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("forbidden");
    expect(screen.getByText("Ada Lovelace")).toBeTruthy();
  });

  it("starts fresh when another team is selected", async () => {
    const teamB = team({ id: "t2", name: "Support West", code: "SPW" });
    renderTeams(
      detailClient({
        internalTeamSearch: vi.fn().mockResolvedValue([team(), teamB]),
        teamMembershipSearch: vi.fn(({ teamId }) =>
          Promise.resolve(teamId === "t1" ? [membership()] : []),
        ),
        teamMembershipSave: vi.fn().mockRejectedValue(new Error("forbidden")),
      }),
      makeResolver([{ id: "p1", name: "Ada Lovelace" }]),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Sales East" }));
    fireEvent.click(await screen.findByRole("button", { name: "Remove" }));
    expect((await screen.findByRole("alert")).textContent).toContain(
      "forbidden",
    );

    fireEvent.click(screen.getByRole("button", { name: "Support West" }));

    expect(await screen.findByText("No members in this team yet")).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("keeps the add action shut until the members have loaded", async () => {
    let release: (members: WorkforceMember[]) => void = () => {};
    const pending = new Promise<WorkforceMember[]>((resolve) => {
      release = resolve;
    });
    renderTeams(
      detailClient({ workforceMemberSearch: vi.fn().mockReturnValue(pending) }),
      makeResolver([{ id: "p1", name: "Ada Lovelace" }]),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Sales East" }));
    const add = await screen.findByRole("button", { name: "Add member" });
    expect((add as HTMLButtonElement).disabled).toBe(true);

    await act(async () => {
      release([member(), member({ id: "m2", profileId: "p2" })]);
      await pending;
    });

    await waitFor(() =>
      expect((add as HTMLButtonElement).disabled).toBe(false),
    );
    fireEvent.click(add);

    const select = (await screen.findByLabelText(
      "Member",
    )) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["m2"]);
    expect(select.value).toBe("m2");
  });

  it("surfaces a membership load failure", async () => {
    await selectTeam(
      detailClient({
        teamMembershipSearch: vi.fn().mockRejectedValue(new Error("nope")),
      }),
    );

    expect(await screen.findByText("Couldn't load team members")).toBeTruthy();
  });
});
