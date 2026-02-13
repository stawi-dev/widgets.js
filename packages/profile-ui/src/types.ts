// --- Proto enums ---
export enum ContactType {
  EMAIL = 0,
  MSISDN = 1,
}

export enum ProfileType {
  PERSON = 0,
  INSTITUTION = 1,
  BOT = 2,
}

// --- Proto response shapes ---
export interface ContactObject {
  id: string;
  type: ContactType;
  detail: string;
  verified: boolean;
  communication_level: number;
  state: number;
}

export interface ProfileObject {
  id: string;
  type: ProfileType;
  properties: {
    au_name?: string;
    au_avater_uri?: string;
    language?: string;
    country?: string;
    [k: string]: unknown;
  };
  contacts: ContactObject[];
  addresses: unknown[];
  state: number;
}

export interface ProfileResponse {
  data: ProfileObject;
}

export interface AddContactResponse {
  data: ProfileObject;
  verification_id: string;
}

export interface VerificationResponse {
  id: string;
  success: boolean;
  check_attempts?: number;
}

// --- UI types ---
export interface ProfileData {
  id: string;
  name: string;
  email: string;
  picture?: string;
  language?: string;
  country?: string;
  contacts: ContactMethod[];
}

export interface ContactMethod {
  id: string;
  type: "email" | "phone";
  value: string;
  verified: boolean;
  primary: boolean;
}

export interface ProfileWidgetProps {
  installationId: string;
  clientId?: string;
  idpBaseUrl?: string;
  apiBaseUrl?: string;
  theme?: "light" | "dark" | "auto";
  adminPanelUrl?: string;
  onLogout?: () => void;
}

export type ProfileAction =
  | { type: "LOADING" }
  | { type: "LOADED"; profile: ProfileData }
  | { type: "ERROR"; error: string }
  | { type: "UPDATED_PROFILE"; updates: Partial<ProfileData> }
  | { type: "ADDED_CONTACT"; contact: ContactMethod }
  | { type: "REMOVED_CONTACT"; contactId: string }
  | { type: "UPDATED_CONTACT"; contact: ContactMethod }
  | {
      type: "PENDING_VERIFICATION";
      pending: { contactId: string; verificationId: string } | null;
    };

export interface ProfileState {
  loading: boolean;
  error: string | null;
  profile: ProfileData | null;
  pendingVerification: { contactId: string; verificationId: string } | null;
}
