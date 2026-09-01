import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
import { MembersView } from "../../components/members/MembersView.js";
import type { IdentityClient } from "../../services/identity-client.js";
import type {
  ProfileResolver,
  ProfileSummary,
} from "../../services/profile-resolver.js";
import type { Organization, WorkforceMember } from "../../types.js";

const ORG: Organization = { id: "o1", name: "Acme", code: "ACME" };

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

function makeResolver(
  summaries: ProfileSummary[] = [],
  byContact: ProfileSummary | null = null,
): ProfileResolver {
  return {
    resolve: vi
      .fn()
      .mockResolvedValue(new Map(summaries.map((s) => [s.id, s]))),
    byContact: vi.fn().mockResolvedValue(byContact),
  };
}

function SelectOrganization({ children }: { children: ReactNode }) {
  const { organization, setOrganization } = useIdentity();
  useEffect(() => {
    setOrganization(ORG);
  }, [setOrganization]);
  return organization ? <>{children}</> : null;
}

function renderMembers(
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
        <MembersView />
      </SelectOrganization>
    </IdentityProvider>,
  );
}

describe("MembersView", () => {
  beforeEach(() => vi.clearAllMocks());

  it("lists members with resolved names and contacts", async () => {
    const client = makeClient({
      workforceMemberSearch: vi
        .fn()
        .mockResolvedValue([member(), member({ id: "m2", profileId: "p2" })]),
    });
    const resolver = makeResolver([
      { id: "p1", name: "Ada Lovelace", email: "ada@example.test" },
    ]);
    renderMembers(client, resolver);

    expect(await screen.findByText("Ada Lovelace")).toBeTruthy();
    expect(screen.getByText("ada@example.test")).toBeTruthy();
    // Unresolved profiles fall back to the raw id.
    expect(screen.getByText("p2")).toBeTruthy();
    expect(client.workforceMemberSearch).toHaveBeenCalledWith({
      organizationId: "o1",
      cursor: { limit: 50 },
    });
    expect(screen.getAllByText("Employee").length).toBe(2);
  });

  it("activates a member and refreshes the list", async () => {
    const search = vi.fn().mockResolvedValue([member()]);
    const save = vi.fn().mockResolvedValue(member({ state: "ACTIVE" }));
    renderMembers(
      makeClient({ workforceMemberSearch: search, workforceMemberSave: save }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({ ...member(), state: "ACTIVE" }),
    );
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
  });

  it("disables the state buttons while the change is in flight", async () => {
    let release: (m: WorkforceMember) => void = () => {};
    const save = vi.fn(
      () =>
        new Promise<WorkforceMember>((resolve) => {
          release = resolve;
        }),
    );
    renderMembers(
      makeClient({
        workforceMemberSearch: vi.fn().mockResolvedValue([member()]),
        workforceMemberSave: save,
      }),
    );

    const activate = await screen.findByRole("button", { name: "Activate" });
    fireEvent.click(activate);

    // A second click would interleave two grant/save runs for the same member.
    await waitFor(() =>
      expect((activate as HTMLButtonElement).disabled).toBe(true),
    );
    fireEvent.click(activate);
    expect(save).toHaveBeenCalledTimes(1);

    await act(async () => {
      release(member({ state: "ACTIVE" }));
    });
  });

  it("deactivates an active member", async () => {
    const save = vi.fn().mockResolvedValue(member({ state: "INACTIVE" }));
    renderMembers(
      makeClient({
        workforceMemberSearch: vi
          .fn()
          .mockResolvedValue([member({ state: "ACTIVE" })]),
        workforceMemberSave: save,
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Deactivate" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        ...member({ state: "INACTIVE" }),
      }),
    );
  });

  it("hides the platform role column when the feature is off", async () => {
    renderMembers(
      makeClient({
        workforceMemberSearch: vi
          .fn()
          .mockResolvedValue([
            member({ properties: { platform_role: "admin" } }),
          ]),
      }),
      makeResolver(),
      { platformRoles: false },
    );

    expect(await screen.findByText("p1")).toBeTruthy();
    expect(screen.queryByText("Platform role")).toBeNull();
    expect(screen.queryByText("Administrator")).toBeNull();
  });

  it("shows the platform role and home unit names when enabled", async () => {
    const client = makeClient({
      workforceMemberSearch: vi.fn().mockResolvedValue([
        member({
          homeOrgUnitId: "u1",
          properties: { platform_role: "admin" },
        }),
      ]),
      orgUnitSearch: vi
        .fn()
        .mockResolvedValue([
          { id: "u1", organizationId: "o1", name: "Nairobi", code: "NBO" },
        ]),
    });
    renderMembers(client, makeResolver(), { orgUnits: true });

    expect(await screen.findByText("Nairobi")).toBeTruthy();
    expect(screen.getByText("Administrator")).toBeTruthy();
    expect(client.orgUnitSearch).toHaveBeenCalledWith({
      organizationId: "o1",
      cursor: { limit: 50 },
    });
  });

  it("re-queries after the search input settles", async () => {
    vi.useFakeTimers();
    try {
      const search = vi.fn().mockResolvedValue([]);
      renderMembers(makeClient({ workforceMemberSearch: search }));
      await act(async () => {
        await Promise.resolve();
      });

      fireEvent.change(screen.getByLabelText("Search members"), {
        target: { value: "ada" },
      });
      expect(search).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(100);
      });
      expect(search).toHaveBeenCalledTimes(1);

      await act(async () => {
        vi.advanceTimersByTime(200);
      });
      expect(search).toHaveBeenCalledTimes(2);
      expect(search).toHaveBeenLastCalledWith({
        organizationId: "o1",
        query: "ada",
        cursor: { limit: 50 },
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls back to Title Case for engagement types outside the vocabulary", async () => {
    renderMembers(
      makeClient({
        workforceMemberSearch: vi
          .fn()
          .mockResolvedValue([member({ engagementType: "field_agent" })]),
      }),
    );

    expect(await screen.findByText("Field Agent")).toBeTruthy();
  });

  it("shows the id when a home unit is not in the unit list", async () => {
    renderMembers(
      makeClient({
        workforceMemberSearch: vi
          .fn()
          .mockResolvedValue([member({ homeOrgUnitId: "u9" })]),
      }),
      makeResolver(),
      { orgUnits: true },
    );

    expect(await screen.findByText("u9")).toBeTruthy();
  });

  it("reports a failed state change without losing the list", async () => {
    renderMembers(
      makeClient({
        workforceMemberSearch: vi.fn().mockResolvedValue([member()]),
        workforceMemberSave: vi.fn().mockRejectedValue(new Error("forbidden")),
      }),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Activate" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("forbidden");
    expect(screen.getByText("p1")).toBeTruthy();
  });

  it("surfaces a load failure with a retry", async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValue([member()]);
    renderMembers(makeClient({ workforceMemberSearch: search }));

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("p1")).toBeTruthy();
  });
});

describe("RegisterMemberDialog", () => {
  beforeEach(() => vi.clearAllMocks());
  afterEach(() => vi.useRealTimers());

  async function openDialog(
    client: IdentityClient,
    resolver: ProfileResolver,
    features?: { orgUnits?: boolean; platformRoles?: boolean },
  ) {
    renderMembers(client, resolver, features);
    fireEvent.click(
      await screen.findByRole("button", { name: "Register member" }),
    );
    return screen.findByRole("dialog");
  }

  it("registers a member found by contact", async () => {
    const save = vi.fn().mockResolvedValue(member());
    const search = vi.fn().mockResolvedValue([]);
    const resolver = makeResolver([], {
      id: "p9",
      email: "ada@example.test",
    });
    await openDialog(
      makeClient({ workforceMemberSearch: search, workforceMemberSave: save }),
      resolver,
    );

    fireEvent.change(screen.getByLabelText(/Email or phone/), {
      target: { value: "ada@example.test" },
    });
    fireEvent.change(screen.getByLabelText(/Platform role/), {
      target: { value: "admin" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        organizationId: "o1",
        profileId: "p9",
        engagementType: "employee",
        state: "CREATED",
        properties: { platform_role: "admin" },
      }),
    );
    expect(resolver.byContact).toHaveBeenCalledWith("ada@example.test");
    await waitFor(() => expect(search).toHaveBeenCalledTimes(2));
  });

  it("registers a member by profile id", async () => {
    const save = vi.fn().mockResolvedValue(member());
    const resolver = makeResolver();
    await openDialog(makeClient({ workforceMemberSave: save }), resolver, {
      platformRoles: false,
    });

    fireEvent.click(screen.getByLabelText("Profile"));
    fireEvent.change(screen.getByLabelText(/Profile id/), {
      target: { value: "p7" },
    });
    fireEvent.change(screen.getByLabelText(/Engagement/), {
      target: { value: "agent" },
    });
    fireEvent.change(screen.getByLabelText(/Initial state/), {
      target: { value: "ACTIVE" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        organizationId: "o1",
        profileId: "p7",
        engagementType: "agent",
        state: "ACTIVE",
        properties: {},
      }),
    );
    expect(resolver.byContact).not.toHaveBeenCalled();
  });

  it("shows an error and does not save when the contact is unknown", async () => {
    const save = vi.fn();
    await openDialog(makeClient({ workforceMemberSave: save }), makeResolver());

    fireEvent.change(screen.getByLabelText(/Email or phone/), {
      target: { value: "nobody@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(
      await screen.findByText("No account found for that contact"),
    ).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("requires a contact or profile id", async () => {
    const save = vi.fn();
    await openDialog(makeClient({ workforceMemberSave: save }), makeResolver());

    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    expect(await screen.findByText("Required")).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
  });

  it("shows the save error inline", async () => {
    const save = vi.fn().mockRejectedValue(new Error("duplicate member"));
    await openDialog(
      makeClient({ workforceMemberSave: save }),
      makeResolver([], { id: "p9" }),
    );

    fireEvent.change(screen.getByLabelText(/Email or phone/), {
      target: { value: "ada@example.test" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Register" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("duplicate member");
  });

  it("edits an existing member with the profile fixed", async () => {
    const save = vi.fn().mockResolvedValue(member());
    const existing = member({
      homeOrgUnitId: "u1",
      properties: { platform_role: "admin", note: "keep" },
    });
    renderMembers(
      makeClient({
        workforceMemberSearch: vi.fn().mockResolvedValue([existing]),
        workforceMemberSave: save,
        orgUnitSearch: vi.fn().mockResolvedValue([
          { id: "u1", organizationId: "o1", name: "Nairobi", code: "NBO" },
          { id: "u2", organizationId: "o1", name: "Mombasa", code: "MBA" },
        ]),
      }),
      makeResolver(),
      { orgUnits: true },
    );

    fireEvent.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.queryByLabelText(/Email or phone/)).toBeNull();

    fireEvent.change(screen.getByLabelText(/Home unit/), {
      target: { value: "u2" },
    });
    fireEvent.change(screen.getByLabelText(/Platform role/), {
      target: { value: "" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        ...existing,
        homeOrgUnitId: "u2",
        properties: { note: "keep" },
      }),
    );
  });
});
