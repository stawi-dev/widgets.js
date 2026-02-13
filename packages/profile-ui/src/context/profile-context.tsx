import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { decodeJwtPayload } from "@antinvestor/auth-runtime";
import type {
  ProfileData,
  ProfileState,
  ProfileAction,
} from "../types.js";
import { ContactType } from "../types.js";
import { useAuth } from "../hooks/use-auth.js";
import {
  getProfile,
  updateProfile as rpcUpdateProfile,
  addContact as rpcAddContact,
  createContactVerification,
  checkVerification,
  removeContact as rpcRemoveContact,
} from "../services/profile-service.js";
import {
  profileObjectToProfileData,
  uiUpdatesToProtoProperties,
} from "../services/profile-mapper.js";

function profileReducer(
  state: ProfileState,
  action: ProfileAction,
): ProfileState {
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
        ? {
            ...state,
            profile: { ...state.profile, ...action.updates },
          }
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

const initialState: ProfileState = {
  loading: true,
  error: null,
  profile: null,
  pendingVerification: null,
};

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
}

export const ProfileContext = createContext<ProfileContextValue | null>(null);

interface ProfileProviderProps {
  children: ReactNode;
}

export function ProfileProvider({ children }: ProfileProviderProps) {
  const { runtime } = useAuth();
  const [state, dispatch] = useReducer(profileReducer, initialState);

  const api = useMemo(() => runtime.getApiClient(), [runtime]);

  useEffect(() => {
    let cancelled = false;
    dispatch({ type: "LOADING" });

    (async () => {
      try {
        const token = await runtime.getAccessToken();
        const claims = decodeJwtPayload(token);
        const profileId = claims.sub as string;
        if (!profileId) throw new Error("JWT missing sub claim");

        const res = await getProfile(api, profileId);
        if (!cancelled) {
          dispatch({
            type: "LOADED",
            profile: profileObjectToProfileData(res.data),
          });
        }
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
  }, [api, runtime]);

  const updateProfile = useCallback(
    async (updates: Partial<ProfileData>) => {
      const profileId = state.profile?.id;
      if (!profileId) return;
      const props = uiUpdatesToProtoProperties(updates);
      await rpcUpdateProfile(api, profileId, props);
      dispatch({ type: "UPDATED_PROFILE", updates });
    },
    [api, state.profile?.id],
  );

  const uploadAvatar = useCallback(
    async (file: File) => {
      const profileId = state.profile?.id;
      if (!profileId) return;

      const dataUri = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      await rpcUpdateProfile(api, profileId, { au_avater_uri: dataUri });
      dispatch({
        type: "UPDATED_PROFILE",
        updates: { picture: dataUri },
      });
    },
    [api, state.profile?.id],
  );

  const setLanguage = useCallback(
    async (language: string) => {
      const profileId = state.profile?.id;
      if (!profileId) return;
      await rpcUpdateProfile(api, profileId, { language });
      dispatch({ type: "UPDATED_PROFILE", updates: { language } });
    },
    [api, state.profile?.id],
  );

  const setCountry = useCallback(
    async (country: string) => {
      const profileId = state.profile?.id;
      if (!profileId) return;
      await rpcUpdateProfile(api, profileId, { country });
      dispatch({ type: "UPDATED_PROFILE", updates: { country } });
    },
    [api, state.profile?.id],
  );

  const addContact = useCallback(
    async (type: "email" | "phone", value: string) => {
      const profileId = state.profile?.id;
      if (!profileId) return;

      const contactType =
        type === "email" ? ContactType.EMAIL : ContactType.MSISDN;
      const res = await rpcAddContact(api, profileId, contactType, value);

      // Rebuild contacts from the updated profile
      const updatedProfile = profileObjectToProfileData(res.data);
      // Find the newly added contact (last one matching value)
      const newContact = updatedProfile.contacts.find(
        (c) => c.value === value,
      );
      if (newContact) {
        dispatch({ type: "ADDED_CONTACT", contact: newContact });
        dispatch({
          type: "PENDING_VERIFICATION",
          pending: {
            contactId: newContact.id,
            verificationId: res.verification_id,
          },
        });
      }
    },
    [api, state.profile?.id],
  );

  const removeContact = useCallback(
    async (contactId: string) => {
      await rpcRemoveContact(api, contactId);
      dispatch({ type: "REMOVED_CONTACT", contactId });
    },
    [api],
  );

  const sendVerification = useCallback(
    async (contactId: string) => {
      const res = await createContactVerification(api, contactId);
      dispatch({
        type: "PENDING_VERIFICATION",
        pending: { contactId, verificationId: res.id },
      });
    },
    [api],
  );

  const verifyContact = useCallback(
    async (contactId: string, code: string) => {
      const verificationId = state.pendingVerification?.verificationId;
      if (!verificationId) return;

      await checkVerification(api, verificationId, code);

      // Find the existing contact and mark it verified
      const existing = state.profile?.contacts.find((c) => c.id === contactId);
      if (existing) {
        dispatch({
          type: "UPDATED_CONTACT",
          contact: { ...existing, verified: true },
        });
      }
      dispatch({ type: "PENDING_VERIFICATION", pending: null });
    },
    [api, state.pendingVerification?.verificationId, state.profile?.contacts],
  );

  const dismissVerification = useCallback(() => {
    dispatch({ type: "PENDING_VERIFICATION", pending: null });
  }, []);

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
    ],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}
