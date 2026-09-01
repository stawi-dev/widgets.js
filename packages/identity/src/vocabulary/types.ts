import type { OrganizationType } from "../types.js";

/** A generic value/label pair used by most vocabulary lists. */
export interface VocabularyOption {
  readonly value: string;
  readonly label: string;
}

/** An access-role-key option, with an optional host-facing description. */
export interface RoleKeyOption {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
}

/**
 * The set of host-configurable vocabulary that lets one identity widget
 * serve fintech, manufacturing, general commerce, and imports tenants
 * without code changes. Hosts pick a preset and/or override individual
 * lists via {@link mergeVocabulary}.
 *
 * All list fields are readonly: the exported presets are frozen at runtime
 * (see `presets.ts`), so hosts must build a new array/object (or pass an
 * override to `mergeVocabulary`) rather than mutating a preset in place.
 */
export interface IdentityVocabulary {
  readonly organizationTypes: ReadonlyArray<{
    readonly value: OrganizationType;
    readonly label: string;
  }>;
  readonly teamTypes: ReadonlyArray<VocabularyOption>;
  readonly membershipRoles: ReadonlyArray<VocabularyOption>;
  readonly engagementTypes: ReadonlyArray<VocabularyOption>;
  readonly roleKeys: ReadonlyArray<RoleKeyOption>;
  readonly platformRoles: ReadonlyArray<{
    readonly value: "admin" | "operator" | "viewer" | "member";
    readonly label: string;
  }>;
  readonly labels?: Readonly<
    Partial<
      Record<
        | "members"
        | "teams"
        | "roles"
        | "permissions"
        | "units"
        | "organization",
        string
      >
    >
  >;
}
