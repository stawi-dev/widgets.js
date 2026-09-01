import type { AuthRuntime } from "@stawi/auth-runtime";
import {
  decodeConnectStream,
  encodeConnectEnvelope,
} from "./connect-stream.js";
import { fromConnectError, identityError, toIdentityError } from "./errors.js";
import type {
  AccessRoleAssignment,
  AccessScopeType,
  InternalTeam,
  Organization,
  OrgUnit,
  PageCursor,
  TeamMembership,
  WorkforceMember,
} from "../types.js";

const SERVICE = "identity.v1.IdentityService";

export interface IdentityClientDeps {
  runtime: Pick<AuthRuntime, "fetch">;
  /** Base URL of the identity service, e.g. `https://api.stawi.org/identity`. */
  apiBaseUrl: string;
}

export interface OrganizationQuery {
  query?: string;
  cursor?: PageCursor;
}

export interface OrgUnitQuery {
  query?: string;
  organizationId?: string;
  parentId?: string;
  rootOnly?: boolean;
  cursor?: PageCursor;
}

export interface WorkforceMemberQuery {
  query?: string;
  organizationId?: string;
  homeOrgUnitId?: string;
  cursor?: PageCursor;
}

export interface InternalTeamQuery {
  query?: string;
  organizationId?: string;
  homeOrgUnitId?: string;
  teamType?: string;
  cursor?: PageCursor;
}

export interface TeamMembershipQuery {
  query?: string;
  teamId?: string;
  memberId?: string;
  cursor?: PageCursor;
}

export interface AccessRoleAssignmentQuery {
  query?: string;
  memberId?: string;
  roleKey?: string;
  scopeType?: AccessScopeType;
  scopeId?: string;
  cursor?: PageCursor;
}

export interface IdentityClient {
  organizationSearch(q: OrganizationQuery): Promise<Organization[]>;
  organizationSave(o: Partial<Organization>): Promise<Organization>;
  orgUnitSearch(q: OrgUnitQuery): Promise<OrgUnit[]>;
  orgUnitSave(u: Partial<OrgUnit>): Promise<OrgUnit>;
  workforceMemberSearch(q: WorkforceMemberQuery): Promise<WorkforceMember[]>;
  workforceMemberGet(id: string): Promise<WorkforceMember>;
  workforceMemberSave(m: Partial<WorkforceMember>): Promise<WorkforceMember>;
  internalTeamSearch(q: InternalTeamQuery): Promise<InternalTeam[]>;
  internalTeamSave(t: Partial<InternalTeam>): Promise<InternalTeam>;
  teamMembershipSearch(q: TeamMembershipQuery): Promise<TeamMembership[]>;
  teamMembershipSave(m: Partial<TeamMembership>): Promise<TeamMembership>;
  accessRoleAssignmentSearch(
    q: AccessRoleAssignmentQuery,
  ): Promise<AccessRoleAssignment[]>;
  accessRoleAssignmentSave(
    a: Partial<AccessRoleAssignment>,
  ): Promise<AccessRoleAssignment>;
}

/**
 * Framework-free Connect client for the platform identity service.
 * Unary RPCs return `{ data }`; the `*Search` RPCs are server-streaming
 * and are fetched as raw bytes, then decoded and flattened.
 */
export function createIdentityClient(deps: IdentityClientDeps): IdentityClient {
  const base = deps.apiBaseUrl.replace(/\/+$/, "");

  function url(rpc: string): string {
    return `${base}/${SERVICE}/${rpc}`;
  }

  function headers(): Record<string, string> {
    return {
      "Content-Type": "application/json",
      "Connect-Protocol-Version": "1",
    };
  }

  /**
   * Server-streaming RPCs speak the Connect streaming protocol, not the
   * unary JSON one: connect-go answers a plain `application/json` POST with
   * HTTP 415, and reads the request body as a single envelope.
   */
  function streamHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/connect+json",
      Accept: "application/connect+json",
      "Connect-Protocol-Version": "1",
    };
  }

  async function unary<T>(rpc: string, body: unknown): Promise<T> {
    // A non-2xx response reaches us as an AuthError whose message embeds
    // the Connect error body; `toIdentityError` recovers the real code.
    const res = await deps.runtime
      .fetch<{ data?: T } & Record<string, unknown>>(url(rpc), {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      })
      .catch((err: unknown) => {
        throw toIdentityError(err);
      });
    if (res && res.data !== undefined && res.data !== null) return res.data;
    // Some deployments answer 200 with a bare Connect error body.
    throw (
      fromConnectError(res) ??
      identityError("invalid_response", `Empty response from ${rpc}`)
    );
  }

  async function stream<T>(rpc: string, body: unknown): Promise<T[]> {
    const buf = await deps.runtime
      .fetch<ArrayBuffer>(url(rpc), {
        method: "POST",
        headers: streamHeaders(),
        body: encodeConnectEnvelope(JSON.stringify(body)),
        responseType: "arraybuffer",
      })
      .catch((err: unknown) => {
        throw toIdentityError(err);
      });
    const out: T[] = [];
    for (const msg of decodeConnectStream<{ data?: T[] | T }>(buf)) {
      const data = msg?.data;
      if (data === undefined || data === null) continue;
      if (Array.isArray(data)) out.push(...data);
      else out.push(data);
    }
    return out;
  }

  return {
    organizationSearch: (q) => stream<Organization>("OrganizationSearch", q),
    organizationSave: (o) =>
      unary<Organization>("OrganizationSave", { data: o }),
    orgUnitSearch: (q) => stream<OrgUnit>("OrgUnitSearch", q),
    orgUnitSave: (u) => unary<OrgUnit>("OrgUnitSave", { data: u }),
    workforceMemberSearch: (q) =>
      stream<WorkforceMember>("WorkforceMemberSearch", q),
    workforceMemberGet: (id) =>
      unary<WorkforceMember>("WorkforceMemberGet", { id }),
    workforceMemberSave: (m) =>
      unary<WorkforceMember>("WorkforceMemberSave", { data: m }),
    internalTeamSearch: (q) => stream<InternalTeam>("InternalTeamSearch", q),
    internalTeamSave: (t) =>
      unary<InternalTeam>("InternalTeamSave", { data: t }),
    teamMembershipSearch: (q) =>
      stream<TeamMembership>("TeamMembershipSearch", q),
    teamMembershipSave: (m) =>
      unary<TeamMembership>("TeamMembershipSave", { data: m }),
    accessRoleAssignmentSearch: (q) =>
      stream<AccessRoleAssignment>("AccessRoleAssignmentSearch", q),
    accessRoleAssignmentSave: (a) =>
      unary<AccessRoleAssignment>("AccessRoleAssignmentSave", { data: a }),
  };
}
