export function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split(".");
  if (parts.length !== 3) throw new Error("Invalid JWT: expected 3 parts");
  let b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4;
  if (pad === 2) b64 += "==";
  else if (pad === 3) b64 += "=";
  else if (pad === 1) throw new Error("Invalid JWT payload length");
  return JSON.parse(atob(b64)) as Record<string, unknown>;
}

export function extractRolesFromToken(token: string): string[] {
  try {
    const p = decodeJwtPayload(token);
    if (Array.isArray(p.roles)) return (p.roles as unknown[]).filter((r): r is string => typeof r === "string");
    const r = (p.realm_access as { roles?: unknown })?.roles;
    if (Array.isArray(r)) return (r as unknown[]).filter((x): x is string => typeof x === "string");
    return [];
  } catch { return []; }
}
