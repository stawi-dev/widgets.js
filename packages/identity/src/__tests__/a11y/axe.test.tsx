import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import axe from "axe-core";
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
import type { Organization, OrgUnit, WorkforceMember } from "../../types.js";

const ORG: Organization = { id: "o1", name: "Acme", code: "ACME" };

const UNITS: OrgUnit[] = [
  {
    id: "u1",
    organizationId: "o1",
    name: "Coast",
    code: "CST",
    type: "ORG_UNIT_TYPE_REGION",
    state: "ACTIVE",
  },
];

const MEMBERS: WorkforceMember[] = [
  {
    id: "m1",
    organizationId: "o1",
    profileId: "p1",
    engagementType: "employee",
    homeOrgUnitId: "u1",
    state: "ACTIVE",
    properties: { platform_role: "admin" },
  },
  {
    id: "m2",
    organizationId: "o1",
    profileId: "p2",
    engagementType: "contractor",
    state: "CREATED",
  },
];

const PROFILES = new Map<string, ProfileSummary>([
  ["p1", { id: "p1", name: "Jane Doe", email: "jane@example.com" }],
  ["p2", { id: "p2", name: "John Roe", phone: "+254700000000" }],
]);

const client: IdentityClient = {
  organizationSearch: vi.fn().mockResolvedValue([ORG]),
  organizationSave: vi.fn(),
  orgUnitSearch: vi.fn().mockResolvedValue(UNITS),
  orgUnitSave: vi.fn(),
  workforceMemberSearch: vi.fn().mockResolvedValue(MEMBERS),
  workforceMemberGet: vi.fn(),
  workforceMemberSave: vi.fn(),
  internalTeamSearch: vi.fn().mockResolvedValue([]),
  internalTeamSave: vi.fn(),
  teamMembershipSearch: vi.fn().mockResolvedValue([]),
  teamMembershipSave: vi.fn(),
  accessRoleAssignmentSearch: vi.fn().mockResolvedValue([]),
  accessRoleAssignmentSave: vi.fn(),
};

const resolver: ProfileResolver = {
  resolve: vi.fn().mockResolvedValue(PROFILES),
  byContact: vi.fn().mockResolvedValue(null),
};

function SelectOrg({ children }: { children: ReactNode }) {
  const { organization, setOrganization } = useIdentity();
  useEffect(() => {
    if (!organization) setOrganization(ORG);
  }, [organization, setOrganization]);
  return organization ? <>{children}</> : null;
}

// jsdom has no layout, so colour-contrast and region rules cannot run.
// Everything below is a rule our own markup can genuinely violate.
const RULES = [
  "aria-allowed-attr",
  "aria-hidden-focus",
  "aria-required-attr",
  "aria-required-children",
  "aria-required-parent",
  "aria-roles",
  "aria-valid-attr",
  "aria-valid-attr-value",
  "button-name",
  "duplicate-id",
  "duplicate-id-active",
  "duplicate-id-aria",
  "empty-table-header",
  "form-field-multiple-labels",
  "label",
  "link-name",
  "select-name",
  "table-fake-caption",
  "tabindex",
  "td-headers-attr",
  "th-has-data-cells",
];

function runAxe(container: Element): Promise<axe.AxeResults> {
  return new Promise((resolve, reject) => {
    axe.run(
      container,
      { runOnly: { type: "rule", values: RULES } },
      (err, res) => (err ? reject(err) : resolve(res)),
    );
  });
}

describe("Members view a11y (axe)", () => {
  it("has no violations with a populated table", async () => {
    const { container } = render(
      <IdentityProvider
        client={client}
        profileResolver={resolver}
        features={{ orgUnits: true, platformRoles: true }}
      >
        <SelectOrg>
          <MembersView />
        </SelectOrg>
      </IdentityProvider>,
    );

    await screen.findByText("Jane Doe");

    const result = await runAxe(container);
    expect(result.violations).toEqual([]);
  });

  it("has no violations with the register dialog open", async () => {
    const { container } = render(
      <IdentityProvider
        client={client}
        profileResolver={resolver}
        features={{ orgUnits: true, platformRoles: true }}
      >
        <SelectOrg>
          <MembersView />
        </SelectOrg>
      </IdentityProvider>,
    );

    await screen.findByText("Jane Doe");
    fireEvent.click(screen.getByRole("button", { name: "Register member" }));
    await screen.findByRole("dialog");

    const result = await runAxe(container);
    expect(result.violations).toEqual([]);
  });
});
