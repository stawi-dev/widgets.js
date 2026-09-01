/**
 * Stand-in for `src/services/identity-client.ts` and
 * `src/services/profile-resolver.ts`. `vite.config.ts` aliases both modules
 * here, so the playground renders the real `IdentityWidgetRoot` — gates,
 * tabs and all — against the in-memory backend instead of a live service.
 */
import { createMockBackend, type MockBackend } from "./mock-client.js";
import type { IdentityClient } from "../src/services/identity-client.js";
import type { ProfileResolver } from "../src/services/profile-resolver.js";

// One store for the whole page, so edits made on one tab show up on another.
let backend: MockBackend | null = null;

function shared(): MockBackend {
  backend ??= createMockBackend();
  return backend;
}

export function createIdentityClient(): IdentityClient {
  return shared().client;
}

export function createProfileResolver(): ProfileResolver {
  return shared().profileResolver;
}

export { decodeConnectStream } from "../src/services/connect-stream.js";
