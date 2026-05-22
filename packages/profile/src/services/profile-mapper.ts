import {
  ContactType,
  type ContactMethod,
  type ContactObject,
  type ProfileData,
  type ProfileObject,
  type UserInfoResponse,
} from "../types.js";
import { sanitizePictureUrl } from "../utils/sanitize-picture-url.js";

function mapContactType(type: ContactType): "email" | "phone" {
  return type === ContactType.EMAIL ? "email" : "phone";
}

function mapContact(
  contact: ContactObject,
  primaryEmail?: string,
): ContactMethod {
  const uiType = mapContactType(contact.type);
  return {
    id: contact.id,
    type: uiType,
    value: contact.detail,
    verified: contact.verified,
    primary:
      uiType === "email" &&
      !!primaryEmail &&
      contact.detail.toLowerCase() === primaryEmail.toLowerCase(),
  };
}

export function profileObjectToProfileData(
  proto: ProfileObject,
): ProfileData {
  const props = proto.properties;
  const name = (props.au_name as string) ?? "";
  const picture = sanitizePictureUrl((props.au_avater_uri as string) || undefined);
  const language = (props.language as string) || undefined;
  const country = (props.country as string) || undefined;

  // Find first verified email as primary email
  const firstVerifiedEmail = proto.contacts.find(
    (c) => c.type === ContactType.EMAIL && c.verified,
  );
  const email = firstVerifiedEmail?.detail ?? "";

  const contacts = proto.contacts.map((c) => mapContact(c, email));

  return {
    id: proto.id,
    name,
    email,
    picture,
    language,
    country,
    contacts,
  };
}

/**
 * Maps the GET /profile/public/user/info response into the same
 * ProfileData shape the widget renders from. The REST endpoint
 * returns fewer fields than the Connect RPC GetById response —
 * `language` and `country` are not present today and will surface as
 * `undefined`. Add them to /user/info on service-profile when the
 * widget needs them on first render; for now those fields can be
 * lazy-loaded via a Connect RPC GetById call after the initial mount
 * if required.
 */
export function userInfoToProfileData(resp: UserInfoResponse): ProfileData {
  const name = resp.name ?? "";
  const picture = sanitizePictureUrl(resp.url || undefined);
  const contactsIn = resp.contacts ?? [];
  const firstVerifiedEmail = contactsIn.find(
    (c) => c.type === ContactType.EMAIL && c.verified,
  );
  const email = firstVerifiedEmail?.detail ?? "";
  const contacts = contactsIn.map((c) => mapContact(c, email));
  return {
    id: resp.sub,
    name,
    email,
    picture,
    contacts,
  };
}

export function uiUpdatesToProtoProperties(
  updates: Partial<ProfileData>,
): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  if (updates.name !== undefined) props.au_name = updates.name;
  if (updates.picture !== undefined) props.au_avater_uri = updates.picture;
  if (updates.language !== undefined) props.language = updates.language;
  if (updates.country !== undefined) props.country = updates.country;
  return props;
}
