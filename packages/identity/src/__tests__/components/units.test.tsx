import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useEffect, type ReactNode } from "react";
import {
  IdentityProvider,
  useIdentity,
} from "../../context/identity-context.js";
import { UnitsView } from "../../components/units/UnitsView.js";
import type { IdentityClient } from "../../services/identity-client.js";
import type { ProfileResolver } from "../../services/profile-resolver.js";
import type { Organization, OrgUnit } from "../../types.js";

const ORG: Organization = { id: "o1", name: "Acme", code: "ACME" };

function unit(over: Partial<OrgUnit> = {}): OrgUnit {
  return {
    id: "u1",
    organizationId: "o1",
    name: "Coast",
    code: "CST",
    type: "ORG_UNIT_TYPE_REGION",
    geoId: "KE",
    state: "ACTIVE",
    ...over,
  };
}

function makeClient(overrides: Partial<IdentityClient> = {}): IdentityClient {
  return {
    organizationSearch: vi.fn().mockResolvedValue([]),
    organizationSave: vi.fn(),
    orgUnitSearch: vi.fn().mockResolvedValue([]),
    orgUnitSave: vi.fn().mockResolvedValue(unit()),
    workforceMemberSearch: vi.fn().mockResolvedValue([]),
    workforceMemberGet: vi.fn(),
    workforceMemberSave: vi.fn(),
    internalTeamSearch: vi.fn().mockResolvedValue([]),
    internalTeamSave: vi.fn(),
    teamMembershipSearch: vi.fn().mockResolvedValue([]),
    teamMembershipSave: vi.fn(),
    accessRoleAssignmentSearch: vi.fn().mockResolvedValue([]),
    accessRoleAssignmentSave: vi.fn(),
    ...overrides,
  };
}

const resolver: ProfileResolver = {
  resolve: vi.fn().mockResolvedValue(new Map()),
  byContact: vi.fn(),
};

function SelectOrg({ children }: { children: ReactNode }) {
  const { organization, setOrganization } = useIdentity();
  useEffect(() => {
    if (!organization) setOrganization(ORG);
  }, [organization, setOrganization]);
  return organization ? <>{children}</> : null;
}

function renderUnits(client: IdentityClient) {
  return render(
    <IdentityProvider
      client={client}
      profileResolver={resolver}
      features={{ orgUnits: true }}
    >
      <SelectOrg>
        <UnitsView />
      </SelectOrg>
    </IdentityProvider>,
  );
}

