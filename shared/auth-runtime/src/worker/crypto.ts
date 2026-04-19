import { AuthError } from "../shared/errors.js";

export interface WrappedBlob { iv: Uint8Array; ciphertext: Uint8Array; }

function b64url(bytes: Uint8Array): string {
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function sha256Base64Url(input: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return b64url(new Uint8Array(hash));
}

export function assertNonExtractable(k: CryptoKey): void {
  if (k.extractable) {
    throw new AuthError("CRYPTO_UNSUPPORTED", "non-extractable keys unavailable on this platform");
  }
}

export async function generateDpopKey(): Promise<CryptoKeyPair> {
  try {
    const kp = await crypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      false,
      ["sign", "verify"],
    ) as CryptoKeyPair;
    assertNonExtractable(kp.privateKey);
    return kp;
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError("CRYPTO_UNSUPPORTED", "failed to generate ECDSA key", err);
  }
}

export async function generateWrapKey(): Promise<CryptoKey> {
  const k = await crypto.subtle.generateKey(
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  assertNonExtractable(k);
  return k;
}

export async function wrap(wk: CryptoKey, plaintext: string): Promise<WrappedBlob> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    wk,
    new TextEncoder().encode(plaintext),
  );
  return { iv, ciphertext: new Uint8Array(ct) };
}

export async function unwrap(wk: CryptoKey, blob: WrappedBlob): Promise<string> {
  const pt = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: blob.iv },
    wk,
    blob.ciphertext,
  );
  return new TextDecoder().decode(pt);
}

export async function exportDpopPublicJwk(kp: CryptoKeyPair): Promise<JsonWebKey> {
  // Public key is extractable by spec even when private is not.
  return crypto.subtle.exportKey("jwk", kp.publicKey);
}
