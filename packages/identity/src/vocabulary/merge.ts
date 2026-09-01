import type { IdentityVocabulary } from "./types.js";

/**
 * Merges a host-supplied `Partial<IdentityVocabulary>` over a base preset.
 * Arrays are replaced wholesale by the override (not concatenated); `labels`
 * is shallow-merged so hosts can rename a single label without repeating
 * the rest.
 *
 * The base preset is never mutated: a fresh, frozen `IdentityVocabulary` is
 * returned. When `override` is omitted, `base` itself is returned unchanged
 * (it is already frozen). An override's own arrays are used by reference in
 * the merged result — they are host-owned, not shared preset state — so the
 * base preset's frozen arrays are never aliased into a mutable object.
 */
export function mergeVocabulary(
  base: IdentityVocabulary,
  override?: Partial<IdentityVocabulary>,
): IdentityVocabulary {
  if (!override) {
    return base;
  }
  return Object.freeze({
    organizationTypes: override.organizationTypes ?? base.organizationTypes,
    teamTypes: override.teamTypes ?? base.teamTypes,
    membershipRoles: override.membershipRoles ?? base.membershipRoles,
    engagementTypes: override.engagementTypes ?? base.engagementTypes,
    roleKeys: override.roleKeys ?? base.roleKeys,
    platformRoles: override.platformRoles ?? base.platformRoles,
    labels: Object.freeze({ ...base.labels, ...override.labels }),
  });
}
