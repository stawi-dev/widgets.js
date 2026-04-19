import "fake-indexeddb/auto";
import { Crypto } from "@peculiar/webcrypto";

if (!globalThis.crypto?.subtle) {
  Object.defineProperty(globalThis, "crypto", {
    value: new Crypto(),
    writable: true,
    configurable: true,
  });
}

if (!(globalThis as unknown as { BroadcastChannel?: unknown }).BroadcastChannel) {
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
  (globalThis as unknown as { BroadcastChannel: typeof BC }).BroadcastChannel = BC;
}

if (!(navigator as unknown as { locks?: unknown }).locks) {
  const held = new Map<string, Promise<void>>();
  (navigator as unknown as {
    locks: {
      request: <T>(name: string, opts: unknown, cb: () => Promise<T>) => Promise<T>;
    };
  }).locks = {
    async request<T>(name: string, _opts: unknown, cb: () => Promise<T>): Promise<T> {
      const prev = held.get(name) ?? Promise.resolve();
      let release!: () => void;
      const next = new Promise<void>((r) => (release = r));
      held.set(name, prev.then(() => next));
      await prev;
      try { return await cb(); } finally { release(); }
    },
  };
}

// -----------------------------------------------------------------------------
// FedCM polyfill for tests
// -----------------------------------------------------------------------------
// Tests drive the polyfill by setting handlers on `globalThis.__TEST_FEDCM`
// before triggering the code path that calls `navigator.credentials.get`.
// Call counts are recorded into `calls` for assertion.
//
// Design: the polyfill installs the globals unconditionally (so feature
// detection in production code — `"IdentityCredential" in window` — resolves
// true in tests), but the handlers start undefined. Any uncontrolled
// invocation of `navigator.credentials.get` / `preventSilentAccess` /
// `IdentityCredential.disconnect` will throw a loud error so tests cannot
// silently miss unexpected FedCM traffic.

export interface TestFedCMCallRecord {
  mode?: string;
  mediation?: string;
  nonce?: string;
  signal?: AbortSignal;
  providers?: unknown[];
  context?: string;
}

export interface TestFedCMControl {
  handleGet?: (req: {
    providers: unknown[];
    context?: string;
    mode?: "passive" | "active";
    mediation?: CredentialMediationRequirement;
    signal?: AbortSignal;
  }) => Promise<unknown> | unknown;
  handleDisconnect?: (opts: {
    configURL: string;
    clientId: string;
    accountHint?: string;
  }) => Promise<void> | void;
  handlePreventSilentAccess?: () => Promise<void> | void;
  calls: {
    get: TestFedCMCallRecord[];
    disconnect: Array<{ configURL: string; clientId: string; accountHint?: string }>;
    preventSilentAccess: number;
  };
  reset(): void;
}

function makeControl(): TestFedCMControl {
  const control: TestFedCMControl = {
    handleGet: undefined,
    handleDisconnect: undefined,
    handlePreventSilentAccess: undefined,
    calls: { get: [], disconnect: [], preventSilentAccess: 0 },
    reset() {
      this.handleGet = undefined;
      this.handleDisconnect = undefined;
      this.handlePreventSilentAccess = undefined;
      this.calls = { get: [], disconnect: [], preventSilentAccess: 0 };
    },
  };
  return control;
}

declare global {
  var __TEST_FEDCM: TestFedCMControl;
}

globalThis.__TEST_FEDCM = makeControl();

export function setTestFedCM(partial: Partial<TestFedCMControl>): void {
  Object.assign(globalThis.__TEST_FEDCM, partial);
}

// --- IdentityCredential (global class) ---------------------------------------
class PolyfilledIdentityCredential {
  readonly type = "identity";
  readonly id: string;
  readonly token: string;
  readonly isAutoSelected?: boolean;
  readonly configURL?: string;

