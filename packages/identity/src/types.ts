import type { AuthRuntime, AuthState } from "@stawi/auth-runtime";
import type { IdentityVocabulary } from "./vocabulary/types.js";
import type { PermissionModel } from "./permissions/types.js";
import type { IdentityWidgetThemedTokens } from "./themes/types.js";

/** The tab a host can land the widget on. */
export type IdentityView = "members" | "teams" | "roles" | "units";

/** Lifecycle state shared by every identity record. */
export type State = "CREATED" | "CHECKED" | "ACTIVE" | "INACTIVE" | "DELETED";

export type OrganizationType =
  | "ORGANIZATION_TYPE_UNSPECIFIED"
  | "ORGANIZATION_TYPE_BANK"
  | "ORGANIZATION_TYPE_MICROFINANCE"
  | "ORGANIZATION_TYPE_SACCO"
  | "ORGANIZATION_TYPE_FINTECH"
  | "ORGANIZATION_TYPE_COOPERATIVE"
  | "ORGANIZATION_TYPE_NGO"
  | "ORGANIZATION_TYPE_GOVERNMENT"
  | "ORGANIZATION_TYPE_OTHER"
  | "ORGANIZATION_TYPE_TRADING"
  | "ORGANIZATION_TYPE_RETAIL"
  | "ORGANIZATION_TYPE_MANUFACTURING"
  | "ORGANIZATION_TYPE_LOGISTICS"
  | "ORGANIZATION_TYPE_SERVICES";

export type OrgUnitType =
  | "ORG_UNIT_TYPE_REGION"
  | "ORG_UNIT_TYPE_ZONE"
  | "ORG_UNIT_TYPE_AREA"
  | "ORG_UNIT_TYPE_CLUSTER"
  | "ORG_UNIT_TYPE_BRANCH"
  | "ORG_UNIT_TYPE_OTHER";

export type AccessScopeType =
  | "ACCESS_SCOPE_TYPE_GLOBAL"
  | "ACCESS_SCOPE_TYPE_ORGANIZATION"
  | "ACCESS_SCOPE_TYPE_ORG_UNIT"
  | "ACCESS_SCOPE_TYPE_TEAM";

export interface Organization {
  id: string;
  name: string;
  code: string;
  partitionId?: string;
  profileId?: string;
  state?: State;
  organizationType?: OrganizationType;
  geoId?: string;
  domain?: string;
  parentId?: string;
  properties?: Record<string, unknown>;
}

export interface OrgUnit {
  id: string;
  organizationId: string;
  parentId?: string;
  name: string;
  code: string;
  type?: OrgUnitType;
  geoId?: string;
  state?: State;
  hasChildren?: boolean;
}

export interface WorkforceMember {
  id: string;
  organizationId: string;
  profileId: string;
  engagementType?: string;
  homeOrgUnitId?: string;
  geoId?: string;
  state?: State;
  properties?: Record<string, unknown>;
}

export interface InternalTeam {
  id: string;
  organizationId: string;
  parentTeamId?: string;
  homeOrgUnitId?: string;
  name: string;
  code: string;
  teamType?: string;
  objective?: string;
  geoId?: string;
  state?: State;
  properties?: Record<string, unknown>;
}

export interface TeamMembership {
  id: string;
  teamId: string;
  memberId: string;
  membershipRole?: string;
  isPrimaryTeam?: boolean;
  state?: State;
}

export interface AccessRoleAssignment {
  id: string;
  memberId: string;
  roleKey: string;
  scopeType: AccessScopeType;
  scopeId?: string;
  state?: State;
}

/** Page window for the `*Search` RPCs. */
export interface PageCursor {
  limit?: number;
  page?: string;
}

/**
 * Everything a host can configure on the widget. `mount()` accepts these
 * plus a `target`; React hosts spread them onto `<IdentityWidgetRoot />`.
 */
export interface IdentityWidgetProps {
  /**
   * A pre-built runtime, shared with the rest of the host page so every
   * island reads the same token store. Recommended. When omitted, the
   * widget builds its own from `installationId` / `clientId` / `idpBaseUrl`.
   */
  runtime?: AuthRuntime;
  installationId?: string;
  clientId?: string;
  idpBaseUrl?: string;
  logoutRedirectUri?: string;
  /** Identity service base, e.g. `https://api.stawi.org/identity`. */
  apiBaseUrl: string;
  /**
   * Profile service base, used for name resolution and invite-by-contact.
   * Defaults to `apiBaseUrl` with its last path segment replaced by
   * `/profile`.
   */
  profileApiBaseUrl?: string;
  /**
   * Tenancy service base, used to grant and revoke permissions. Defaults to
   * `apiBaseUrl` with its last path segment replaced by `/tenancy`.
   */
  tenancyApiBaseUrl?: string;
  /**
   * Access bundles and labels the host offers. When set, the member dialog
   * shows a bundle select instead of `vocabulary.platformRoles`, and
   * activating a member applies the bundle's permissions in tenancy.
   */
  permissionModel?: PermissionModel;
  /** Notified after every member write the widget makes. */
  onMemberChange?: (event: {
    member: WorkforceMember;
    change: "created" | "updated" | "activated" | "deactivated" | "grants";
  }) => void;
  /** Pin one organization instead of showing the picker. */
  organizationId?: string;
  /** Offer the create form when the caller belongs to no organization. */
  allowCreateOrganization?: boolean;
  /** Merged over `generalVocabulary`. */
  vocabulary?: Partial<IdentityVocabulary>;
  /** Optional screens. Defaults: `orgUnits` off, `platformRoles` on. */
  features?: { orgUnits?: boolean; platformRoles?: boolean };
  /** Tab shown first. Ignored when the named view is disabled. */
  initialView?: IdentityView;
  theme?: "light" | "dark" | "auto";
  tokens?: IdentityWidgetThemedTokens;
  /** Raw CSS appended last, so it wins over the widget stylesheet. */
  css?: string;
  /** BCP-47 locale. `en` and `sw` ship; RTL locales set `dir="rtl"`. */
  locale?: string;
  onError?: (err: unknown) => void;
  onAuthStateChange?: (state: AuthState) => void;
  onMetric?: (
    name: string,
    durationMs: number,
    tags: Record<string, string>,
  ) => void;
}
