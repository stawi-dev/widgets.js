import type { AuthRuntime } from "@stawi/auth-runtime";
import type {
  ProfileResponse,
  AddContactResponse,
  UserInfoResponse,
  VerificationResponse,
  ContactType,
} from "../types.js";

// Service path prefixes depend on how the API is addressed:
//   - Subdomain form (preferred): apiBaseUrl=https://profile.stawi.org
//     → no gateway prefix; backend mux is at /.
//   - Legacy gateway form: apiBaseUrl=https://api.stawi.org
//     → `/profile` PathPrefix rewritten to `/` by the gateway.
//
// Callers should pass the profile host for new deployments.
function profilePathPrefix(apiBaseUrl: string | undefined): string {
  if (!apiBaseUrl) return "/profile";
  try {
    const host = new URL(apiBaseUrl).hostname.toLowerCase();
    if (host.startsWith("profile.")) return "";
    if (host.startsWith("api.")) return "/profile";
  } catch {
    /* ignore */
  }
  // Bare apex or unknown host: assume gateway path layout.
  return "/profile";
}

export function servicePaths(apiBaseUrl?: string): { svc: string; rest: string } {
  const prefix = profilePathPrefix(apiBaseUrl);
  return {
    svc: `${prefix}/profile.v1.ProfileService`,
    rest: `${prefix}/public`,
  };
}

function idempotencyKey(): string {
  return crypto.randomUUID();
}

function post<Req, Res>(
  rt: AuthRuntime,
  method: string,
  body: Req,
  mutation = true,
): Promise<Res> {
  const { svc } = servicePaths(rt.apiBaseUrl);
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (mutation) headers["Idempotency-Key"] = idempotencyKey();
  return rt.fetch<Res>(`${svc}/${method}`, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

export function getProfile(
  rt: AuthRuntime,
  profileId: string,
): Promise<ProfileResponse> {
  return post(rt, "GetById", { id: profileId }, true);
}

/**
 * Fetches the current user's profile via the REST endpoint that
 * resolves identity from the JWT subject claim. Preferred over
 * `getProfile` for the initial mount because:
 *
 *  - Simple GET — no CORS preflight, no Idempotency-Key plumbing.
 *  - No need to derive `profile_id` from claims first (one round trip
 *    instead of two when the client doesn't already have it).
 *  - Smaller payload (sub/name/url/contacts) — exactly what the
 *    widget consumes for first render.
 */
export function getCurrentProfile(
  rt: AuthRuntime,
): Promise<UserInfoResponse> {
  const { rest } = servicePaths(rt.apiBaseUrl);
  return rt.fetch<UserInfoResponse>(`${rest}/user/info`, { method: "GET" });
}

export function updateProfile(
  rt: AuthRuntime,
  profileId: string,
  properties: Record<string, unknown>,
): Promise<ProfileResponse> {
  return post(rt, "Update", { id: profileId, properties });
}

export function addContact(
  rt: AuthRuntime,
  profileId: string,
  type: ContactType,
  detail: string,
): Promise<AddContactResponse> {
  return post(rt, "AddContact", { profile_id: profileId, type, detail });
}

export function createContactVerification(
  rt: AuthRuntime,
  contactId: string,
): Promise<VerificationResponse> {
  return post(rt, "CreateContactVerification", { contact_id: contactId });
}

export function checkVerification(
  rt: AuthRuntime,
  verificationId: string,
  code: string,
): Promise<VerificationResponse> {
  return post(rt, "CheckVerification", { verification_id: verificationId, code });
}

export function removeContact(
  rt: AuthRuntime,
  contactId: string,
): Promise<void> {
  return post(rt, "RemoveContact", { contact_id: contactId });
}
