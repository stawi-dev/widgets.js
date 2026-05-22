import type { AuthRuntime } from "@stawi/auth-runtime";
import type {
  ProfileResponse,
  AddContactResponse,
  UserInfoResponse,
  VerificationResponse,
  ContactType,
} from "../types.js";

// Antinvestor cluster convention: every backend is reachable via a
// single `/<service>` PathPrefix on api.stawi.{org,dev,im}. The
// gateway URLRewrites the prefix to "/" before the request reaches
// the backend mux, which serves both REST and Connect RPC handlers.
// So Connect RPC calls go through the same `/profile` prefix as
// REST — there is NO separate `/profile.v1.ProfileService` route.
const SVC = "/profile/profile.v1.ProfileService";

// REST surface on service-profile. /public/user/info reads the JWT
// `sub` claim and returns the matching profile — no profile_id is
// needed from the client. Cheaper than the Connect RPC `GetById`
// path: it's a simple GET (no CORS preflight, no Idempotency-Key)
// and ships a smaller payload tailored to "show me the current
// user" rather than the full proto. Used by ProfileProvider on
// initial load; mutations still flow through Connect RPC below.
const REST = "/profile/public";

function idempotencyKey(): string {
  return crypto.randomUUID();
}

function post<Req, Res>(
  rt: AuthRuntime,
  method: string,
  body: Req,
  mutation = true,
): Promise<Res> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (mutation) headers["Idempotency-Key"] = idempotencyKey();
  return rt.fetch<Res>(`${SVC}/${method}`, {
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
  return rt.fetch<UserInfoResponse>(`${REST}/user/info`, { method: "GET" });
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
