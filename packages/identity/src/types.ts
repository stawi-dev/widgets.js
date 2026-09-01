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
