import { describe, it, expect } from "vitest";
import { generateDpopKey } from "../../worker/crypto.js";
import { proof, rememberNonce, makeDpopContext } from "../../worker/dpop.js";

function decodeJwt(jwt: string) {
  const [h, p] = jwt.split(".");
  const dec = (s: string) =>
    JSON.parse(
      new TextDecoder().decode(
        Uint8Array.from(
          atob(
            s
              .replace(/-/g, "+")
              .replace(/_/g, "/")
              .padEnd(Math.ceil(s.length / 4) * 4, "="),
          ),
          (c) => c.charCodeAt(0),
        ),
      ),
    );
  return { header: dec(h), payload: dec(p) };
}

describe("dpop", () => {
  it("produces a valid DPoP JWT with embedded public JWK", async () => {
    const kp = await generateDpopKey();
    const ctx = await makeDpopContext(kp);
    const jwt = await proof(ctx, { htm: "POST", htu: "https://i/token" });
    const { header, payload } = decodeJwt(jwt);
    expect(header.typ).toBe("dpop+jwt");
    expect(header.alg).toBe("ES256");
    expect(header.jwk.crv).toBe("P-256");
    expect(payload.htm).toBe("POST");
    expect(payload.htu).toBe("https://i/token");
    expect(payload.iat).toBeTypeOf("number");
    expect(payload.jti).toMatch(/^[A-Za-z0-9_-]{16,}$/);
  });

  it("includes ath claim when accessToken provided", async () => {
    const kp = await generateDpopKey();
    const ctx = await makeDpopContext(kp);
    const jwt = await proof(ctx, {
      htm: "GET",
      htu: "https://a/r",
      accessToken: "at",
    });
    const { payload } = decodeJwt(jwt);
    expect(payload.ath).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("remembers and applies nonces by audience origin", async () => {
    const kp = await generateDpopKey();
    const ctx = await makeDpopContext(kp);
    const h = new Headers({ "dpop-nonce": "n1" });
    rememberNonce(ctx, "https://i/token", h);
    const jwt = await proof(ctx, { htm: "POST", htu: "https://i/token" });
    const { payload } = decodeJwt(jwt);
    expect(payload.nonce).toBe("n1");
  });
});