describe("UnitsView", () => {
  it("lists units with name, code, type label and state", async () => {
    const client = makeClient({
      orgUnitSearch: vi.fn().mockResolvedValue([unit()]),
    });
    renderUnits(client);

    expect(await screen.findByText("Coast")).toBeTruthy();
    expect(screen.getByText("CST")).toBeTruthy();
    expect(screen.getByText("Region")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(client.orgUnitSearch).toHaveBeenCalledWith({
      organizationId: "o1",
      cursor: { limit: 50 },
    });
  });

  it("renders a child unit under its parent, indented", async () => {
    const client = makeClient({
      orgUnitSearch: vi.fn().mockResolvedValue([
        // Deliberately out of order: the child arrives before its parent.
        unit({ id: "u2", name: "Mombasa", code: "MSA", parentId: "u1" }),
        unit({ id: "u1", name: "Coast", code: "CST" }),
      ]),
    });
    const { container } = renderUnits(client);

    await screen.findByText("Coast");
    const rows = container.querySelectorAll("tbody tr");
    expect(rows.length).toBe(2);
    expect(rows[0]!.textContent).toContain("Coast");
    expect(rows[1]!.textContent).toContain("Mombasa");
    expect(
      rows[0]!.querySelector(".aiw-units-name")?.getAttribute("data-depth"),
    ).toBe("0");
    expect(
      rows[1]!.querySelector(".aiw-units-name")?.getAttribute("data-depth"),
    ).toBe("1");
  });

  it("renders every unit even when the parent chain is a cycle", async () => {
    // A -> B -> A: neither is a root, so a naive walk would drop both.
    const client = makeClient({
      orgUnitSearch: vi
        .fn()
        .mockResolvedValue([
          unit({ id: "u1", name: "Alpha", code: "ALP", parentId: "u2" }),
          unit({ id: "u2", name: "Beta", code: "BET", parentId: "u1" }),
        ]),
    });
    const { container } = renderUnits(client);

    await screen.findByText("Alpha");
    expect(screen.getByText("Beta")).toBeTruthy();
    expect(container.querySelectorAll("tbody tr").length).toBe(2);
  });

  it("shows an empty state with a create action", async () => {
    const client = makeClient();
    renderUnits(client);
    expect(await screen.findByText("No org units yet")).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Create the first unit" }),
    ).toBeTruthy();
  });

  it("posts a create payload with organization, type and default state", async () => {
    const client = makeClient({
      orgUnitSearch: vi.fn().mockResolvedValue([unit()]),
    });
    renderUnits(client);
    await screen.findByText("Coast");

    fireEvent.click(screen.getByRole("button", { name: "Create unit" }));

    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Nairobi" },
    });
    fireEvent.change(screen.getByLabelText(/^Code/), {
      target: { value: "NBO" },
    });
    fireEvent.change(screen.getByLabelText("Type"), {
      target: { value: "ORG_UNIT_TYPE_BRANCH" },
    });
    fireEvent.change(screen.getByLabelText("Parent unit"), {
      target: { value: "u1" },
    });
    fireEvent.change(screen.getByLabelText(/^Coverage geo id/), {
      target: { value: "KE-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(client.orgUnitSave).toHaveBeenCalledWith({
        organizationId: "o1",
        name: "Nairobi",
        code: "NBO",
        type: "ORG_UNIT_TYPE_BRANCH",
        parentId: "u1",
        geoId: "KE-30",
        state: "ACTIVE",
      });
    });
  });

  it("requires a name, a code and a geo id", async () => {
    const client = makeClient();
    renderUnits(client);
    await screen.findByText("No org units yet");

    fireEvent.click(
      screen.getByRole("button", { name: "Create the first unit" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    await waitFor(() => {
      expect(screen.getAllByText("Required").length).toBe(3);
    });
    expect(client.orgUnitSave).not.toHaveBeenCalled();
  });

  it("spreads the existing unit when editing so unknown fields survive", async () => {
    const existing = unit({ state: "CREATED", hasChildren: true });
    const client = makeClient({
      orgUnitSearch: vi.fn().mockResolvedValue([existing]),
    });
    renderUnits(client);
    await screen.findByText("Coast");

    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Coast Region" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(client.orgUnitSave).toHaveBeenCalledWith({
        ...existing,
        name: "Coast Region",
        code: "CST",
        type: "ORG_UNIT_TYPE_REGION",
        geoId: "KE",
        state: "CREATED",
      });
    });
    // A unit cannot be its own parent, so it is absent from the parent list.
    expect(client.orgUnitSave).not.toHaveBeenCalledWith(
      expect.objectContaining({ parentId: "u1" }),
    );
  });

  it("surfaces a load failure with a retry", async () => {
    const search = vi
      .fn()
      .mockRejectedValueOnce(new Error("boom"))
      .mockResolvedValue([unit()]);
    renderUnits(makeClient({ orgUnitSearch: search }));

    expect(await screen.findByText("Couldn't load org units")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("Coast")).toBeTruthy();
  });

  it("surfaces a save failure inline", async () => {
    const client = makeClient({
      orgUnitSave: vi.fn().mockRejectedValue(new Error("nope")),
    });
    renderUnits(client);
    await screen.findByText("No org units yet");

    fireEvent.click(
      screen.getByRole("button", { name: "Create the first unit" }),
    );
    fireEvent.change(screen.getByLabelText(/^Name/), {
      target: { value: "Nairobi" },
    });
    fireEvent.change(screen.getByLabelText(/^Code/), {
      target: { value: "NBO" },
    });
    fireEvent.change(screen.getByLabelText(/^Coverage geo id/), {
      target: { value: "KE-30" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create" }));

    expect(await screen.findByText("nope")).toBeTruthy();
  });
});
