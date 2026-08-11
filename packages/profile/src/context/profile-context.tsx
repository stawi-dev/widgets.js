import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import type { ProfileData, ProfileState, ProfileAction } from "../types.js";
import { ContactType } from "../types.js";
import { useAuth } from "../hooks/use-auth.js";
import {
  getCurrentProfile,
  updateProfile as rpcUpdate,
  addContact as rpcAdd,
  createContactVerification,
  checkVerification,
  removeContact as rpcRemove,
} from "../services/profile-service.js";
import {
  stableAvatarProperty,
  uploadMedia,
} from "../services/files-service.js";
import {
  profileObjectToProfileData,
  uiUpdatesToProtoProperties,
  userInfoToProfileData,
} from "../services/profile-mapper.js";

const initialState: ProfileState = {
  loading: true,
  error: null,
  profile: null,
  pendingVerification: null,
};

function reducer(state: ProfileState, action: ProfileAction): ProfileState {
  switch (action.type) {
    case "LOADING":
      return { ...state, loading: true, error: null };
    case "LOADED":
      return {
        loading: false,
        error: null,
        profile: action.profile,
        pendingVerification: null,
      };
    case "ERROR":
      return { ...state, loading: false, error: action.error };
    case "UPDATED_PROFILE":
      return state.profile
        ? { ...state, profile: { ...state.profile, ...action.updates } }
        : state;
    case "ADDED_CONTACT":
      return state.profile
        ? {
            ...state,
            profile: {
              ...state.profile,
              contacts: [...state.profile.contacts, action.contact],
            },
          }
        : state;
    case "REMOVED_CONTACT":
      return state.profile
        ? {
            ...state,
            profile: {
              ...state.profile,
              contacts: state.profile.contacts.filter(
                (c) => c.id !== action.contactId,
              ),
            },
            pendingVerification:
              state.pendingVerification?.contactId === action.contactId
                ? null
                : state.pendingVerification,
          }
        : state;
    case "UPDATED_CONTACT":
      return state.profile
        ? {
            ...state,
            profile: {
              ...state.profile,
              contacts: state.profile.contacts.map((c) =>
                c.id === action.contact.id ? action.contact : c,
              ),
            },
          }
        : state;
    case "PENDING_VERIFICATION":
      return { ...state, pendingVerification: action.pending };
    default:
      return state;
  }
}

export interface ProfileContextValue {
  state: ProfileState;
  updateProfile: (updates: Partial<ProfileData>) => Promise<void>;
  uploadAvatar: (file: File) => Promise<void>;
  setLanguage: (language: string) => Promise<void>;
  setCountry: (country: string) => Promise<void>;
  addContact: (type: "email" | "phone", value: string) => Promise<void>;
  removeContact: (contactId: string) => Promise<void>;
  sendVerification: (contactId: string) => Promise<void>;
  verifyContact: (contactId: string, code: string) => Promise<void>;
  dismissVerification: () => void;
  requestVerification: (contactId: string, verificationId: string) => void;
}

