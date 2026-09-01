import { useCallback, useEffect, useMemo, useState } from "react";
import type { AuthRuntime } from "@stawi/auth-runtime";
import { createIdentityClient } from "../services/identity-client.js";
import { createProfileResolver } from "../services/profile-resolver.js";
import { fetchAllPages } from "../services/fetch-all.js";
import { deriveProfileApiBaseUrl } from "../components/IdentityWidgetRoot.js";
import type { InternalTeam, WorkforceMember } from "../types.js";

/** A workforce member with whatever the profile service could tell us. */
export interface DirectoryMember extends WorkforceMember {
  name?: string;
  email?: string;
}

export interface IdentityDirectory {
  members: DirectoryMember[];
  teams: InternalTeam[];
  loading: boolean;
  error?: string;
  /** Display name for a profile id; the id itself when it is unknown. */
  resolveName(profileId: string): string;
  /** Drops the cached snapshot and loads it again. */
  refresh(): void;
}

export interface UseIdentityDirectoryOptions {
  runtime: Pick<AuthRuntime, "fetch">;
  /** Identity service base, e.g. `https://api.stawi.org/identity`. */
  apiBaseUrl: string;
  /** Defaults to `apiBaseUrl` with its last path segment replaced by `/profile`. */
  profileApiBaseUrl?: string;
  organizationId: string;
  /** How long a snapshot stays fresh. Default 60 s. */
  ttlMs?: number;
}

const DEFAULT_TTL_MS = 60_000;

interface DirectorySnapshot {
  members: DirectoryMember[];
  teams: InternalTeam[];
}

const EMPTY: DirectorySnapshot = { members: [], teams: [] };

interface CacheEntry {
  at: number;
  promise: Promise<DirectorySnapshot>;
}

/**
 * Snapshots are cached per `{apiBaseUrl, organizationId}` at module scope,
 * so a page with several pickers on it makes one round of requests, not one
 * per component. The entry holds the *promise*, so instances that mount
 * while the first load is still in flight join it instead of starting their
 * own.
 */
const cache = new Map<string, CacheEntry>();

function cacheKey(apiBaseUrl: string, organizationId: string): string {
  return JSON.stringify([apiBaseUrl, organizationId]);
}

async function loadDirectory(
  o: UseIdentityDirectoryOptions,
): Promise<DirectorySnapshot> {
  const client = createIdentityClient({
    runtime: o.runtime,
    apiBaseUrl: o.apiBaseUrl,
  });
  const resolver = createProfileResolver({
    runtime: o.runtime,
    profileApiBaseUrl:
      o.profileApiBaseUrl ?? deriveProfileApiBaseUrl(o.apiBaseUrl),
  });

  const [members, teams] = await Promise.all([
    fetchAllPages<WorkforceMember>((cursor) =>
      client.workforceMemberSearch({
        organizationId: o.organizationId,
        cursor,
      }),
    ),
    fetchAllPages<InternalTeam>((cursor) =>
      client.internalTeamSearch({ organizationId: o.organizationId, cursor }),
    ),
  ]);

  // Name resolution is best-effort: a caller that may not read profiles
  // still gets the directory, and the pickers label rows by profile id.
  const profiles = await resolver.resolve(
    members.items.map((m) => m.profileId),
  );

  return {
    members: members.items.map((m) => {
      const profile = profiles.get(m.profileId);
      return {
        ...m,
        ...(profile?.name ? { name: profile.name } : {}),
        ...(profile?.email ? { email: profile.email } : {}),
      };
    }),
    teams: teams.items,
  };
}

function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Members and teams of one organization, ready to label a picker.
 *
 * Hosts building their own assignment controls need the same three lookups
 * the widget does — members, teams and profile names — so this hook does
 * them once and shares the result across every component that asks.
 */
export function useIdentityDirectory(
  options: UseIdentityDirectoryOptions,
): IdentityDirectory {
  const {
    runtime,
    apiBaseUrl,
    profileApiBaseUrl,
    organizationId,
    ttlMs = DEFAULT_TTL_MS,
  } = options;

  const [snapshot, setSnapshot] = useState<DirectorySnapshot>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | undefined>(undefined);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => {
    cache.delete(cacheKey(apiBaseUrl, organizationId));
    setNonce((n) => n + 1);
  }, [apiBaseUrl, organizationId]);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(undefined);

    if (!organizationId) {
      setSnapshot(EMPTY);
      setLoading(false);
      return;
    }

    const key = cacheKey(apiBaseUrl, organizationId);
    const cached = cache.get(key);
    let promise =
      cached && Date.now() - cached.at <= ttlMs ? cached.promise : undefined;

    if (!promise) {
      promise = loadDirectory({
        runtime,
        apiBaseUrl,
        profileApiBaseUrl,
        organizationId,
      });
      const entry: CacheEntry = { at: Date.now(), promise };
      cache.set(key, entry);
      // A failed load is not a snapshot: forget it so the next mount (or a
      // retry) asks again rather than replaying the error for a whole ttl.
      promise.catch(() => {
        if (cache.get(key) === entry) cache.delete(key);
      });
    }

    promise.then(
      (value) => {
        if (!live) return;
        setSnapshot(value);
        setLoading(false);
      },
      (err: unknown) => {
        if (!live) return;
        setSnapshot(EMPTY);
        setError(messageOf(err));
        setLoading(false);
      },
    );

    return () => {
      live = false;
    };
  }, [runtime, apiBaseUrl, profileApiBaseUrl, organizationId, ttlMs, nonce]);

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const m of snapshot.members) if (m.name) map.set(m.profileId, m.name);
    return map;
  }, [snapshot]);

  const resolveName = useCallback(
    (profileId: string) => names.get(profileId) ?? profileId,
    [names],
  );

  return {
    members: snapshot.members,
    teams: snapshot.teams,
    loading,
    ...(error === undefined ? {} : { error }),
    resolveName,
    refresh,
  };
}
