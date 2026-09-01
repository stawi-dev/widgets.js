import type {
  IdentityVocabulary,
  RoleKeyOption,
  VocabularyOption,
} from "./types.js";

/** Freezes each item in `items` and then the array itself. */
function freezeList<T extends object>(items: readonly T[]): ReadonlyArray<T> {
  for (const item of items) {
    Object.freeze(item);
  }
  return Object.freeze(items);
}

const membershipRoles = freezeList<VocabularyOption>([
  { value: "lead", label: "Lead" },
  { value: "member", label: "Member" },
  { value: "supervisor", label: "Supervisor" },
  { value: "coordinator", label: "Coordinator" },
]);

const engagementTypes = freezeList<VocabularyOption>([
  { value: "employee", label: "Employee" },
  { value: "contractor", label: "Contractor" },
  { value: "agent", label: "Agent" },
  { value: "intern", label: "Intern" },
]);

const platformRoles = freezeList<IdentityVocabulary["platformRoles"][number]>([
  { value: "admin", label: "Administrator" },
  { value: "operator", label: "Operator" },
  { value: "viewer", label: "Viewer" },
  { value: "member", label: "Member" },
]);

const defaultLabels: IdentityVocabulary["labels"] = Object.freeze({
  members: "Members",
  teams: "Teams",
  roles: "Roles",
  units: "Org units",
  organization: "Organisation",
});

/** Freezes the top-level vocabulary object; its list fields are already frozen. */
function freezeVocabulary(vocabulary: IdentityVocabulary): IdentityVocabulary {
  return Object.freeze(vocabulary);
}

/** Trading, manufacturing, logistics, and services tenants (the default). */
export const generalVocabulary: IdentityVocabulary = freezeVocabulary({
  organizationTypes: freezeList([
    { value: "ORGANIZATION_TYPE_TRADING", label: "Trading" },
    { value: "ORGANIZATION_TYPE_RETAIL", label: "Retail" },
    { value: "ORGANIZATION_TYPE_MANUFACTURING", label: "Manufacturing" },
    { value: "ORGANIZATION_TYPE_LOGISTICS", label: "Logistics" },
    { value: "ORGANIZATION_TYPE_SERVICES", label: "Services" },
    { value: "ORGANIZATION_TYPE_OTHER", label: "Other" },
  ]),
  teamTypes: freezeList<VocabularyOption>([
    { value: "sales", label: "Sales" },
    { value: "operations", label: "Operations" },
    { value: "support", label: "Support" },
    { value: "finance", label: "Finance" },
    { value: "logistics", label: "Logistics" },
  ]),
  membershipRoles,
  engagementTypes,
  roleKeys: freezeList<RoleKeyOption>([
    { key: "identity_administrator", label: "Administrator" },
    { key: "approval_approver", label: "Approver" },
    { key: "approval_verifier", label: "Verifier" },
  ]),
  platformRoles,
  labels: defaultLabels,
});

/** Banks, microfinance, saccos, and other regulated financial tenants. */
export const fintechVocabulary: IdentityVocabulary = freezeVocabulary({
  organizationTypes: freezeList([
    { value: "ORGANIZATION_TYPE_BANK", label: "Bank" },
    { value: "ORGANIZATION_TYPE_MICROFINANCE", label: "Microfinance" },
    { value: "ORGANIZATION_TYPE_SACCO", label: "SACCO" },
    { value: "ORGANIZATION_TYPE_FINTECH", label: "Fintech" },
    { value: "ORGANIZATION_TYPE_COOPERATIVE", label: "Cooperative" },
    { value: "ORGANIZATION_TYPE_NGO", label: "NGO" },
    { value: "ORGANIZATION_TYPE_GOVERNMENT", label: "Government" },
    { value: "ORGANIZATION_TYPE_OTHER", label: "Other" },
  ]),
  teamTypes: freezeList<VocabularyOption>([
    { value: "portfolio", label: "Portfolio" },
    { value: "servicing", label: "Servicing" },
    { value: "collections", label: "Collections" },
    { value: "recovery", label: "Recovery" },
    { value: "agent_network", label: "Agent Network" },
  ]),
  membershipRoles,
  engagementTypes,
  roleKeys: freezeList<RoleKeyOption>([
    { key: "identity_administrator", label: "Administrator" },
    { key: "approval_approver", label: "Approver" },
    { key: "approval_verifier", label: "Verifier" },
  ]),
  platformRoles,
  labels: defaultLabels,
});

/** General commerce tenants (sales, merchandising, fulfilment). */
export const commerceVocabulary: IdentityVocabulary = freezeVocabulary({
  organizationTypes: freezeList([
    { value: "ORGANIZATION_TYPE_TRADING", label: "Trading" },
    { value: "ORGANIZATION_TYPE_RETAIL", label: "Retail" },
    { value: "ORGANIZATION_TYPE_SERVICES", label: "Services" },
    { value: "ORGANIZATION_TYPE_OTHER", label: "Other" },
  ]),
  teamTypes: freezeList<VocabularyOption>([
    { value: "sales", label: "Sales" },
    { value: "merchandising", label: "Merchandising" },
    { value: "procurement", label: "Procurement" },
    { value: "fulfilment", label: "Fulfilment" },
    { value: "customer_service", label: "Customer Service" },
  ]),
  membershipRoles,
  engagementTypes,
  roleKeys: freezeList<RoleKeyOption>([
    { key: "identity_administrator", label: "Administrator" },
    { key: "order_approver", label: "Order Approver" },
    { key: "refund_approver", label: "Refund Approver" },
    { key: "catalog_manager", label: "Catalog Manager" },
  ]),
  platformRoles,
  labels: defaultLabels,
});

/** Manufacturing and production tenants. */
export const manufacturingVocabulary: IdentityVocabulary = freezeVocabulary({
  organizationTypes: freezeList([
    { value: "ORGANIZATION_TYPE_MANUFACTURING", label: "Manufacturing" },
    { value: "ORGANIZATION_TYPE_LOGISTICS", label: "Logistics" },
    { value: "ORGANIZATION_TYPE_OTHER", label: "Other" },
  ]),
  teamTypes: freezeList<VocabularyOption>([
    { value: "production", label: "Production" },
    { value: "quality", label: "Quality" },
    { value: "maintenance", label: "Maintenance" },
    { value: "planning", label: "Planning" },
    { value: "warehouse", label: "Warehouse" },
  ]),
  membershipRoles,
  engagementTypes,
  roleKeys: freezeList<RoleKeyOption>([
    { key: "identity_administrator", label: "Administrator" },
    { key: "shift_supervisor", label: "Shift Supervisor" },
    { key: "quality_approver", label: "Quality Approver" },
    { key: "maintenance_lead", label: "Maintenance Lead" },
  ]),
  platformRoles,
  labels: defaultLabels,
});
