import { describe, it, expect } from "vitest";
import { generateVerifier, generateChallenge, generatePkcePair } from "../pkce.js";

describe("PKCE", () => {
  it("generates a verifier of expected length", () => {
    const verifier = generateVerifier();
    // 64 random bytes → ~86 chars base64url
    expect(verifier.length).toBeGreaterThan(40);
    expect(verifier).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates a SHA-256 challenge from verifier", async () => {
    const verifier = generateVerifier();
    const challenge = await generateChallenge(verifier);
    // SHA-256 → 32 bytes → 43 chars base64url
    expect(challenge.length).toBe(43);
    expect(challenge).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it("generates a consistent challenge for the same verifier", async () => {
    const verifier = "test-verifier-123";
    const c1 = await generateChallenge(verifier);
    const c2 = await generateChallenge(verifier);
    expect(c1).toBe(c2);
  });

  it("generates a pair with both verifier and challenge", async () => {
    const pair = await generatePkcePair();
    expect(pair.verifier).toBeTruthy();
    expect(pair.challenge).toBeTruthy();
    expect(pair.verifier).not.toBe(pair.challenge);
  });
});
