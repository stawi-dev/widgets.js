function base64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomBytes(n: number): Uint8Array {
  const buf = new Uint8Array(n);
  crypto.getRandomValues(buf);
  return buf;
}

export function generateVerifier(length = 64): string {
  return base64Url(randomBytes(length));
}

export async function generateChallenge(verifier: string): Promise<string> {
  const bytes = new TextEncoder().encode(verifier);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return base64Url(new Uint8Array(hash));
}

export interface PkcePair { verifier: string; challenge: string; }

export async function generatePkcePair(): Promise<PkcePair> {
  const verifier = generateVerifier();
  const challenge = await generateChallenge(verifier);
  return { verifier, challenge };
}
