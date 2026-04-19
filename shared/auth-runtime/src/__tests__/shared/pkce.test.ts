import { describe, it, expect } from "vitest";
import { generatePkcePair, generateChallenge } from "../../shared/pkce.js";

describe("pkce", () => {
  it("verifier is 43–128 url-safe chars, challenge is base64url of sha256", async () => {
    const { verifier, challenge } = await generatePkcePair();
    expect(verifier).toMatch(/^[A-Za-z0-9_-]{43,128}$/);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
    const again = await generateChallenge(verifier);
    expect(again).toBe(challenge);
  });
  it("produces distinct verifiers", async () => {
    const a = await generatePkcePair();
    const b = await generatePkcePair();
    expect(a.verifier).not.toBe(b.verifier);
  });
});
