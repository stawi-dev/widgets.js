import type { ApiClient } from "@antinvestor/auth-runtime";
import type {
  ProfileResponse,
  AddContactResponse,
  VerificationResponse,
  ContactType,
} from "../types.js";

const SVC = "/profile.v1.ProfileService";

function rpc<Req, Res>(
  api: ApiClient,
  method: string,
  body: Req,
): Promise<Res> {
  return api.fetch<Res>(`${SVC}/${method}`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function getProfile(
  api: ApiClient,
  profileId: string,
): Promise<ProfileResponse> {
  return rpc(api, "GetById", { id: profileId });
}

export function updateProfile(
  api: ApiClient,
  profileId: string,
  properties: Record<string, unknown>,
): Promise<ProfileResponse> {
  return rpc(api, "Update", { id: profileId, properties });
}

export function addContact(
  api: ApiClient,
  profileId: string,
  type: ContactType,
  detail: string,
): Promise<AddContactResponse> {
  return rpc(api, "AddContact", {
    profile_id: profileId,
    type,
    detail,
  });
}

export function createContactVerification(
  api: ApiClient,
  contactId: string,
): Promise<VerificationResponse> {
  return rpc(api, "CreateContactVerification", { contact_id: contactId });
}

export function checkVerification(
  api: ApiClient,
  verificationId: string,
  code: string,
): Promise<VerificationResponse> {
  return rpc(api, "CheckVerification", {
    verification_id: verificationId,
    code,
  });
}

export function removeContact(
  api: ApiClient,
  contactId: string,
): Promise<void> {
  return rpc(api, "RemoveContact", { contact_id: contactId });
}
