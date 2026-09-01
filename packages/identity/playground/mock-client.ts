import type { IdentityClient } from "../src/services/identity-client.js";
import type {
  ProfileResolver,
  ProfileSummary,
} from "../src/services/profile-resolver.js";
import type {
  AccessRoleAssignment,
  InternalTeam,
  Organization,
  OrgUnit,
  TeamMembership,
  WorkforceMember,
} from "../src/types.js";

/** Simulated round-trip so loading states are visible in the playground. */
const LATENCY_MS = 220;

function delay<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), LATENCY_MS));
}

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq}`;
}

const PROFILES: ProfileSummary[] = [
  { id: "p1", name: "Amina Wanjiru", email: "amina@example.com" },
  { id: "p2", name: "Brian Otieno", phone: "+254700111222" },
  { id: "p3", name: "Cynthia Mwangi", email: "cynthia@example.com" },
  { id: "p4", name: "Daniel Kiptoo", phone: "+254700333444" },
];

/** Mutable in-memory store, so the playground behaves like a real backend. */
interface Store {
  organizations: Organization[];
  orgUnits: OrgUnit[];
  members: WorkforceMember[];
  teams: InternalTeam[];
  memberships: TeamMembership[];
  assignments: AccessRoleAssignment[];
}

function seed(): Store {
  return {
    organizations: [
      {
        id: "o1",
        name: "Acme Imports",
        code: "ACME",
        organizationType: "ORGANIZATION_TYPE_TRADING",
        geoId: "KE",
        state: "ACTIVE",
      },
    ],
    orgUnits: [
      {
        id: "u1",
        organizationId: "o1",
        name: "Coast",
        code: "CST",
        type: "ORG_UNIT_TYPE_REGION",
        geoId: "KE-Coast",
        state: "ACTIVE",
      },
      {
        id: "u2",
        organizationId: "o1",
        parentId: "u1",
        name: "Mombasa",
        code: "MSA",
        type: "ORG_UNIT_TYPE_BRANCH",
        geoId: "KE-MSA",
        state: "ACTIVE",
      },
      {
        id: "u3",
        organizationId: "o1",
        name: "Nairobi",
        code: "NBO",
        type: "ORG_UNIT_TYPE_REGION",
        geoId: "KE-NBO",
        state: "ACTIVE",
      },
    ],
    members: [
      {
        id: "m1",
        organizationId: "o1",
        profileId: "p1",
        engagementType: "employee",
        homeOrgUnitId: "u2",
        state: "ACTIVE",
        properties: { platform_role: "admin" },
      },
      {
        id: "m2",
        organizationId: "o1",
        profileId: "p2",
        engagementType: "contractor",
        homeOrgUnitId: "u3",
        state: "ACTIVE",
      },
      {
        id: "m3",
        organizationId: "o1",
        profileId: "p3",
        engagementType: "agent",
        state: "CREATED",
      },
    ],
    teams: [
      {
        id: "t1",
        organizationId: "o1",
        name: "Sourcing",
        code: "SRC",
        teamType: "sourcing",
        objective: "Find and vet suppliers",
        homeOrgUnitId: "u3",
        state: "ACTIVE",
      },
      {
        id: "t2",
        organizationId: "o1",
        name: "Clearing",
        code: "CLR",
        teamType: "logistics",
        objective: "Port clearance and last-mile",
        homeOrgUnitId: "u2",
        state: "ACTIVE",
      },
    ],
    memberships: [
      {
        id: "tm1",
        teamId: "t1",
        memberId: "m1",
        membershipRole: "lead",
        isPrimaryTeam: true,
        state: "ACTIVE",
      },
      {
        id: "tm2",
        teamId: "t2",
        memberId: "m2",
        membershipRole: "member",
        state: "ACTIVE",
      },
    ],
    assignments: [
      {
        id: "ra1",
        memberId: "m1",
        roleKey: "identity_administrator",
        scopeType: "ACCESS_SCOPE_TYPE_ORGANIZATION",
        scopeId: "o1",
        state: "ACTIVE",
      },
    ],
  };
}

/** Case-insensitive substring match over the fields a user would type. */
function matches(query: string | undefined, ...fields: unknown[]): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  return fields.some(
    (f) => typeof f === "string" && f.toLowerCase().includes(q),
  );
}

/** Inserts or replaces `record` by id, returning the stored value. */
function upsert<T extends { id?: string }>(
  list: T[],
  record: Partial<T>,
  prefix: string,
): T {
  if (record.id) {
    const i = list.findIndex((r) => r.id === record.id);
    const merged = { ...(list[i] ?? {}), ...record } as T;
    if (i >= 0) list[i] = merged;
    else list.push(merged);
    return merged;
  }
  const created = { ...record, id: nextId(prefix) } as T;
  list.push(created);
  return created;
}

export interface MockBackend {
  client: IdentityClient;
  profileResolver: ProfileResolver;
}

/** An in-memory identity service for visual work on the screens. */
export function createMockBackend(): MockBackend {
  const store = seed();

  const client: IdentityClient = {
    organizationSearch: (q) =>
      delay(
        store.organizations.filter((o) => matches(q.query, o.name, o.code)),
      ),
    organizationSave: (o) => delay(upsert(store.organizations, o, "o")),

    orgUnitSearch: (q) =>
      delay(
        store.orgUnits.filter(
          (u) =>
            (!q.organizationId || u.organizationId === q.organizationId) &&
            matches(q.query, u.name, u.code),
        ),
      ),
    orgUnitSave: (u) => delay(upsert(store.orgUnits, u, "u")),

    workforceMemberSearch: (q) =>
      delay(
        store.members.filter((m) => {
          if (q.organizationId && m.organizationId !== q.organizationId) {
            return false;
          }
          const profile = PROFILES.find((p) => p.id === m.profileId);
          return matches(
            q.query,
            profile?.name,
            profile?.email,
            profile?.phone,
          );
        }),
      ),
    workforceMemberGet: (id) => {
      const found = store.members.find((m) => m.id === id);
      if (!found) return Promise.reject(new Error(`no member ${id}`));
      return delay(found);
    },
    workforceMemberSave: (m) => delay(upsert(store.members, m, "m")),

    internalTeamSearch: (q) =>
      delay(
        store.teams.filter(
          (t) =>
            (!q.organizationId || t.organizationId === q.organizationId) &&
            matches(q.query, t.name, t.code),
        ),
      ),
    internalTeamSave: (t) => delay(upsert(store.teams, t, "t")),

    teamMembershipSearch: (q) =>
      delay(
        store.memberships.filter(
          (tm) =>
            (!q.teamId || tm.teamId === q.teamId) &&
            (!q.memberId || tm.memberId === q.memberId),
        ),
      ),
    teamMembershipSave: (m) => delay(upsert(store.memberships, m, "tm")),

    accessRoleAssignmentSearch: (q) =>
      delay(
        store.assignments.filter(
          (a) =>
            (!q.memberId || a.memberId === q.memberId) &&
            (!q.roleKey || a.roleKey === q.roleKey) &&
            (!q.scopeType || a.scopeType === q.scopeType),
        ),
      ),
    accessRoleAssignmentSave: (a) => delay(upsert(store.assignments, a, "ra")),
  };

  const profileResolver: ProfileResolver = {
    resolve: (ids) =>
      delay(
        new Map(
          PROFILES.filter((p) => ids.includes(p.id)).map((p) => [p.id, p]),
        ),
      ),
    byContact: (contact) =>
      delay(
        PROFILES.find((p) => p.email === contact || p.phone === contact) ??
          null,
      ),
  };

  return { client, profileResolver };
}
