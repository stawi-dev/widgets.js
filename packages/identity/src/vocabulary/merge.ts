import type { IdentityVocabulary } from "./types.js";

/**
 * Merges a host-supplied `Partial<IdentityVocabulary>` over a base preset.
 * Arrays are replaced wholesale by the override (not concatenated); `labels`
 * is shallow-merged so hosts can rename a single label without repeating
 * the rest.
 */
export function mergeVocabulary(
  base: IdentityVocabulary,
  override?: Partial<IdentityVocabulary>,
): IdentityVocabulary {
  if (!override) {
    return base;
  }
  return {
    organizationTypes: override.organizationTypes ?? base.organizationTypes,
    teamTypes: override.teamTypes ?? base.teamTypes,
    membershipRoles: override.membershipRoles ?? base.membershipRoles,
    engagementTypes: override.engagementTypes ?? base.engagementTypes,
    roleKeys: override.roleKeys ?? base.roleKeys,
    platformRoles: override.platformRoles ?? base.platformRoles,
    labels: { ...base.labels, ...override.labels },
  };
}
