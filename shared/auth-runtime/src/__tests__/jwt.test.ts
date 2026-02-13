import { describe, it, expect } from "vitest";
import { decodeJwtPayload, extractRolesFromToken } from "../jwt.js";

function makeJwt(payload: Record<string, unknown>): string {
  const header = btoa(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  const signature = "fake-signature";
  return `${header}.${body}.${signature}`;
}

describe("decodeJwtPayload", () => {
  it("decodes a valid JWT payload", () => {
    const token = makeJwt({ sub: "user-1", name: "Alice" });
    const payload = decodeJwtPayload(token);
    expect(payload.sub).toBe("user-1");
    expect(payload.name).toBe("Alice");
  });

  it("throws on invalid JWT", () => {
    expect(() => decodeJwtPayload("not-a-jwt")).toThrow("Invalid JWT");
  });
});

describe("extractRolesFromToken", () => {
  it("extracts direct roles claim", () => {
    const token = makeJwt({ roles: ["admin", "owner"] });
    expect(extractRolesFromToken(token)).toEqual(["admin", "owner"]);
  });

  it("extracts Keycloak realm_access.roles", () => {
    const token = makeJwt({
      realm_access: { roles: ["admin", "user"] },
    });
    expect(extractRolesFromToken(token)).toEqual(["admin", "user"]);
  });

  it("returns empty array when no roles", () => {
    const token = makeJwt({ sub: "user-1" });
    expect(extractRolesFromToken(token)).toEqual([]);
  });

  it("returns empty array for invalid token", () => {
    expect(extractRolesFromToken("garbage")).toEqual([]);
  });

  it("filters out non-string roles", () => {
    const token = makeJwt({ roles: ["admin", 42, null, "owner"] });
    expect(extractRolesFromToken(token)).toEqual(["admin", "owner"]);
  });
});
