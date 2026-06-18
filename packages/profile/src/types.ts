import type { ProfileWidgetThemedTokens } from "./themes/types.js";
import type { AuthState, SecurityEvent } from "@stawi/auth-runtime";

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

/**
 * Shape returned by GET /profile/public/user/info — the REST handler
 * on service-profile that resolves the current user from the JWT
 * subject (no profile_id required from the client). Strictly fewer
 * fields than the Connect RPC GetByIdResponse: just enough for the
 * widget's initial render. Mutations (Update, AddContact, ...) still
 * flow through Connect RPC.
 */
export interface UserInfoResponse {
  sub: string;
  name?: string;
  url?: string;
  contacts: ContactObject[];
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
  /** Registered post-logout return URL. Defaults to the current page URL. */
  logoutRedirectUri?: string;
  theme?: "light" | "dark" | "auto";
  adminPanelUrl?: string;
  onLogout?: () => void;
  /** Design tokens overriding theme defaults. Supports optional `dark` / `light` branches. */
  tokens?: ProfileWidgetThemedTokens;
  /** Raw CSS appended after tokens — ultimate escape hatch. */
  css?: string;
  /** When true, loads Poppins/Lora from Google Fonts. Default false (inlined subsets). */
  externalFonts?: boolean;
  /** Max avatar byte size accepted for upload. Default 2 MiB. */
  maxAvatarBytes?: number;
  /** BCP-47 locale for i18n; defaults to "en". */
  locale?: string;
  /** Opt-in Gravatar fallback for avatars. Default false. */
  gravatar?: boolean;
  /** Error hook invoked for recoverable/UI errors. */
  onError?: (err: unknown) => void;
  /** Auth state change hook. */
  onAuthStateChange?: (s: AuthState) => void;
  /** Security event hook. */
  onSecurityEvent?: (e: SecurityEvent) => void;
  /** Metric hook. */
  onMetric?: (
    name: string,
    durationMs: number,
    tags: Record<string, string>,
  ) => void;
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
