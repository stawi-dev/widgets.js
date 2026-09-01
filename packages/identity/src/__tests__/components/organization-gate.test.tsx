import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { IdentityProvider } from "../../context/identity-context.js";
import { OrganizationGate } from "../../components/OrganizationGate.js";
import { createProfileResolver } from "../../services/profile-resolver.js";
import type { IdentityClient } from "../../services/identity-client.js";
import type { Organization } from "../../types.js";

function org(id: string, name: string): Organization {
  return { id, name, code: name.toUpperCase() };
}

function makeClient(overrides: Partial<IdentityClient> = {}): IdentityClient {
  return {
    organizationSearch: vi.fn().mockResolvedValue([]),
    organizationSave: vi.fn(),
    orgUnitSearch: vi.fn(),
    orgUnitSave: vi.fn(),
    workforceMemberSearch: vi.fn(),
    workforceMemberGet: vi.fn(),
    workforceMemberSave: vi.fn(),
    internalTeamSearch: vi.fn(),
    internalTeamSave: vi.fn(),
    teamMembershipSearch: vi.fn(),
    teamMembershipSave: vi.fn(),
    accessRoleAssignmentSearch: vi.fn(),
    accessRoleAssignmentSave: vi.fn(),
    ...overrides,
  } as IdentityClient;
}

function renderGate(
  client: IdentityClient,
  props: Record<string, unknown> = {},
) {
  const resolver = createProfileResolver({
    runtime: { fetch: vi.fn() } as never,
    profileApiBaseUrl: "https://api.example.test/profile",
  });
  const children: ReactNode = <div>inside</div>;
  return render(
    <IdentityProvider client={client} profileResolver={resolver}>
      <OrganizationGate {...props}>{children}</OrganizationGate>
    </IdentityProvider>,
  );
}

describe("OrganizationGate", () => {
  beforeEach(() => vi.clearAllMocks());

  it("shows the create form when no organizations exist", async () => {
    const client = makeClient();
    renderGate(client);

    expect(await screen.findByLabelText(/Name/)).toBeTruthy();
    expect(screen.getByLabelText(/Code/)).toBeTruthy();
    expect(screen.getByLabelText(/Type/)).toBeTruthy();
    expect(screen.getByLabelText(/Coverage geo id/)).toBeTruthy();
    expect(screen.getByLabelText(/Domain/)).toBeTruthy();
    expect(screen.queryByText("inside")).toBeNull();
  });

  it("shows an empty state instead of the form when creation is disallowed", async () => {
    const client = makeClient();
    renderGate(client, { allowCreateOrganization: false });

    expect(await screen.findByText(/No organizations/)).toBeTruthy();
    expect(screen.queryByLabelText(/Name/)).toBeNull();
  });

  it("auto-selects when exactly one organization is visible", async () => {
    const client = makeClient({
      organizationSearch: vi.fn().mockResolvedValue([org("o1", "Solo")]),
    });
    renderGate(client);

    expect(await screen.findByText("inside")).toBeTruthy();
  });

  it("shows a picker when several organizations are visible", async () => {
    const client = makeClient({
      organizationSearch: vi
        .fn()
        .mockResolvedValue([org("o1", "Alpha"), org("o2", "Beta")]),
    });
    renderGate(client);

    const pick = await screen.findByRole("button", { name: /Beta/ });
    expect(screen.queryByText("inside")).toBeNull();

    fireEvent.click(pick);
    expect(await screen.findByText("inside")).toBeTruthy();
  });

  it("selects the pinned organization when organizationId is given", async () => {
    const client = makeClient({
      organizationSearch: vi
        .fn()
        .mockResolvedValue([org("o1", "Alpha"), org("o2", "Beta")]),
    });
    renderGate(client, { organizationId: "o2" });

    expect(await screen.findByText("inside")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Alpha/ })).toBeNull();
  });

  it("reports a pinned organization that is not visible", async () => {
    const client = makeClient({
      organizationSearch: vi.fn().mockResolvedValue([org("o1", "Alpha")]),
    });
    renderGate(client, { organizationId: "missing" });

    expect(await screen.findByText(/isn't available/)).toBeTruthy();
  });

  it("surfaces a search failure with a retry", async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error("nope"))
      .mockResolvedValue([org("o1", "Solo")]);
    renderGate(makeClient({ organizationSearch: search }));

    fireEvent.click(await screen.findByRole("button", { name: "Retry" }));
    expect(await screen.findByText("inside")).toBeTruthy();
  });
});

describe("OrganizationGate create form", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires name, code and geo id before saving", async () => {
    const save = vi.fn();
    renderGate(makeClient({ organizationSave: save }));

    fireEvent.click(
      await screen.findByRole("button", { name: "Create organization" }),
    );

    await waitFor(() => expect(screen.getAllByText("Required").length).toBe(3));
    expect(save).not.toHaveBeenCalled();
  });

  it("saves the organization with its type and selects it", async () => {
    const save = vi.fn().mockResolvedValue({
      id: "new-org",
      name: "Acme",
      code: "ACME",
    });
    renderGate(makeClient({ organizationSave: save }));

    fireEvent.change(await screen.findByLabelText(/Name/), {
      target: { value: "Acme" },
    });
    fireEvent.change(screen.getByLabelText(/Code/), {
      target: { value: "ACME" },
    });
    fireEvent.change(screen.getByLabelText(/Coverage geo id/), {
      target: { value: "KE" },
    });
    fireEvent.change(screen.getByLabelText(/Type/), {
      target: { value: "ORGANIZATION_TYPE_TRADING" },
    });
    fireEvent.change(screen.getByLabelText(/Domain/), {
      target: { value: "acme.test" },
    });

    fireEvent.click(
      screen.getByRole("button", { name: "Create organization" }),
    );

    await waitFor(() =>
      expect(save).toHaveBeenCalledWith({
        name: "Acme",
        code: "ACME",
        organizationType: "ORGANIZATION_TYPE_TRADING",
        geoId: "KE",
        domain: "acme.test",
      }),
    );
    expect(await screen.findByText("inside")).toBeTruthy();
  });

  it("keeps the form open and shows the error when saving fails", async () => {
    const save = vi.fn().mockRejectedValue(new Error("duplicate code"));
    renderGate(makeClient({ organizationSave: save }));

    fireEvent.change(await screen.findByLabelText(/Name/), {
      target: { value: "Acme" },
    });
    fireEvent.change(screen.getByLabelText(/Code/), {
      target: { value: "ACME" },
    });
    fireEvent.change(screen.getByLabelText(/Coverage geo id/), {
      target: { value: "KE" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Create organization" }),
    );

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("duplicate code");
  });
});
