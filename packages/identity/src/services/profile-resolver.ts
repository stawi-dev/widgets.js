import type { AuthRuntime } from "@stawi/auth-runtime";
import { identityError, toIdentityError } from "./errors.js";

const SERVICE = "profile.v1.ProfileService";
const CACHE_LIMIT = 500;
const CONCURRENCY = 4;

/** Codes that mean "this caller may never read profiles" — stop asking. */
const PERMISSION_CODES = new Set(["permission_denied", "API_FORBIDDEN"]);
/** Codes that mean "no such profile" — a normal, non-exceptional answer. */
const NOT_FOUND_CODES = new Set(["not_found", "API_NOT_FOUND"]);

/** The slice of a profile the identity screens display. */
export interface ProfileSummary {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
}

export interface ProfileResolver {
  /** Resolves profile ids, skipping ones that cannot be read. */
  resolve(ids: string[]): Promise<Map<string, ProfileSummary>>;
  /** Looks a profile up by email or phone; null when there is no match. */
  byContact(contact: string): Promise<ProfileSummary | null>;
}

export interface ProfileResolverDeps {
  runtime: Pick<AuthRuntime, "fetch">;
  /** Base URL of the profile service, e.g. `https://api.stawi.org/profile`. */
  profileApiBaseUrl: string;
}

interface ProfileContactPayload {
  type?: unknown;
  detail?: unknown;
}

interface ProfilePayload {
  id?: unknown;
  properties?: { au_name?: unknown } | null;
  contacts?: ProfileContactPayload[] | null;
}

function isEmail(type: unknown): boolean {
  return type === "EMAIL" || type === "CONTACT_TYPE_EMAIL" || type === 0;
}

function isMsisdn(type: unknown): boolean {
  return type === "MSISDN" || type === "CONTACT_TYPE_MSISDN" || type === 1;
}

function detailOf(
  contacts: ProfileContactPayload[],
  match: (type: unknown) => boolean,
): string | undefined {
  const hit = contacts.find(
    (c) => match(c.type) && typeof c.detail === "string" && c.detail.length > 0,
  );
  return hit ? (hit.detail as string) : undefined;
}

function toSummary(payload: ProfilePayload): ProfileSummary {
  const contacts = Array.isArray(payload.contacts) ? payload.contacts : [];
  const name = payload.properties?.au_name;
  const email = detailOf(contacts, isEmail);
  const phone = detailOf(contacts, isMsisdn);
  return {
    id: String(payload.id),
    ...(typeof name === "string" && name.length > 0 ? { name } : {}),
    ...(email !== undefined ? { email } : {}),
    ...(phone !== undefined ? { phone } : {}),
  };
}

/**
 * Name resolution for identity screens, which store profile ids only.
 *
 * Lookups are cached (LRU, 500 entries) and fetched at most four at a time.
 * A permission failure disables the resolver for the session: it stops
 * issuing requests for a caller that is never going to be allowed to read
 * profiles, and the screens fall back to showing the raw profile id. What
 * it already knows is kept — a disabled resolver still answers from cache,
 * including for the very batch that tripped the failure.
 */
export function createProfileResolver(
  deps: ProfileResolverDeps,
): ProfileResolver {
  const base = deps.profileApiBaseUrl.replace(/\/+$/, "");
  const cache = new Map<string, ProfileSummary>();
  let disabled = false;

  function cacheGet(id: string): ProfileSummary | undefined {
    const hit = cache.get(id);
    if (!hit) return undefined;
    // Re-insert so the entry counts as most-recently-used.
    cache.delete(id);
    cache.set(id, hit);
    return hit;
  }

  function cacheSet(summary: ProfileSummary): void {
    cache.delete(summary.id);
    if (cache.size >= CACHE_LIMIT) {
      const oldest = cache.keys().next();
      if (!oldest.done) cache.delete(oldest.value);
    }
    cache.set(summary.id, summary);
  }

  async function request(rpc: string, body: unknown): Promise<ProfileSummary> {
    const res = await deps.runtime
      .fetch<{ data?: ProfilePayload }>(`${base}/${SERVICE}/${rpc}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Connect-Protocol-Version": "1",
        },
        body: JSON.stringify(body),
      })
      .catch((err: unknown) => {
        throw toIdentityError(err);
      });
    const data = res?.data;
    if (!data || typeof data.id !== "string" || data.id.length === 0) {
      throw identityError("invalid_response", `Empty response from ${rpc}`);
    }
    return toSummary(data);
  }

  /** Runs `worker` over `items` with at most `CONCURRENCY` in flight. */
  async function pool(
    items: string[],
    worker: (item: string) => Promise<void>,
  ): Promise<void> {
    let next = 0;
    const lanes = Array.from(
      { length: Math.min(CONCURRENCY, items.length) },
      async () => {
        while (next < items.length) {
          await worker(items[next++]!);
        }
      },
    );
    await Promise.all(lanes);
  }

  return {
    async resolve(ids) {
      const out = new Map<string, ProfileSummary>();

      const missing: string[] = [];
      for (const id of new Set(ids.filter((id) => id))) {
        const hit = cacheGet(id);
        if (hit) out.set(id, hit);
        else missing.push(id);
      }
      // Once disabled we answer from cache only, and never hit the network.
      if (disabled || missing.length === 0) return out;

      await pool(missing, async (id) => {
        if (disabled) return;
        try {
          const summary = await request("GetById", { id });
          cacheSet(summary);
          out.set(id, summary);
        } catch (err) {
          const e = toIdentityError(err);
          if (PERMISSION_CODES.has(e.code)) {
            disabled = true;
            return;
          }
          // A single unreadable profile must not sink the batch; the caller
          // renders the raw id for whatever is missing from the map.
        }
      });

      return out;
    },

    async byContact(contact) {
      if (disabled) return null;
      try {
        const summary = await request("GetByContact", { contact });
        cacheSet(summary);
        return summary;
      } catch (err) {
        const e = toIdentityError(err);
        if (PERMISSION_CODES.has(e.code)) {
          disabled = true;
          return null;
        }
        if (NOT_FOUND_CODES.has(e.code)) return null;
        throw e;
      }
    },
  };
}
