/** Reads `properties.platform_role`, which is stored as a free-form string. */
export function platformRoleOf(
  properties: Record<string, unknown> | undefined,
): string {
  const role = properties?.platform_role;
  return typeof role === "string" ? role : "";
}
