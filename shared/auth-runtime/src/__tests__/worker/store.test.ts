import { describe, it, expect, beforeEach } from "vitest";
import { loadSession, saveSession, clearSession } from "../../worker/store.js";
import { generateDpopKey, generateWrapKey, wrap } from "../../worker/crypto.js";

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
