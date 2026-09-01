export { createIdentityClient } from "./services/identity-client.js";
export type {
  IdentityClient,
  IdentityClientDeps,
  OrganizationQuery,
  OrgUnitQuery,
  WorkforceMemberQuery,
  InternalTeamQuery,
  TeamMembershipQuery,
  AccessRoleAssignmentQuery,
} from "./services/identity-client.js";
export { decodeConnectStream } from "./services/connect-stream.js";
export { IdentityError } from "./services/errors.js";
export type {
  AccessRoleAssignment,
  AccessScopeType,
  InternalTeam,
  Organization,
  OrgUnit,
  OrgUnitType,
  OrganizationType,
  PageCursor,
  State,
  TeamMembership,
  WorkforceMember,
} from "./types.js";
