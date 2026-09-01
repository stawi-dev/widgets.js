import type { OrganizationType } from "../types.js";

/** A generic value/label pair used by most vocabulary lists. */
export interface VocabularyOption {
  value: string;
  label: string;
}

/** An access-role-key option, with an optional host-facing description. */
export interface RoleKeyOption {
  key: string;
  label: string;
  description?: string;
}

/**
 * The set of host-configurable vocabulary that lets one identity widget
 * serve fintech, manufacturing, general commerce, and imports tenants
 * without code changes. Hosts pick a preset and/or override individual
 * lists via {@link mergeVocabulary}.
 */
export interface IdentityVocabulary {
  organizationTypes: Array<{ value: OrganizationType; label: string }>;
  teamTypes: VocabularyOption[];
  membershipRoles: VocabularyOption[];
  engagementTypes: VocabularyOption[];
  roleKeys: RoleKeyOption[];
  platformRoles: Array<{
    value: "admin" | "operator" | "viewer" | "member";
    label: string;
  }>;
  labels?: Partial<
    Record<"members" | "teams" | "roles" | "units" | "organization", string>
  >;
}
