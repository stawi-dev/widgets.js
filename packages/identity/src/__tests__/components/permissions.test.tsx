import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
  act,
} from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import type { AuthRuntime } from "@stawi/auth-runtime";
import {
  IdentityProvider,
  useIdentity,
  type MemberChangeEvent,
} from "../../context/identity-context.js";
import { IdentityWidgetRoot } from "../../components/IdentityWidgetRoot.js";
import { PermissionsView } from "../../components/permissions/PermissionsView.js";
import { identityError } from "../../services/errors.js";
import type { IdentityClient } from "../../services/identity-client.js";
import type {
  ServiceNamespace,
  TenancyClient,
} from "../../services/tenancy-client.js";
import type { PermissionModel } from "../../permissions/types.js";
import type {
  ProfileResolver,
  ProfileSummary,
} from "../../services/profile-resolver.js";
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
      groups: { quotes: "Quotations" },
      permissionLabels: { assign: "Assign work" },
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
          permissions: AGENT_PERMISSIONS,
        },
      ],
    },
  ],
};

const CATALOGUE: ServiceNamespace[] = [
  {
    namespace: NS,
    permissions: [
      "vehicles_view",
      "requests_view",
      "quotes_view",
      "quotes_create",
      "assign",
      "team_manage",
    ],
    roleBindings: { admin: { permissions: ["team_manage"] } },
  },
];

/**
 * A member whose record exercises every source: `vehicles_view` and
 * `quotes_view` from the bundle, `assign` as an override grant,
 * `requests_view` revoked, `team_manage` carried by the admin role, and
 * `quotes_create` held by nobody.
 */
function agent(over: Partial<WorkforceMember> = {}): WorkforceMember {
  return {
    id: "m1",
    organizationId: "o1",
    profileId: "p1",
    engagementType: "employee",
    state: "ACTIVE",
    properties: {
      platform_role: "admin",
      access_bundle: { [NS]: "sales_agent" },
      permission_grants: { [NS]: ["vehicles_view", "quotes_view", "assign"] },
      permission_revokes: { [NS]: ["requests_view"] },
    },
    ...over,
  };
}

function makeClient(overrides: Partial<IdentityClient> = {}): IdentityClient {
  return {
    organizationSearch: vi.fn().mockResolvedValue([ORG]),
    organizationSave: vi.fn(),
    orgUnitSearch: vi.fn().mockResolvedValue([]),
    orgUnitSave: vi.fn(),
    workforceMemberSearch: vi.fn().mockResolvedValue([agent()]),
    workforceMemberGet: vi.fn(),
    workforceMemberSave: vi.fn(async (m: WorkforceMember) => m),
    internalTeamSearch: vi.fn().mockResolvedValue([]),
    internalTeamSave: vi.fn(),
    teamMembershipSearch: vi.fn().mockResolvedValue([]),
    teamMembershipSave: vi.fn(),
    accessRoleAssignmentSearch: vi.fn().mockResolvedValue([]),
    accessRoleAssignmentSave: vi.fn(),
    ...overrides,
  } as IdentityClient;
}

function makeResolver(): ProfileResolver {
  return {
    resolve: vi
      .fn()
      .mockResolvedValue(
        new Map<string, ProfileSummary>([["p1", { id: "p1", name: "Jane" }]]),
      ),
    byContact: vi.fn().mockResolvedValue(null),
  };
}

