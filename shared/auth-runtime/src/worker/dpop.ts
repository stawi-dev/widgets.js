import { exportDpopPublicJwk, sha256Base64Url } from "./crypto.js";

export interface DpopContext {
  privateKey: CryptoKey;
  publicJwk: JsonWebKey;
  clockOffsetMs: number;
  nonceByOrigin: Map<string, string>;
}

export async function makeDpopContext(kp: CryptoKeyPair): Promise<DpopContext> {
  const publicJwk = await exportDpopPublicJwk(kp);
  return { privateKey: kp.privateKey, publicJwk, clockOffsetMs: 0, nonceByOrigin: new Map() };
}

function b64url(bytes: Uint8Array): string {
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64urlJson(v: unknown): string {
  return b64url(new TextEncoder().encode(JSON.stringify(v)));
}

function originOf(url: string): string {
  try { return new URL(url).origin; } catch { return url; }
}

export function rememberNonce(ctx: DpopContext, audienceUrl: string, headers: Headers): void {
  const n = headers.get("dpop-nonce") ?? headers.get("DPoP-Nonce");
  if (n) ctx.nonceByOrigin.set(originOf(audienceUrl), n);
}

export function rememberClockOffset(ctx: DpopContext, headers: Headers): void {
  const d = headers.get("date");
  if (!d) return;
  const serverMs = Date.parse(d);
  if (!Number.isFinite(serverMs)) return;
  ctx.clockOffsetMs = serverMs - Date.now();
}

interface ProofOpts { htm: string; htu: string; accessToken?: string; }

export async function proof(ctx: DpopContext, opts: ProofOpts): Promise<string> {
  const header = {
    typ: "dpop+jwt",
    alg: "ES256",
    jwk: { kty: ctx.publicJwk.kty, crv: ctx.publicJwk.crv, x: ctx.publicJwk.x, y: ctx.publicJwk.y },
  };
  const payload: Record<string, unknown> = {
    htm: opts.htm.toUpperCase(),
    htu: opts.htu,
    iat: Math.floor((Date.now() + ctx.clockOffsetMs) / 1000),
    jti: b64url(crypto.getRandomValues(new Uint8Array(16))),
  };
  if (opts.accessToken) payload.ath = await sha256Base64Url(opts.accessToken);
  const nonce = ctx.nonceByOrigin.get(originOf(opts.htu));
  if (nonce) payload.nonce = nonce;

  const signingInput = `${b64urlJson(header)}.${b64urlJson(payload)}`;
  const sig = await crypto.subtle.sign(
    { name: "ECDSA", hash: "SHA-256" },
    ctx.privateKey,
    new TextEncoder().encode(signingInput),
  );
  return `${signingInput}.${b64url(new Uint8Array(sig))}`;
}
