import "fake-indexeddb/auto";
import { Crypto } from "@peculiar/webcrypto";

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: new Crypto(),
    writable: true,
    configurable: true,
  });
}

if (!(globalThis as any).BroadcastChannel) {
  class BC {
    name: string;
    onmessage: ((e: MessageEvent) => void) | null = null;
    static chans = new Map<string, Set<BC>>();
    constructor(name: string) {
      this.name = name;
      if (!BC.chans.has(name)) BC.chans.set(name, new Set());
      BC.chans.get(name)!.add(this);
    }
    postMessage(data: unknown) {
      for (const c of BC.chans.get(this.name) ?? []) {
        if (c !== this) c.onmessage?.({ data } as MessageEvent);
      }
    }
    close() { BC.chans.get(this.name)?.delete(this); }
    addEventListener() {} removeEventListener() {} dispatchEvent() { return true; }
  }
  (globalThis as any).BroadcastChannel = BC;
}

if (!(navigator as any).locks) {
  const held = new Map<string, Promise<void>>();
  (navigator as any).locks = {
    async request<T>(name: string, opts: unknown, cb: () => Promise<T>): Promise<T> {
      const prev = held.get(name) ?? Promise.resolve();
      let release!: () => void;
      const next = new Promise<void>((r) => (release = r));
      held.set(name, prev.then(() => next));
      await prev;
      try { return await cb(); } finally { release(); }
    },
  };
}
