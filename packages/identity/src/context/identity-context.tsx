import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { IdentityClient } from "../services/identity-client.js";
import type { ProfileResolver } from "../services/profile-resolver.js";
import type { IdentityVocabulary } from "../vocabulary/index.js";
import { generalVocabulary, mergeVocabulary } from "../vocabulary/index.js";
import type { Organization } from "../types.js";

/** Optional screens, defaulted per spec §5.1. */
export interface IdentityFeatures {
  orgUnits: boolean;
  platformRoles: boolean;
}

export interface IdentityContextValue {
  client: IdentityClient;
  vocabulary: IdentityVocabulary;
  features: IdentityFeatures;
  /** The organization every screen below the gate operates on. */
  organization: Organization | null;
  setOrganization: (organization: Organization | null) => void;
  profileResolver: ProfileResolver;
}

const IdentityContext = createContext<IdentityContextValue | null>(null);

interface IdentityProviderProps {
  client: IdentityClient;
  profileResolver: ProfileResolver;
  /** Merged over `generalVocabulary`. */
  vocabulary?: Partial<IdentityVocabulary>;
  features?: { orgUnits?: boolean; platformRoles?: boolean };
  children: ReactNode;
}

export function IdentityProvider({
  client,
  profileResolver,
  vocabulary,
  features,
  children,
}: IdentityProviderProps) {
  const [organization, setOrganization] = useState<Organization | null>(null);

  const merged = useMemo(
    () => mergeVocabulary(generalVocabulary, vocabulary),
    [vocabulary],
  );

  const resolvedFeatures = useMemo<IdentityFeatures>(
    () => ({
      orgUnits: features?.orgUnits ?? false,
      platformRoles: features?.platformRoles ?? true,
    }),
    [features?.orgUnits, features?.platformRoles],
  );

  const value = useMemo<IdentityContextValue>(
    () => ({
      client,
      vocabulary: merged,
      features: resolvedFeatures,
      organization,
      setOrganization,
      profileResolver,
    }),
    [client, merged, resolvedFeatures, organization, profileResolver],
  );

  return (
    <IdentityContext.Provider value={value}>
      {children}
    </IdentityContext.Provider>
  );
}

export function useIdentity(): IdentityContextValue {
  const ctx = useContext(IdentityContext);
  if (!ctx) {
    throw new Error("useIdentity must be used within an IdentityProvider");
  }
  return ctx;
}
