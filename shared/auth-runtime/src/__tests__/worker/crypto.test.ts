import { describe, it, expect } from "vitest";
import {
  generateDpopKey, generateWrapKey, wrap, unwrap,
  exportDpopPublicJwk, sha256Base64Url, assertNonExtractable,
} from "../../worker/crypto.js";
import { AuthError } from "../../shared/errors.js";

describe("crypto", () => {
  it("generates non-extractable DPoP key pair", async () => {
    const kp = await generateDpopKey();
    expect(kp.privateKey.extractable).toBe(false);
    expect(kp.privateKey.algorithm).toMatchObject({ name: "ECDSA", namedCurve: "P-256" });
    expect(kp.privateKey.usages).toContain("sign");
    const jwk = await exportDpopPublicJwk(kp);
    expect(jwk.crv).toBe("P-256");
  });

  it("private key cannot be exported", async () => {
    const kp = await generateDpopKey();
    await expect(crypto.subtle.exportKey("jwk", kp.privateKey)).rejects.toBeDefined();
  });

  it("wraps and unwraps a secret", async () => {
    const wk = await generateWrapKey();
    expect(wk.extractable).toBe(false);
    const blob = await wrap(wk, "rt.abc");
    const back = await unwrap(wk, blob);
    expect(back).toBe("rt.abc");
  });

  it("sha256Base64Url is stable", async () => {
    const a = await sha256Base64Url("x");
    expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(a).toBe(await sha256Base64Url("x"));
  });

  it("assertNonExtractable throws on extractable keys", async () => {
    const k = await crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"],
    );
    expect(() => assertNonExtractable(k)).toThrow(AuthError);
  });
});
