import type { AuthRuntime } from "@stawi/auth-runtime";
import type {
  ProfileResponse,
  AddContactResponse,
  VerificationResponse,
  ContactType,
} from "../types.js";

const SVC = "/profile.v1.ProfileService";

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
