import { describe, it, expect } from "vitest";
import { decodeJwtPayload, extractRolesFromToken } from "../../shared/jwt.js";

function encodePayload(payload: object): string {
  const json = JSON.stringify(payload);
  const b64 = btoa(json)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
  // header and signature don't need validity
  return `hh.${b64}.ss`;
}

describe("jwt", () => {
  it("decodes payloads of varied length (padding handled)", () => {
    for (let n = 1; n < 20; n++) {
      const token = encodePayload({ sub: "x".repeat(n) });
      const p = decodeJwtPayload(token);
      expect(p.sub).toBe("x".repeat(n));
    }
  });
  it("extracts roles from direct claim", () => {
    expect(
      extractRolesFromToken(encodePayload({ roles: ["admin", 1, "user"] })),
    ).toEqual(["admin", "user"]);
  });
  it("extracts from realm_access.roles", () => {
    expect(
      extractRolesFromToken(encodePayload({ realm_access: { roles: ["x"] } })),
    ).toEqual(["x"]);
  });
  it("returns [] on invalid JWTs", () => {
    expect(extractRolesFromToken("bad")).toEqual([]);
  });
});