  constructor(init: { token: string; isAutoSelected?: boolean; configURL?: string; id?: string } = { token: "" }) {
    this.id = init.id ?? "";
    this.token = init.token;
    this.isAutoSelected = init.isAutoSelected;
    this.configURL = init.configURL;
  }

  static async disconnect(opts: {
    configURL: string;
    clientId: string;
    accountHint?: string;
  }): Promise<void> {
    const control = globalThis.__TEST_FEDCM;
    control.calls.disconnect.push({
      configURL: opts.configURL,
      clientId: opts.clientId,
      accountHint: opts.accountHint,
    });
    if (typeof control.handleDisconnect === "function") {
      await control.handleDisconnect(opts);
    }
  }
}

(globalThis as unknown as { IdentityCredential: typeof PolyfilledIdentityCredential }).IdentityCredential =
  PolyfilledIdentityCredential;
if (typeof window !== "undefined") {
  (window as unknown as { IdentityCredential: typeof PolyfilledIdentityCredential }).IdentityCredential =
    PolyfilledIdentityCredential;
}

// --- IdentityCredentialError -------------------------------------------------
class PolyfilledIdentityCredentialError extends Error {
  readonly code?: string;
  readonly url?: string;
  constructor(message?: string, init?: { code?: string; url?: string }) {
    super(message);
    this.name = "IdentityCredentialError";
    this.code = init?.code;
    this.url = init?.url;
  }
}

(globalThis as unknown as { IdentityCredentialError: typeof PolyfilledIdentityCredentialError }).IdentityCredentialError =
  PolyfilledIdentityCredentialError;

// --- navigator.credentials ---------------------------------------------------
// Install a stable credentials object whose `get` and `preventSilentAccess`
// methods route FedCM requests to __TEST_FEDCM and fall through to a
// prior implementation (if any) for non-FedCM credential requests.
interface MinimalCredentials {
  get?(options?: CredentialRequestOptions): Promise<Credential | null>;
  preventSilentAccess?(): Promise<void>;
}

const existingCredentials = (navigator as unknown as { credentials?: MinimalCredentials }).credentials;
const priorGet = existingCredentials?.get?.bind(existingCredentials);
const priorPreventSilentAccess = existingCredentials?.preventSilentAccess?.bind(existingCredentials);

const polyfilledCredentials: Required<Pick<MinimalCredentials, "get" | "preventSilentAccess">> = {
  async get(options?: CredentialRequestOptions): Promise<Credential | null> {
    const identity = (options as { identity?: IdentityCredentialRequestOptions["identity"] } | undefined)?.identity;
    if (identity) {
      const control = globalThis.__TEST_FEDCM;
      control.calls.get.push({
        mode: identity.mode,
        mediation: options?.mediation,
        nonce: (identity.providers?.[0] as { nonce?: string } | undefined)?.nonce,
        signal: options?.signal,
        providers: identity.providers,
        context: identity.context,
      });
      if (typeof control.handleGet !== "function") {
        throw new Error(
          "navigator.credentials.get called without __TEST_FEDCM.handleGet configured",
        );
      }
      const req = {
        providers: identity.providers,
        context: identity.context,
        mode: identity.mode,
        mediation: options?.mediation,
        signal: options?.signal,
      };
      const result = await control.handleGet(req);
      return result as Credential | null;
    }
    if (priorGet) return priorGet(options);
    throw new Error("navigator.credentials.get called for non-identity credential without a handler");
  },
  async preventSilentAccess(): Promise<void> {
    const control = globalThis.__TEST_FEDCM;
    control.calls.preventSilentAccess += 1;
    if (typeof control.handlePreventSilentAccess === "function") {
      await control.handlePreventSilentAccess();
      return;
    }
    if (priorPreventSilentAccess) {
      await priorPreventSilentAccess();
    }
  },
};

Object.defineProperty(navigator, "credentials", {
  configurable: true,
  writable: true,
  value: polyfilledCredentials,
});