function makeTenancy(overrides: Partial<TenancyClient> = {}): TenancyClient {
  return {
    listServiceNamespaces: vi.fn().mockResolvedValue(CATALOGUE),
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
  client?: IdentityClient;
  tenancy?: TenancyClient;
  onMemberChange?: (event: MemberChangeEvent) => void;
}

function renderPermissions(options: Options = {}) {
  const {
    client = makeClient(),
    tenancy = makeTenancy(),
    onMemberChange,
  } = options;
  render(
    <IdentityProvider
      client={client}
      tenancy={tenancy}
      permissionModel={MODEL}
      onMemberChange={onMemberChange}
      profileResolver={makeResolver()}
    >
      <SelectOrganization>
        <PermissionsView />
      </SelectOrganization>
    </IdentityProvider>,
  );
  return { client, tenancy };
}

/** The row wrapper holding a permission's checkbox, label and tags. */
function rowFor(label: string): HTMLElement {
  const box = screen.getByLabelText(label);
  const row = box.closest(".aiw-perm-row");
  if (!row) throw new Error(`no row for ${label}`);
  return row as HTMLElement;
}

describe("permissions screen", () => {
  beforeEach(() => vi.clearAllMocks());

  it("tags every permission with the source that decides it", async () => {
    renderPermissions();

    expect(await screen.findByRole("button", { name: /Jane/ })).toBeTruthy();
    expect(within(rowFor("Vehicles View")).getByText("Bundle")).toBeTruthy();
    expect(within(rowFor("Assign work")).getByText("Granted")).toBeTruthy();
    expect(within(rowFor("Requests View")).getByText("Revoked")).toBeTruthy();
    expect(within(rowFor("Team Manage")).getByText("Role")).toBeTruthy();
    expect(
      within(rowFor("Quotes Create")).getByText("Not granted"),
    ).toBeTruthy();

    // The checkbox state follows the source.
    expect(
      (screen.getByLabelText("Vehicles View") as HTMLInputElement).checked,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Requests View") as HTMLInputElement).checked,
    ).toBe(false);
    expect(
      (screen.getByLabelText("Team Manage") as HTMLInputElement).checked,
    ).toBe(true);

    // Groups take their label from the model, else Title Case of the prefix.
    expect(screen.getByText("Quotations")).toBeTruthy();
    expect(screen.getByText("Vehicles")).toBeTruthy();
  });

  it("grants a permission and records it on the member", async () => {
    const save = vi.fn(async (m: WorkforceMember) => m);
    const changes: MemberChangeEvent[] = [];
    const { tenancy } = renderPermissions({
      client: makeClient({ workforceMemberSave: save }),
      onMemberChange: (e) => changes.push(e),
    });

    fireEvent.click(await screen.findByLabelText("Quotes Create"));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(tenancy.grantPermission).toHaveBeenCalledWith({
      namespace: NS,
      permission: "quotes_create",
      profileId: "p1",
    });
    expect(tenancy.revokePermission).not.toHaveBeenCalled();
    expect(save).toHaveBeenCalledWith({
      ...agent(),
      properties: {
        platform_role: "admin",
        access_bundle: { [NS]: "sales_agent" },
        permission_grants: {
          [NS]: ["vehicles_view", "quotes_view", "assign", "quotes_create"],
        },
        permission_revokes: { [NS]: ["requests_view"] },
      },
    });
    expect(changes.map((c) => c.change)).toEqual(["grants"]);
    expect(
      (screen.getByLabelText("Quotes Create") as HTMLInputElement).checked,
    ).toBe(true);
  });

  it("revokes a bundle permission and records the revoke", async () => {
    const save = vi.fn(async (m: WorkforceMember) => m);
    const { tenancy } = renderPermissions({
      client: makeClient({ workforceMemberSave: save }),
    });

    fireEvent.click(await screen.findByLabelText("Vehicles View"));

    await waitFor(() => expect(save).toHaveBeenCalled());
    expect(tenancy.revokePermission).toHaveBeenCalledWith({
      namespace: NS,
      permission: "vehicles_view",
      profileId: "p1",
    });
    expect(save).toHaveBeenCalledWith({
      ...agent(),
      properties: {
        platform_role: "admin",
        access_bundle: { [NS]: "sales_agent" },
        permission_grants: { [NS]: ["quotes_view", "assign"] },
        permission_revokes: { [NS]: ["requests_view", "vehicles_view"] },
      },
    });
    expect(within(rowFor("Vehicles View")).getByText("Revoked")).toBeTruthy();
  });

  it("warns that a role still allows a permission it revoked", async () => {
    renderPermissions();

    fireEvent.click(await screen.findByLabelText("Team Manage"));

    const row = await waitFor(() => {
      const r = rowFor("Team Manage");
      if (!within(r).queryByText("Still allowed by role")) {
        throw new Error("no warning yet");
      }
      return r;
    });
    expect(within(row).getByText("Revoked")).toBeTruthy();
    expect(
      within(row).getByText("Still allowed by role").getAttribute("title"),
    ).toBeTruthy();
  });

  it("rolls back the checkbox and alerts when the write fails", async () => {
    const save = vi.fn(async (m: WorkforceMember) => m);
    const tenancy = makeTenancy({
      grantPermission: vi.fn().mockRejectedValue(new Error("keto down")),
    });
    renderPermissions({
      client: makeClient({ workforceMemberSave: save }),
      tenancy,
    });

    fireEvent.click(await screen.findByLabelText("Quotes Create"));

    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByText(/keto down/)).toBeTruthy();
    expect(save).not.toHaveBeenCalled();
    expect(
      (screen.getByLabelText("Quotes Create") as HTMLInputElement).checked,
    ).toBe(false);
  });

  it("shows an empty state and no toggles when the catalogue is denied", async () => {
    renderPermissions({
      tenancy: makeTenancy({
        listServiceNamespaces: vi
          .fn()
          .mockRejectedValue(identityError("permission_denied")),
      }),
    });

    expect(
      await screen.findByText("Your account cannot manage permissions here"),
    ).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toEqual([]);
  });

  it("reapplies the bundle, clearing overrides and revokes", async () => {
    const calls: string[] = [];
    const save = vi.fn(async (m: WorkforceMember) => m);
    const tenancy = makeTenancy({
      grantPermission: vi.fn(async (p) => {
        calls.push(`grant:${p.permission}`);
      }),
      revokePermission: vi.fn(async (p) => {
        calls.push(`revoke:${p.permission}`);
      }),
    });
    const changes: MemberChangeEvent[] = [];
    renderPermissions({
      client: makeClient({ workforceMemberSave: save }),
      tenancy,
      onMemberChange: (e) => changes.push(e),
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Reapply bundle" }),
    );

    await waitFor(() => expect(save).toHaveBeenCalled());
    // The bundle set is granted in order, then the overrides outside it drop.
    expect(calls).toEqual([
      "grant:vehicles_view",
      "grant:requests_view",
      "grant:quotes_view",
      "revoke:assign",
    ]);
    expect(save).toHaveBeenCalledWith({
      ...agent(),
      properties: {
        platform_role: "admin",
        access_bundle: { [NS]: "sales_agent" },
        permission_grants: { [NS]: AGENT_PERMISSIONS },
        permission_revokes: {},
      },
    });
    expect(changes.map((c) => c.change)).toEqual(["grants"]);
    expect(within(rowFor("Requests View")).getByText("Bundle")).toBeTruthy();
  });

  it("opens the member dialog to change the bundle", async () => {
    renderPermissions();

    fireEvent.click(
      await screen.findByRole("button", { name: "Change bundle" }),
    );

    expect(await screen.findByText("Edit member")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Access bundle/), {
      target: { value: "sales" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // The panel shows the new bundle without waiting for a reload.
    expect(await screen.findByText("Sales")).toBeTruthy();
    expect(within(rowFor("Quotes Create")).getByText("Bundle")).toBeTruthy();
  });

  it("reports and retries grants the bundle change could not apply", async () => {
    const grant = vi.fn(async (p: { permission: string }) => {
      if (p.permission === "quotes_create") throw new Error("keto down");
    });
    const changes: MemberChangeEvent[] = [];
    renderPermissions({
      tenancy: makeTenancy({ grantPermission: grant }),
      onMemberChange: (e) => changes.push(e),
    });

    fireEvent.click(
      await screen.findByRole("button", { name: "Change bundle" }),
    );
    fireEvent.change(await screen.findByLabelText(/Access bundle/), {
      target: { value: "sales" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText(/quotes_create: keto down/)).toBeTruthy();
    expect(
      screen.getByText("Some permissions couldn't be applied"),
    ).toBeTruthy();

    grant.mockResolvedValue(undefined);
    grant.mockClear();
    fireEvent.click(screen.getByRole("button", { name: "Retry grants" }));

    await waitFor(() => expect(grant).toHaveBeenCalledTimes(1));
    // Only the write that failed is repeated.
    expect(grant).toHaveBeenCalledWith({
      namespace: NS,
      permission: "quotes_create",
      profileId: "p1",
    });
    await waitFor(() => expect(screen.queryByText(/keto down/)).toBeNull());
    expect(changes.map((c) => c.change)).toEqual(["updated", "grants"]);
  });

  it("filters the member list by the search box", async () => {
    renderPermissions({
      client: makeClient({
        workforceMemberSearch: vi
          .fn()
          .mockResolvedValue([
            agent(),
            agent({ id: "m2", profileId: "p2", state: "CREATED" }),
          ]),
      }),
    });

    await screen.findByRole("button", { name: /Jane/ });
    expect(screen.getByRole("button", { name: /p2/ })).toBeTruthy();

    fireEvent.change(screen.getByPlaceholderText("Search members"), {
      target: { value: "jan" },
    });

    expect(screen.queryByRole("button", { name: /p2/ })).toBeNull();
  });

  it("shows the permissions of the member picked from the list", async () => {
    renderPermissions({
      client: makeClient({
        workforceMemberSearch: vi.fn().mockResolvedValue([
          // Listed second, but created, so the active member sorts first.
          agent({ id: "m2", profileId: "p2", state: "CREATED" }),
          agent(),
        ]),
      }),
    });

    const [first] = await screen.findAllByRole("button", { name: /Jane|p2/ });
    expect(first!.textContent).toContain("Jane");

    fireEvent.click(screen.getByRole("button", { name: /p2/ }));
    expect(
      screen.getByRole("button", { name: /p2/ }).getAttribute("aria-current"),
    ).toBe("true");
    expect(screen.getAllByText("p2").length).toBeGreaterThan(1);
  });

  it("offers a retry when the member list fails to load", async () => {
    const search = vi.fn().mockRejectedValue(new Error("identity down"));
    renderPermissions({
      client: makeClient({ workforceMemberSearch: search }),
    });

    expect(await screen.findByRole("alert")).toBeTruthy();
    search.mockResolvedValue([agent()]);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByLabelText("Vehicles View")).toBeTruthy();
  });

  it("prompts for members when the organisation has none", async () => {
    renderPermissions({
      client: makeClient({
        workforceMemberSearch: vi.fn().mockResolvedValue([]),
      }),
    });

    expect(await screen.findByText("No members yet")).toBeTruthy();
    expect(screen.queryAllByRole("checkbox")).toEqual([]);
  });
});

/** Let a newly-shown screen finish its loads inside act(). */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const rootClient = makeClient({
  workforceMemberSearch: vi.fn().mockResolvedValue([]),
});

vi.mock("../../services/identity-client.js", () => ({
  createIdentityClient: () => rootClient,
}));
vi.mock("../../services/profile-resolver.js", () => ({
  createProfileResolver: () => ({
    resolve: vi.fn().mockResolvedValue(new Map()),
    byContact: vi.fn(),
  }),
}));

function runtime(): AuthRuntime {
  return {
    version: "test",
    getState: () => "authenticated",
    onAuthStateChange: (cb: (s: "authenticated") => void) => {
      cb("authenticated");
      return () => {};
    },
    onSecurityEvent: () => () => {},
    ensureAuthenticated: vi.fn(),
    logout: vi.fn(),
    fetch: vi.fn().mockResolvedValue({ data: CATALOGUE }),
    upload: vi.fn(),
    getRoles: vi.fn().mockResolvedValue([]),
    getClaims: vi.fn().mockResolvedValue({}),
    prefetchDiscovery: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  } as unknown as AuthRuntime;
}

describe("permissions tab", () => {
  it("is hidden without a permission model", async () => {
    render(
      <IdentityWidgetRoot
        runtime={runtime()}
        apiBaseUrl="https://api.stawi.org/identity"
      />,
    );
    await screen.findByRole("tablist");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Members",
      "Teams",
      "Roles",
    ]);
    await settle();
  });

  it("is shown with a permission model and honours initialView", async () => {
    render(
      <IdentityWidgetRoot
        runtime={runtime()}
        apiBaseUrl="https://api.stawi.org/identity"
        permissionModel={MODEL}
        initialView="permissions"
      />,
    );
    await screen.findByRole("tablist");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Members",
      "Teams",
      "Roles",
      "Permissions",
    ]);
    const tab = screen.getByRole("tab", { name: "Permissions" });
    expect(tab.getAttribute("aria-selected")).toBe("true");
    await settle();
  });
});