export const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const { runtime } = useAuth();
  const [state, dispatch] = useReducer(reducer, initialState);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "LOADING" });
    (async () => {
      try {
        // GET /profile/public/user/info — server resolves identity from
        // the JWT subject claim, so no profile_id is needed from the
        // client. Cheaper than the Connect RPC `GetById` round trip
        // we used pre-1.3.0 (no CORS preflight, no Idempotency-Key).
        const userInfo = await getCurrentProfile(runtime);
        if (!cancelled)
          dispatch({
            type: "LOADED",
            profile: userInfoToProfileData(userInfo),
          });
      } catch (err) {
        if (!cancelled) {
          dispatch({
            type: "ERROR",
            error:
              err instanceof Error ? err.message : "Failed to load profile",
          });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runtime]);

  const updateProfile = useCallback(
    async (updates: Partial<ProfileData>) => {
      const profileId = state.profile?.id;
      if (!profileId) return;
      await rpcUpdate(runtime, profileId, uiUpdatesToProtoProperties(updates));
      dispatch({ type: "UPDATED_PROFILE", updates });
    },
    [runtime, state.profile?.id],
  );

  const uploadAvatar = useCallback(
    async (file: File) => {
      const profileId = state.profile?.id;
      if (!profileId) return;
      // 1) Store bytes in files service
      // 2) Persist durable mxc:// ref on profile via Connect Update
      // Display signs the mxc ref via useResolvedAvatarUrl (private media).
      const uploaded = await uploadMedia(runtime, file);
      const durable = stableAvatarProperty(uploaded);
      await rpcUpdate(runtime, profileId, { au_avater_uri: durable });
      dispatch({ type: "UPDATED_PROFILE", updates: { picture: durable } });
    },
    [runtime, state.profile?.id],
  );

  const setLanguage = useCallback(
    async (language: string) => {
      const profileId = state.profile?.id;
      if (!profileId) return;
      await rpcUpdate(runtime, profileId, { language });
      dispatch({ type: "UPDATED_PROFILE", updates: { language } });
    },
    [runtime, state.profile?.id],
  );

  const setCountry = useCallback(
    async (country: string) => {
      const profileId = state.profile?.id;
      if (!profileId) return;
      await rpcUpdate(runtime, profileId, { country });
      dispatch({ type: "UPDATED_PROFILE", updates: { country } });
    },
    [runtime, state.profile?.id],
  );

  const addContact = useCallback(
    async (type: "email" | "phone", value: string) => {
      const profileId = state.profile?.id;
      if (!profileId) return;
      const ct = type === "email" ? ContactType.EMAIL : ContactType.MSISDN;
      const res = await rpcAdd(runtime, profileId, ct, value);
      const updated = profileObjectToProfileData(res.data);
      const added =
        updated.contacts.find((c) => c.value === value) ??
        updated.contacts.at(-1);
      if (added) {
        dispatch({ type: "ADDED_CONTACT", contact: added });
        dispatch({
          type: "PENDING_VERIFICATION",
          pending: { contactId: added.id, verificationId: res.verification_id },
        });
      }
    },
    [runtime, state.profile?.id],
  );

  const removeContact = useCallback(
    async (contactId: string) => {
      await rpcRemove(runtime, contactId);
      dispatch({ type: "REMOVED_CONTACT", contactId });
    },
    [runtime],
  );

  const sendVerification = useCallback(
    async (contactId: string) => {
      const res = await createContactVerification(runtime, contactId);
      dispatch({
        type: "PENDING_VERIFICATION",
        pending: { contactId, verificationId: res.id },
      });
    },
    [runtime],
  );

  const verifyContact = useCallback(
    async (contactId: string, code: string) => {
      const vid = state.pendingVerification?.verificationId;
      if (!vid) return;
      await checkVerification(runtime, vid, code);
      const existing = state.profile?.contacts.find((c) => c.id === contactId);
      if (existing)
        dispatch({
          type: "UPDATED_CONTACT",
          contact: { ...existing, verified: true },
        });
      dispatch({ type: "PENDING_VERIFICATION", pending: null });
    },
    [
      runtime,
      state.pendingVerification?.verificationId,
      state.profile?.contacts,
    ],
  );

  const dismissVerification = useCallback(
    () => dispatch({ type: "PENDING_VERIFICATION", pending: null }),
    [],
  );

  const requestVerification = useCallback(
    (contactId: string, verificationId: string) => {
      dispatch({
        type: "PENDING_VERIFICATION",
        pending: { contactId, verificationId },
      });
    },
    [],
  );

  const value = useMemo<ProfileContextValue>(
    () => ({
      state,
      updateProfile,
      uploadAvatar,
      setLanguage,
      setCountry,
      addContact,
      removeContact,
      sendVerification,
      verifyContact,
      dismissVerification,
      requestVerification,
    }),
    [
      state,
      updateProfile,
      uploadAvatar,
      setLanguage,
      setCountry,
      addContact,
      removeContact,
      sendVerification,
      verifyContact,
      dismissVerification,
      requestVerification,
    ],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}
