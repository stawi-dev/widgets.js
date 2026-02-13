/**
 * Decodes the payload of a JWT without verifying the signature.
 * Intended for reading claims client-side (e.g. roles, sub, exp).
 */
export function decodeJwtPayload(
  token: string,
): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new Error("Invalid JWT: expected 3 parts");
  }

  const base64Url = parts[1];
  const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
  const json = atob(base64);
  return JSON.parse(json) as Record<string, unknown>;
}

/**
 * Extracts roles from a JWT access token.
 * Looks for `roles`, `realm_access.roles`, or `resource_access.*.roles` claims.
 * Returns an empty array if no roles are found.
 */
export function extractRolesFromToken(token: string): string[] {
  try {
    const payload = decodeJwtPayload(token);

    // Direct "roles" claim (common in custom IdPs)
    if (Array.isArray(payload.roles)) {
      return payload.roles.filter(
        (r): r is string => typeof r === "string",
      );
    }

    // Keycloak-style "realm_access.roles"
    const realmAccess = payload.realm_access;
    if (
      realmAccess &&
      typeof realmAccess === "object" &&
      !Array.isArray(realmAccess) &&
      Array.isArray((realmAccess as Record<string, unknown>).roles)
    ) {
      return (
        (realmAccess as Record<string, unknown>).roles as unknown[]
      ).filter((r): r is string => typeof r === "string");
    }

    return [];
  } catch {
    return [];
  }
}
