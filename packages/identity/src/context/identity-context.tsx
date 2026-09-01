import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { IdentityClient } from "../services/identity-client.js";
import type { TenancyClient } from "../services/tenancy-client.js";
import type { PermissionModel } from "../permissions/types.js";
import type { ProfileResolver } from "../services/profile-resolver.js";
import type { IdentityVocabulary } from "../vocabulary/index.js";
import { generalVocabulary, mergeVocabulary } from "../vocabulary/index.js";
import type { Organization, WorkforceMember } from "../types.js";

/** Optional screens, defaulted per spec §5.1. */
export interface IdentityFeatures {
  orgUnits: boolean;
  platformRoles: boolean;
}

/** What happened to a member, reported to the host after a successful write. */
export interface MemberChangeEvent {
  member: WorkforceMember;
  change: "created" | "updated" | "activated" | "deactivated" | "grants";
}

/**
 * Stand-in used when a host mounts the widget without a tenancy client.
 * Grants are only ever applied when a `permissionModel` is configured, so
 * this exists to keep the context value non-optional for consumers.
 */
const noTenancy: TenancyClient = {
  listServiceNamespaces: () => Promise.resolve([]),
  grantPermission: () => Promise.resolve(),
  revokePermission: () => Promise.resolve(),
};

export interface IdentityContextValue {
  client: IdentityClient;
  /** Platform tenancy service, used to apply permission grants. */
  tenancy: TenancyClient;
  /** Host-declared bundles; when set, bundles replace the platform role. */
  permissionModel?: PermissionModel;
  onMemberChange?: (event: MemberChangeEvent) => void;
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
  tenancy?: TenancyClient;
  permissionModel?: PermissionModel;
  onMemberChange?: (event: MemberChangeEvent) => void;
  profileResolver: ProfileResolver;
  /** Merged over `generalVocabulary`. */
  vocabulary?: Partial<IdentityVocabulary>;
  features?: { orgUnits?: boolean; platformRoles?: boolean };
  children: ReactNode;
}

export function IdentityProvider({
  client,
  tenancy,
  permissionModel,
  onMemberChange,
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
      tenancy: tenancy ?? noTenancy,
      permissionModel,
      onMemberChange,
      vocabulary: merged,
      features: resolvedFeatures,
      organization,
      setOrganization,
      profileResolver,
    }),
    [
      client,
      tenancy,
      permissionModel,
      onMemberChange,
      merged,
      resolvedFeatures,
      organization,
      profileResolver,
    ],
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
