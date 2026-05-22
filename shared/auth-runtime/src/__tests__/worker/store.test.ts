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
});
