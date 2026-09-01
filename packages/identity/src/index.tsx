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
export { createProfileResolver } from "./services/profile-resolver.js";
export type {
  ProfileResolver,
  ProfileResolverDeps,
  ProfileSummary,
} from "./services/profile-resolver.js";
export { IdentityError } from "./services/errors.js";
export {
  generalVocabulary,
  fintechVocabulary,
  commerceVocabulary,
  manufacturingVocabulary,
  mergeVocabulary,
} from "./vocabulary/index.js";
export type {
  IdentityVocabulary,
  VocabularyOption,
  RoleKeyOption,
} from "./vocabulary/index.js";
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
