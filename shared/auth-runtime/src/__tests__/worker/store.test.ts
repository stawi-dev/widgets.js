import { describe, it, expect, beforeEach } from "vitest";
import { loadSession, saveSession, clearSession } from "../../worker/store.js";
import { generateDpopKey, generateWrapKey, wrap, unwrap } from "../../worker/crypto.js";

async function seed(ns: string) {
  const wk = await generateWrapKey();
  const kp = await generateDpopKey();
  const wrapped = await wrap(wk, "rt.test");
  await saveSession(ns, { wrapKey: wk, dpopKey: kp, wrappedRT: wrapped, lastIdToken: "id" });
  return { wk, kp, wrapped };
}

describe("store", () => {
  beforeEach(() => {
    // reset fake-indexeddb between tests
    const idb = (globalThis as any).indexedDB;
    if (idb?._databases) idb._databases = new Map();
  });

  it("round-trips a session keyed by namespace", async () => {
    const seeded = await seed("ns-a");
    const loaded = await loadSession("ns-a");
    expect(loaded?.lastIdToken).toBe("id");
    expect(loaded?.wrappedRT.ciphertext).toEqual(seeded.wrapped.ciphertext);
  });

  it("namespaces are isolated", async () => {
    await seed("ns-a");
    const other = await loadSession("ns-b");
    expect(other).toBeNull();
  });

  it("clear removes", async () => {
    await seed("ns-a");
    await clearSession("ns-a");
    expect(await loadSession("ns-a")).toBeNull();
  });

  it("round-trips the wrap key + dpop key pair so the refresh token can be decrypted on next page load", async () => {
    // Regression for the v1.1.0 storage bug: createWorkerCore's init path
    // reads loaded.wrapKey + loaded.dpopKey and wipes the session as
    // "storage_corruption" if either is missing. saveSession used to drop
    // both — the next page load would clear storage and report
    // unauthenticated despite a successful sign-in. This test asserts
    // both keys survive the round-trip AND that the loaded wrapKey can
    // actually decrypt the persisted wrappedRT (i.e. the same key, not a
    // fresh one).
    const seeded = await seed("ns-keys");
    const loaded = await loadSession("ns-keys");
    expect(loaded).not.toBeNull();
    expect(loaded?.wrapKey).toBeDefined();
    expect(loaded?.dpopKey).toBeDefined();
    expect(loaded?.dpopKey?.privateKey).toBeDefined();
    expect(loaded?.dpopKey?.publicKey).toBeDefined();
    const decrypted = await unwrap(loaded!.wrapKey!, loaded!.wrappedRT);
    expect(decrypted).toBe("rt.test");
    // `seeded.wk` is referenced solely so eslint doesn't flag it as
    // unused on the round-trip path; loaded.wrapKey is a structured
    // clone of the persisted key, so referential equality won't hold.
    expect(seeded.wk).toBeDefined();
  });

  it("treats shape-mismatch as null", async () => {
    // write a bad value directly
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("stawi-auth-v1", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("sessions");
      req.onsuccess = () => {
        const tx = req.result.transaction("sessions", "readwrite");
        tx.objectStore("sessions").put({ garbage: true }, "ns-x");
        tx.oncomplete = () => resolve();
      };
    });
    expect(await loadSession("ns-x")).toBeNull();
  });

  // Force every branch of the key-shape validators so coverage stays above
  // the 80% threshold. Each variant writes a row that satisfies the
  // wrappedRT check but breaks exactly one key-shape invariant, mirroring
  // what a v1.1.0 (pre-fix) persisted row looks like to the v1.1.1 reader.
  async function putRaw(namespace: string, value: unknown): Promise<void> {
    await new Promise<void>((resolve) => {
      const req = indexedDB.open("stawi-auth-v1", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("sessions");
      req.onsuccess = () => {
        const tx = req.result.transaction("sessions", "readwrite");
        tx.objectStore("sessions").put(value, namespace);
        tx.oncomplete = () => resolve();
      };
    });
  }

  it("rejects pre-fix sessions that lack wrapKey + dpopKey", async () => {
    // The exact shape v1.1.0 saveSession produced before the fix.
    const wrappedRT = { iv: new Uint8Array(12), ciphertext: new Uint8Array(16) };
    await putRaw("ns-legacy", { wrappedRT, lastIdToken: "id", updatedAt: 1 });
    expect(await loadSession("ns-legacy")).toBeNull();
  });

  it("rejects a session whose wrapKey is missing the expected surface", async () => {
    const wrappedRT = { iv: new Uint8Array(12), ciphertext: new Uint8Array(16) };
    const goodPair = await generateDpopKey();
    await putRaw("ns-bad-wk", {
      wrappedRT,
      wrapKey: { type: 42 },
      dpopKey: goodPair,
    });
    expect(await loadSession("ns-bad-wk")).toBeNull();
  });

  it("rejects a session whose dpopKey isn't a full key pair", async () => {
    const wrappedRT = { iv: new Uint8Array(12), ciphertext: new Uint8Array(16) };
    const wk = await generateWrapKey();
    const partialPair = (await generateDpopKey()) as unknown as { privateKey: CryptoKey };
    await putRaw("ns-bad-kp", {
      wrappedRT,
      wrapKey: wk,
      dpopKey: { privateKey: partialPair.privateKey },
    });
    expect(await loadSession("ns-bad-kp")).toBeNull();
  });
});
