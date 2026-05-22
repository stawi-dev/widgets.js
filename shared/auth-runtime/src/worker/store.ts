import type { WrappedBlob } from "./crypto.js";

const DB_NAME = "stawi-auth-v1";
const STORE = "sessions";

export interface Session {
  wrapKey: CryptoKey;
  dpopKey: CryptoKeyPair;
  wrappedRT: WrappedBlob;
  lastIdToken?: string;
  updatedAt: number;
}

// Persisted shape mirrors Session. Non-extractable CryptoKey / CryptoKeyPair
// are structured-cloneable per the Web Crypto spec, so IDB stores them
// opaquely — `extractable: false` blocks `exportKey()` but not the structured
// clone the store transaction performs.
type PersistedShape = {
  wrapKey: CryptoKey;
  dpopKey: CryptoKeyPair;
  wrappedRT: WrappedBlob;
  lastIdToken?: string;
  updatedAt?: number;
};

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(db: IDBDatabase, mode: IDBTransactionMode): IDBObjectStore {
  return db.transaction(STORE, mode).objectStore(STORE);
}

function isCryptoKeyLike(k: unknown): k is CryptoKey {
  // Avoid `instanceof CryptoKey` — @peculiar/webcrypto (Node test polyfill)
  // exposes a CryptoKey class whose instances structured-clone into the
  // global constructor identity, but in fake-indexeddb the stored value
  // round-trips through structuredClone() and loses the prototype tag.
  // Duck-type on the surface we actually call (`subtle.encrypt`/`decrypt`
  // / `subtle.sign` only need `.type`, `.algorithm`, `.usages`).
  if (!k || typeof k !== "object") return false;
  const o = k as { type?: unknown; algorithm?: unknown; usages?: unknown };
  return typeof o.type === "string" && !!o.algorithm && Array.isArray(o.usages);
}

function isCryptoKeyPairLike(kp: unknown): kp is CryptoKeyPair {
  if (!kp || typeof kp !== "object") return false;
  const o = kp as { privateKey?: unknown; publicKey?: unknown };
  return isCryptoKeyLike(o.privateKey) && isCryptoKeyLike(o.publicKey);
}

function isValid(v: unknown): v is PersistedShape {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown> & {
    wrappedRT?: { iv?: { byteLength?: number } | unknown; ciphertext?: { byteLength?: number } | unknown };
  };
  if (!o.wrappedRT || typeof o.wrappedRT !== "object") return false;
  const iv = o.wrappedRT.iv;
  const ct = o.wrappedRT.ciphertext;
  const ivOk = !!(iv && (iv instanceof Uint8Array || (iv instanceof Array) || (iv as { byteLength?: number }).byteLength !== undefined));
  const ctOk = !!(ct && (ct instanceof Uint8Array || (ct instanceof Array) || (ct as { byteLength?: number }).byteLength !== undefined));
  if (!ivOk || !ctOk) return false;
  // Reject sessions persisted by pre-fix builds that dropped the keys —
  // forces a one-time re-login on upgrade rather than letting init wipe
  // the storage and surface a `storage_corruption` security event for
  // what is really an upgrade path.
  if (!isCryptoKeyLike(o.wrapKey)) return false;
  if (!isCryptoKeyPairLike(o.dpopKey)) return false;
  return true;
}

export async function loadSession(namespace: string): Promise<Session | null> {
  const db = await openDb();
  try {
    return await new Promise<Session | null>((resolve) => {
      const req = tx(db, "readonly").get(namespace);
      req.onsuccess = () => {
        const v = req.result;
        if (!isValid(v)) return resolve(null);
        const result: Session = {
          wrapKey: v.wrapKey,
          dpopKey: v.dpopKey,
          wrappedRT: {
            iv: new Uint8Array(v.wrappedRT.iv),
            ciphertext: new Uint8Array(v.wrappedRT.ciphertext),
          },
          lastIdToken: v.lastIdToken,
          updatedAt: v.updatedAt ?? 0,
        };
        resolve(result);
      };
      req.onerror = () => resolve(null);
    });
  } finally { db.close(); }
}

export async function saveSession(namespace: string, s: Omit<Session, "updatedAt">): Promise<void> {
  const db = await openDb();
  try {
    const persisted: PersistedShape = {
      wrapKey: s.wrapKey,
      dpopKey: s.dpopKey,
      wrappedRT: s.wrappedRT,
      lastIdToken: s.lastIdToken,
      updatedAt: Date.now(),
    };
    await new Promise<void>((resolve, reject) => {
      const req = tx(db, "readwrite").put(persisted, namespace);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}

export async function clearSession(namespace: string): Promise<void> {
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const req = tx(db, "readwrite").delete(namespace);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } finally { db.close(); }
}
