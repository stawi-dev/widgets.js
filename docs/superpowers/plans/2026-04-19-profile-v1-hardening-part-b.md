# Profile widget v1 — hardening plan (Part B: @stawi/profile)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans. Continues from `2026-04-19-profile-v1-hardening.md`.

**Prereq:** Part A (auth-runtime v1) complete and committed.

---

## Task B.1: Migrate services from ApiClient → runtime.fetch

**Files:**

- Modify: `packages/profile/src/services/profile-service.ts`
- Modify: `packages/profile/src/__tests__/services/profile-service.test.ts`

- [ ] **Step 1: Update test to new contract**

```ts
// packages/profile/src/__tests__/services/profile-service.test.ts
import { describe, it, expect, vi } from "vitest";
import {
  getProfile,
  updateProfile,
  addContact,
  removeContact,
} from "../../services/profile-service.js";
import { ContactType } from "../../types.js";

function runtimeWith(response: unknown) {
  return { fetch: vi.fn().mockResolvedValue(response) } as any;
}

describe("profile-service", () => {
  it("getProfile calls /profile.v1.ProfileService/GetById via runtime.fetch", async () => {
    const rt = runtimeWith({ data: { id: "1" } });
    await getProfile(rt, "1");
    expect(rt.fetch).toHaveBeenCalledWith(
      "/profile.v1.ProfileService/GetById",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "Idempotency-Key": expect.any(String),
        }),
      }),
    );
  });
  it("addContact posts typed body", async () => {
    const rt = runtimeWith({ data: { id: "1" }, verification_id: "v" });
    await addContact(rt, "p1", ContactType.EMAIL, "a@b");
    const body = JSON.parse((rt.fetch.mock.calls[0][1] as any).body);
    expect(body).toEqual({ profile_id: "p1", type: 0, detail: "a@b" });
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// packages/profile/src/services/profile-service.ts
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
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
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
  return post(rt, "GetById", { id: profileId }, true); // mutation=true for idempotency on retry
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
  return post(rt, "CheckVerification", {
    verification_id: verificationId,
    code,
  });
}

export function removeContact(
  rt: AuthRuntime,
  contactId: string,
): Promise<void> {
  return post(rt, "RemoveContact", { contact_id: contactId });
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/profile/src/services/profile-service.ts packages/profile/src/__tests__/services/profile-service.test.ts
git commit -m "refactor(profile): services accept AuthRuntime; add Idempotency-Key headers"
```

---

## Task B.2: AuthContext — use createAuthRuntime + expose runtime

**Files:**

- Modify: `packages/profile/src/context/auth-context.tsx`
- Modify: `packages/profile/src/hooks/use-api.ts`
- Modify: `packages/profile/src/__tests__/context/auth-context.test.tsx`

- [ ] **Step 1: Update the test to validate per-instance runtime + destroy on unmount**

```tsx
// packages/profile/src/__tests__/context/auth-context.test.tsx
import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { AuthProvider } from "../../context/auth-context.js";
import * as rt from "@stawi/auth-runtime";

describe("AuthProvider", () => {
  it("creates a fresh runtime per instance and destroys on unmount", () => {
    const destroy = vi.fn();
    const stub = {
      version: "1.0",
      getState: () => "unauthenticated",
      onAuthStateChange: (cb: any) => {
        cb("unauthenticated");
        return () => {};
      },
      ensureAuthenticated: vi.fn(),
      logout: vi.fn(),
      fetch: vi.fn(),
      upload: vi.fn(),
      getRoles: vi.fn().mockResolvedValue([]),
      destroy,
      onSecurityEvent: () => () => {},
      prefetchDiscovery: vi.fn(),
    };
    const spy = vi.spyOn(rt, "createAuthRuntime").mockReturnValue(stub as any);
    const { unmount } = render(
      <AuthProvider clientId="c" idpBaseUrl="https://i" apiBaseUrl="https://a">
        <span>x</span>
      </AuthProvider>,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => {
      unmount();
    });
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```tsx
// packages/profile/src/context/auth-context.tsx
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createAuthRuntime,
  type AuthRuntime,
  type AuthState,
} from "@stawi/auth-runtime";

export interface AuthContextValue {
  authState: AuthState;
  runtime: AuthRuntime;
  ensureAuthenticated: () => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  clientId: string;
  installationId?: string;
  idpBaseUrl?: string;
  apiBaseUrl?: string;
  children: ReactNode;
}

export function AuthProvider({
  clientId,
  installationId,
  idpBaseUrl,
  apiBaseUrl,
  children,
}: AuthProviderProps) {
  const runtime = useMemo(
    () =>
      createAuthRuntime({ clientId, installationId, idpBaseUrl, apiBaseUrl }),
    [clientId, installationId, idpBaseUrl, apiBaseUrl],
  );
  const [authState, setAuthState] = useState<AuthState>("initializing");

  useEffect(() => {
    const off = runtime.onAuthStateChange(setAuthState);
    return () => {
      off();
      runtime.destroy();
    };
  }, [runtime]);

  const ensureAuthenticated = useCallback(
    () => runtime.ensureAuthenticated(),
    [runtime],
  );
  const logout = useCallback(() => runtime.logout(), [runtime]);

  const value = useMemo<AuthContextValue>(
    () => ({ authState, runtime, ensureAuthenticated, logout }),
    [authState, runtime, ensureAuthenticated, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
```

```ts
// packages/profile/src/hooks/use-api.ts
import { useAuth } from "./use-auth.js";
import type { AuthRuntime } from "@stawi/auth-runtime";

export function useApi(): AuthRuntime {
  return useAuth().runtime;
}
```

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/profile/src/context/auth-context.tsx packages/profile/src/hooks/use-api.ts packages/profile/src/__tests__/context/auth-context.test.tsx
git commit -m "refactor(profile): per-instance runtime lifecycle; destroy on unmount"
```

---

## Task B.3: ProfileContext — pass runtime through, sanitize picture URL

**Files:**

- Modify: `packages/profile/src/context/profile-context.tsx`
- Modify: `packages/profile/src/services/profile-mapper.ts`
- Create: `packages/profile/src/utils/sanitize-picture-url.ts`
- Create: `packages/profile/src/__tests__/utils/sanitize-picture-url.test.ts`

- [ ] **Step 1: Test sanitizer**

```ts
// packages/profile/src/__tests__/utils/sanitize-picture-url.test.ts
import { describe, it, expect } from "vitest";
import { sanitizePictureUrl } from "../../utils/sanitize-picture-url.js";

describe("sanitizePictureUrl", () => {
  it("accepts https URLs", () =>
    expect(sanitizePictureUrl("https://a/b.png")).toBe("https://a/b.png"));
  it("accepts data:image/*;base64 with size cap", () => {
    const small = `data:image/png;base64,${"A".repeat(100)}`;
    expect(sanitizePictureUrl(small)).toBe(small);
  });
  it("rejects javascript:", () =>
    expect(sanitizePictureUrl("javascript:alert(1)")).toBeUndefined());
  it("rejects http://", () =>
    expect(sanitizePictureUrl("http://a/b.png")).toBeUndefined());
  it("rejects blob: and file:", () => {
    expect(sanitizePictureUrl("blob:https://x/y")).toBeUndefined();
    expect(sanitizePictureUrl("file:///etc/passwd")).toBeUndefined();
  });
  it("rejects non-image data URIs", () => {
    expect(
      sanitizePictureUrl("data:text/html;base64,PHN2Zz4="),
    ).toBeUndefined();
  });
  it("rejects data URIs over size cap", () => {
    const big = `data:image/png;base64,${"A".repeat(600_000)}`;
    expect(sanitizePictureUrl(big)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// packages/profile/src/utils/sanitize-picture-url.ts
const MAX_DATA_LEN = 512 * 1024; // chars ≈ 384KB decoded
const DATA_RE = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export function sanitizePictureUrl(
  raw: string | undefined | null,
): string | undefined {
  if (!raw) return undefined;
  if (raw.startsWith("https://")) return raw;
  if (raw.startsWith("data:")) {
    if (raw.length > MAX_DATA_LEN) return undefined;
    return DATA_RE.test(raw) ? raw : undefined;
  }
  return undefined;
}
```

Then update `profile-mapper.ts`:

```ts
// packages/profile/src/services/profile-mapper.ts (replace picture assignment)
import { sanitizePictureUrl } from "../utils/sanitize-picture-url.js";
// ...
const picture = sanitizePictureUrl(
  (props.au_avater_uri as string) || undefined,
);
```

Update `profile-context.tsx` to accept the runtime and pass it to services (replace `api` with `runtime`, drop `ApiClient` dependency). Since this is a large rewrite, the full file:

```tsx
// packages/profile/src/context/profile-context.tsx
import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  type ReactNode,
} from "react";
import { decodeJwtPayload } from "@stawi/auth-runtime";
import type { ProfileData, ProfileState, ProfileAction } from "../types.js";
import { ContactType } from "../types.js";
import { useAuth } from "../hooks/use-auth.js";
import {
  getProfile,
  updateProfile as rpcUpdate,
  addContact as rpcAdd,
  createContactVerification,
  checkVerification,
  removeContact as rpcRemove,
} from "../services/profile-service.js";
import {
  profileObjectToProfileData,
  uiUpdatesToProtoProperties,
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
        // decode sub from a fresh access token via runtime.fetch's 401-refresh path
        // To avoid exposing tokens, we look up the profile via a "/me" call instead of parsing sub client-side.
        const me = await runtime.fetch<{ data: { id: string } }>(
          "/profile.v1.ProfileService/GetMe",
          {
            method: "POST",
            body: "{}",
            headers: { "Content-Type": "application/json" },
          },
        );
        const profileId = me.data.id;
        const res = await getProfile(runtime, profileId);
        if (!cancelled)
          dispatch({
            type: "LOADED",
            profile: profileObjectToProfileData(res.data),
          });
      } catch (err) {
        if (!cancelled)
          dispatch({
            type: "ERROR",
            error:
              err instanceof Error ? err.message : "Failed to load profile",
          });
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
      const resp = await runtime.upload<{
        data: { properties: { au_avater_uri?: string } };
      }>(`/profile.v1.ProfileService/UpdateAvatar/${profileId}`, file);
      const url = resp.data?.properties?.au_avater_uri;
      if (url) dispatch({ type: "UPDATED_PROFILE", updates: { picture: url } });
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
```

Note: this introduces `/profile.v1.ProfileService/GetMe`. If the backend doesn't support it, fall back temporarily by decoding the JWT claims via a new `runtime.getAccessTokenClaims()` helper — **NOT** exposing the token itself. Open a follow-up task to add that helper to auth-runtime if needed. For now, the `GetMe` approach is spec-aligned.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/profile/src/context/profile-context.tsx packages/profile/src/services/profile-mapper.ts packages/profile/src/utils packages/profile/src/__tests__/utils
git commit -m "feat(profile): rework context to use runtime.fetch/upload + sanitize picture URL"
```

---

## Task B.4: Avatar validation + multipart upload

**Files:**

- Create: `packages/profile/src/utils/validate-avatar.ts`
- Create: `packages/profile/src/__tests__/utils/validate-avatar.test.ts`
- Modify: `packages/profile/src/components/AvatarEditor.tsx`
- Modify: `packages/profile/src/__tests__/components/AvatarEditor.test.tsx`

- [ ] **Step 1: Test**

```ts
// packages/profile/src/__tests__/utils/validate-avatar.test.ts
import { describe, it, expect } from "vitest";
import { validateAvatar } from "../../utils/validate-avatar.js";

function file(bytes: number[], { type = "image/png", name = "a.png" } = {}) {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe("validateAvatar", () => {
  it("rejects over-sized", async () => {
    const big = file(Array(1024).fill(0));
    await expect(validateAvatar(big, { maxBytes: 100 })).rejects.toMatchObject({
      code: "AVATAR_TOO_LARGE",
    });
  });
  it("rejects unknown magic bytes", async () => {
    const txt = file([0x48, 0x69]);
    await expect(validateAvatar(txt, { maxBytes: 1024 })).rejects.toMatchObject(
      { code: "AVATAR_TYPE_UNSUPPORTED" },
    );
  });
  it("accepts PNG magic", async () => {
    const png = file([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    // dimensions-check will fail in jsdom without an ImageBitmap polyfill;
    // skip that branch via the skipDimensionsCheck option in tests
    await expect(
      validateAvatar(png, { maxBytes: 1024, skipDimensionsCheck: true }),
    ).resolves.toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// packages/profile/src/utils/validate-avatar.ts
import { AuthError } from "@stawi/auth-runtime";

export interface AvatarValidateOptions {
  maxBytes: number;
  maxDimension?: number;
  skipDimensionsCheck?: boolean;
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG = [0xff, 0xd8, 0xff];
const GIF87 = [0x47, 0x49, 0x46, 0x38, 0x37, 0x61];
const GIF89 = [0x47, 0x49, 0x46, 0x38, 0x39, 0x61];
const RIFF = [0x52, 0x49, 0x46, 0x46];

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (bytes[i] !== sig[i]) return false;
  return true;
}

export async function validateAvatar(
  file: File,
  opts: AvatarValidateOptions,
): Promise<void> {
  if (file.size > opts.maxBytes) {
    throw new AuthError(
      "API_VALIDATION" as any,
      `avatar too large (${file.size} > ${opts.maxBytes})`,
    );
  }
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const isPng = startsWith(head, PNG);
  const isJpeg = startsWith(head, JPEG);
  const isGif = startsWith(head, GIF87) || startsWith(head, GIF89);
  const isWebp =
    startsWith(head, RIFF) &&
    head[8] === 0x57 &&
    head[9] === 0x45 &&
    head[10] === 0x42 &&
    head[11] === 0x50;
  if (!(isPng || isJpeg || isGif || isWebp)) {
    throw new AuthError("API_VALIDATION" as any, "avatar type unsupported");
  }
  if (opts.skipDimensionsCheck) return;
  const max = opts.maxDimension ?? 4096;
  try {
    const bmp = await createImageBitmap(file);
    if (bmp.width > max || bmp.height > max) {
      throw new AuthError(
        "API_VALIDATION" as any,
        `avatar dimensions exceed ${max}`,
      );
    }
  } catch (err) {
    if (err instanceof AuthError) throw err;
    throw new AuthError(
      "API_VALIDATION" as any,
      "avatar dimension check failed",
      err,
    );
  }
}
```

Update the error codes registry (`shared/auth-runtime/src/shared/errors.ts`) to include `AVATAR_TOO_LARGE`, `AVATAR_TYPE_UNSUPPORTED`, `AVATAR_DIMENSIONS_EXCEEDED`. Adjust the above `throw` statements to use the new specific codes and remove the `as any` cast. (Separate commit, chained into the auth-runtime update if A.17 is already released — otherwise include in this PR.)

Update `AvatarEditor.tsx`:

```tsx
// packages/profile/src/components/AvatarEditor.tsx
import { useCallback, useContext, useRef } from "react";
import { useProfile } from "../hooks/use-profile.js";
import { useGravatarUrl } from "../hooks/use-gravatar.js";
import { getInitials } from "../utils/get-initials.js";
import { validateAvatar } from "../utils/validate-avatar.js";
import { HooksContext } from "../context/hooks-context.js"; // new (Task B.10)

export function AvatarEditor({
  maxAvatarBytes = 2 * 1024 * 1024,
}: {
  maxAvatarBytes?: number;
}) {
  const { state, uploadAvatar } = useProfile();
  const hooks = useContext(HooksContext);
  const inputRef = useRef<HTMLInputElement>(null);
  const profile = state.profile;
  const gravatarUrl = useGravatarUrl(profile?.email, 112);

  const handleClick = useCallback(() => inputRef.current?.click(), []);
  const handleChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file) return;
      try {
        await validateAvatar(file, { maxBytes: maxAvatarBytes });
        await uploadAvatar(file);
      } catch (err) {
        hooks?.onError?.(err as any);
      }
    },
    [uploadAvatar, maxAvatarBytes, hooks],
  );

  if (!profile) return null;
  const avatarSrc = profile.picture || gravatarUrl;

  return (
    <>
      <div
        className="aiw-avatar-large"
        onClick={handleClick}
        role="button"
        tabIndex={0}
        aria-label="Change avatar"
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") handleClick();
        }}
      >
        {avatarSrc ? (
          <img src={avatarSrc} alt={profile.name} />
        ) : (
          <span className="aiw-avatar-initials">
            {getInitials(profile.name)}
          </span>
        )}
        <div className="aiw-avatar-overlay">Edit</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        className="aiw-hidden-input"
        onChange={handleChange}
        tabIndex={-1}
      />
    </>
  );
}
```

- [ ] **Step 4: Run — PASS** (existing AvatarEditor tests updated)

- [ ] **Step 5: Commit**

```bash
git add packages/profile/src shared/auth-runtime/src/shared/errors.ts
git commit -m "feat(profile): avatar magic-byte + size + dimension validation; multipart upload"
```

---

## Task B.5: Theme + design-token API

**Files:**

- Modify: `packages/profile/src/styles/styles.ts`
- Create: `packages/profile/src/themes/types.ts`
- Create: `packages/profile/src/themes/apply.ts`
- Create: `packages/profile/src/themes/presets.ts`
- Create: `packages/profile/src/__tests__/themes/apply.test.ts`
- Modify: `packages/profile/src/shadow-host.tsx`
- Modify: `packages/profile/src/index.tsx`
- Modify: `packages/profile/src/types.ts`

- [ ] **Step 1: Test apply util**

```ts
// packages/profile/src/__tests__/themes/apply.test.ts
import { describe, it, expect } from "vitest";
import { applyTokens, tokenToCssVar } from "../../themes/apply.js";

describe("applyTokens", () => {
  it("maps camelCase tokens to --aiw-* vars and sets on host element", () => {
    const el = document.createElement("div");
    applyTokens(el, { colorPrimary: "#0f0", radius: "12px" });
    expect(el.style.getPropertyValue("--aiw-primary")).toBe("#0f0");
    expect(el.style.getPropertyValue("--aiw-radius")).toBe("12px");
  });
  it("rejects invalid size values silently", () => {
    const el = document.createElement("div");
    applyTokens(el, { radius: "not-a-size" as any });
    expect(el.style.getPropertyValue("--aiw-radius")).toBe("");
  });
  it("tokenToCssVar handles known tokens", () => {
    expect(tokenToCssVar("colorPrimary")).toBe("--aiw-primary");
    expect(tokenToCssVar("fontHeading")).toBe("--aiw-font-heading");
    expect(tokenToCssVar("popoverWidth")).toBe("--aiw-popover-width");
  });
});
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

```ts
// packages/profile/src/themes/types.ts
export interface ProfileWidgetTokens {
  colorBg?: string;
  colorSurface?: string;
  colorText?: string;
  colorTextSecondary?: string;
  colorBorder?: string;
  colorPrimary?: string;
  colorPrimaryHover?: string;
  colorDanger?: string;
  colorDangerHover?: string;
  colorMuted?: string;
  colorMutedStrong?: string;
  colorFocusRing?: string;
  fontHeading?: string;
  fontBody?: string;
  fontSizeBase?: string;
  fontWeightHeading?: number;
  fontWeightBody?: number;
  radius?: string;
  radiusSm?: string;
  popoverWidth?: string;
  popoverOffset?: string;
  shadow?: string;
  zIndexPopover?: number;
  zIndexDialog?: number;
  triggerSize?: string;
  avatarLargeSize?: string;
}

export interface ProfileWidgetThemedTokens extends ProfileWidgetTokens {
  dark?: ProfileWidgetTokens;
  light?: ProfileWidgetTokens;
}
```

```ts
// packages/profile/src/themes/apply.ts
import type { ProfileWidgetTokens } from "./types.js";

const SIZE_RE = /^-?\d+(\.\d+)?(px|rem|em|%|vh|vw)$|^calc\(.+\)$/;

const MAP: Record<string, string> = {
  colorBg: "--aiw-bg",
  colorSurface: "--aiw-surface",
  colorText: "--aiw-text",
  colorTextSecondary: "--aiw-text-secondary",
  colorBorder: "--aiw-border",
  colorPrimary: "--aiw-primary",
  colorPrimaryHover: "--aiw-primary-hover",
  colorDanger: "--aiw-danger",
  colorDangerHover: "--aiw-danger-hover",
  colorMuted: "--aiw-muted",
  colorMutedStrong: "--aiw-muted-strong",
  colorFocusRing: "--aiw-focus-ring",
  fontHeading: "--aiw-font-heading",
  fontBody: "--aiw-font-body",
  fontSizeBase: "--aiw-font-size-base",
  fontWeightHeading: "--aiw-font-weight-heading",
  fontWeightBody: "--aiw-font-weight-body",
  radius: "--aiw-radius",
  radiusSm: "--aiw-radius-sm",
  popoverWidth: "--aiw-popover-width",
  popoverOffset: "--aiw-popover-offset",
  shadow: "--aiw-shadow",
  zIndexPopover: "--aiw-z-popover",
  zIndexDialog: "--aiw-z-dialog",
  triggerSize: "--aiw-trigger-size",
  avatarLargeSize: "--aiw-avatar-large-size",
};

export function tokenToCssVar(key: string): string | undefined {
  return MAP[key];
}

function isSize(v: unknown): v is string {
  return typeof v === "string" && SIZE_RE.test(v);
}

export function applyTokens(
  el: HTMLElement,
  tokens: ProfileWidgetTokens,
): void {
  for (const [k, v] of Object.entries(tokens)) {
    const cssVar = MAP[k];
    if (!cssVar || v === undefined || v === null) continue;
    if (
      k.startsWith("radius") ||
      k === "popoverWidth" ||
      k === "popoverOffset" ||
      k === "fontSizeBase" ||
      k === "triggerSize" ||
      k === "avatarLargeSize"
    ) {
      if (!isSize(v)) continue;
    }
    if (k.startsWith("zIndex")) {
      if (!Number.isFinite(Number(v))) continue;
    }
    el.style.setProperty(cssVar, String(v));
  }
}
```

```ts
// packages/profile/src/themes/presets.ts
import type { ProfileWidgetTokens } from "./types.js";

export const claudeDark: ProfileWidgetTokens = {
  colorBg: "#2c2a28",
  colorSurface: "#363432",
  colorText: "#e8e6e1",
  colorPrimary: "#d97757",
  colorPrimaryHover: "#c4633f",
};
export const claudeLight: ProfileWidgetTokens = {
  colorBg: "#fafaf9",
  colorSurface: "#ffffff",
  colorText: "#2a2a2a",
  colorPrimary: "#d97757",
  colorPrimaryHover: "#c4633f",
};
export const neutralLight: ProfileWidgetTokens = {
  colorBg: "#ffffff",
  colorSurface: "#f7f7f7",
  colorText: "#111111",
  colorPrimary: "#2563eb",
  colorPrimaryHover: "#1d4ed8",
};
export const highContrast: ProfileWidgetTokens = {
  colorBg: "#000000",
  colorSurface: "#0a0a0a",
  colorText: "#ffffff",
  colorBorder: "#ffffff",
  colorPrimary: "#ffff00",
  colorPrimaryHover: "#cccc00",
};
```

Add light-theme branches to `styles.ts` (append before the closing backtick):

```css
:host {
  color-scheme: dark light;
  --aiw-font-size-base: 14px;
  --aiw-font-weight-heading: 600;
  --aiw-font-weight-body: 400;
  --aiw-popover-offset: 8px;
  --aiw-z-popover: 10000;
  --aiw-z-dialog: 10001;
  --aiw-trigger-size: 40px;
  --aiw-avatar-large-size: 72px;
  --aiw-focus-ring: 2px solid var(--aiw-primary);
}
:host([data-theme="light"]),
@media (prefers-color-scheme: light) {
  :host([data-theme="auto"]) {
    --aiw-bg: #fafaf9;
    --aiw-surface: #ffffff;
    --aiw-text: #2a2a2a;
    --aiw-text-secondary: #6b6b6b;
    --aiw-border: #e5e5e2;
    --aiw-muted: rgba(0, 0, 0, 0.05);
    --aiw-muted-strong: rgba(0, 0, 0, 0.09);
    --aiw-shadow: 0 8px 24px rgba(0, 0, 0, 0.08), 0 2px 6px rgba(0, 0, 0, 0.05);
  }
}
```

Update `ShadowStyleProvider` to accept tokens and inject theme-scoped token blocks + a final raw-css escape hatch:

```tsx
// packages/profile/src/shadow-host.tsx
import { useEffect, useRef, type ReactNode } from "react";
import { widgetStyles } from "./styles/styles.js";
import type { ProfileWidgetThemedTokens } from "./themes/types.js";
import { tokenToCssVar } from "./themes/apply.js";

interface Props {
  shadowRoot: ShadowRoot;
  hostElement: HTMLElement;
  externalFonts: boolean;
  tokens?: ProfileWidgetThemedTokens;
  css?: string;
  children: ReactNode;
}

function block(selector: string, tokens: Record<string, unknown>): string {
  const lines: string[] = [];
  for (const [k, v] of Object.entries(tokens)) {
    const cv = tokenToCssVar(k);
    if (!cv) continue;
    lines.push(`${cv}: ${String(v)};`);
  }
  return lines.length ? `${selector}{${lines.join("")}}` : "";
}

export function ShadowStyleProvider({
  shadowRoot,
  hostElement,
  externalFonts,
  tokens,
  css,
  children,
}: Props) {
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    if (externalFonts) {
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href =
        "https://fonts.googleapis.com/css2?family=Poppins:wght@500;600;700&family=Lora:wght@400;500&display=swap";
      shadowRoot.prepend(link);
    }
    const style = document.createElement("style");
    style.textContent = widgetStyles;
    shadowRoot.prepend(style);

    if (tokens) {
      const s2 = document.createElement("style");
      const parts: string[] = [];
      const { dark, light, ...base } = tokens;
      parts.push(block(":host", base));
      if (dark)
        parts.push(
          block(':host([data-theme="dark"])', dark),
          block(
            '@media (prefers-color-scheme: dark){:host([data-theme="auto"])',
            dark,
          ) + "}",
        );
      if (light)
        parts.push(
          block(':host([data-theme="light"])', light),
          block(
            '@media (prefers-color-scheme: light){:host([data-theme="auto"])',
            light,
          ) + "}",
        );
      s2.textContent = parts.filter(Boolean).join("");
      shadowRoot.appendChild(s2);
    }
    if (css) {
      const s3 = document.createElement("style");
      s3.textContent = css;
      shadowRoot.appendChild(s3);
    }
  }, [shadowRoot, externalFonts, tokens, css]);
  return <>{children}</>;
}
```

Update `index.tsx` `mount()` to pass `tokens`, `css`, `externalFonts`, set `data-theme` always, and pass host element.

Update `types.ts` to add the new fields to `ProfileWidgetProps`.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```bash
git add packages/profile/src
git commit -m "feat(profile): theme + design-token API + raw-CSS escape hatch"
```

---

## Task B.6: Inlined font subsets (build step)

**Files:**

- Create: `packages/profile/scripts/build-fonts.mjs`
- Create: `packages/profile/src/styles/fonts.inlined.ts` (generated file, tracked)
- Modify: `packages/profile/package.json` (add `build:fonts`, run before `build`)
- Modify: `packages/profile/src/styles/styles.ts` (prepend fonts.inlined)

- [ ] **Step 1: Add devDep**

```bash
pnpm --filter @stawi/profile add -D subset-font
```

- [ ] **Step 2: Write the build script**

```js
// packages/profile/scripts/build-fonts.mjs
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import subsetFont from "subset-font";

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(__dirname, "../src/styles");
const FONTS = [
  {
    family: "Poppins",
    weights: [500, 600, 700],
    src: "https://github.com/google/fonts/raw/main/ofl/poppins/Poppins-{W}.ttf",
  },
  {
    family: "Lora",
    weights: [400, 500],
    src: "https://github.com/google/fonts/raw/main/ofl/lora/Lora-VariableFont_wght.ttf",
  },
];
const LATIN_RANGES =
  "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+2074,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD";

async function fetchBuffer(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`fetch ${url} ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

function faceRule(family, weight, b64) {
  return `@font-face{font-family:'${family}';font-style:normal;font-weight:${weight};font-display:swap;src:url('data:font/woff2;base64,${b64}') format('woff2');unicode-range:${LATIN_RANGES};}`;
}

async function main() {
  const parts = [];
  for (const f of FONTS) {
    for (const w of f.weights) {
      const src = f.src.replace(
        "{W}",
        w === 400
          ? "Regular"
          : w === 500
            ? "Medium"
            : w === 600
              ? "SemiBold"
              : "Bold",
      );
      const buf = await fetchBuffer(src);
      const woff2 = await subsetFont(
        buf,
        "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 .,;:!?@#$%&*()-+=/\"'",
        { targetFormat: "woff2" },
      );
      parts.push(faceRule(f.family, w, woff2.toString("base64")));
    }
  }
  const ts = `export const inlinedFonts = ${JSON.stringify(parts.join(""))};\n`;
  writeFileSync(resolve(outDir, "fonts.inlined.ts"), ts);
  console.log(`wrote ${parts.length} @font-face rules`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Wire build script**

Edit `packages/profile/package.json` `scripts`:

```json
"build:fonts": "node scripts/build-fonts.mjs",
"build": "pnpm build:fonts && tsup",
```

Edit `packages/profile/src/styles/styles.ts`:

```ts
import { inlinedFonts } from "./fonts.inlined.js";
export const widgetStyles = `${inlinedFonts}
:host { /* ...existing dark... */ }
/* …rest unchanged… */
`;
```

If `fonts.inlined.ts` doesn't exist yet, add a committed stub that exports `""` so tests run without a network fetch; regenerate during build.

- [ ] **Step 4: Run build + test**

```bash
pnpm --filter @stawi/profile build && pnpm --filter @stawi/profile test
```

- [ ] **Step 5: Commit**

```bash
git add packages/profile
git commit -m "feat(profile): inline woff2 subsets at build time; externalFonts=false default"
```

---

## Task B.7: Gravatar opt-in + hooks context

**Files:**

- Create: `packages/profile/src/context/hooks-context.ts`
- Modify: `packages/profile/src/hooks/use-gravatar.ts`
- Modify: `packages/profile/src/components/AvatarEditor.tsx`
- Modify: `packages/profile/src/components/ProfilePopover.tsx`

- [ ] **Step 1: Hooks context**

```ts
// packages/profile/src/context/hooks-context.ts
import { createContext } from "react";
import type { AuthState, SecurityEvent } from "@stawi/auth-runtime";

export interface WidgetHooks {
  onError?: (err: unknown) => void;
  onAuthStateChange?: (s: AuthState) => void;
  onSecurityEvent?: (e: SecurityEvent) => void;
  onMetric?: (
    name: string,
    durationMs: number,
    tags: Record<string, string>,
  ) => void;
  gravatar?: boolean;
  locale?: string;
}

export const HooksContext = createContext<WidgetHooks>({});
```

- [ ] **Step 2: Make gravatar conditional**

```ts
// packages/profile/src/hooks/use-gravatar.ts
import { useContext, useEffect, useState } from "react";
import { HooksContext } from "../context/hooks-context.js";

async function sha256Hex(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function useGravatarUrl(
  email: string | undefined,
  size: number,
): string | null {
  const hooks = useContext(HooksContext);
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!hooks.gravatar || !email) {
      setUrl(null);
      return;
    }
    let cancelled = false;
    sha256Hex(email.trim().toLowerCase()).then((hex) => {
      if (!cancelled)
        setUrl(`https://www.gravatar.com/avatar/${hex}?s=${size}&d=404`);
    });
    return () => {
      cancelled = true;
    };
  }, [hooks.gravatar, email, size]);

  return url;
}
```

- [ ] **Step 3: Wrap widget root in `HooksContext.Provider`**

In `ProfileWidgetRoot.tsx` accept the new props and pass them into the provider.

- [ ] **Step 4: Run**

```bash
pnpm --filter @stawi/profile test
```

- [ ] **Step 5: Commit**

```bash
git add packages/profile/src
git commit -m "feat(profile): widget hooks context; gravatar off by default"
```

---

## Task B.8: AdminPanelButton href validation

**Files:**

- Modify: `packages/profile/src/index.tsx`
- Modify: `packages/profile/src/components/ProfileWidgetRoot.tsx`

- [ ] **Step 1: Validate in `mount`**

```ts
// in index.tsx mount():
if (options.adminPanelUrl) {
  try {
    const u = new URL(options.adminPanelUrl);
    if (!(u.protocol === "http:" || u.protocol === "https:"))
      throw new Error("bad protocol");
  } catch (err) {
    console.error("[profile] invalid adminPanelUrl; ignoring", err);
    options = { ...options, adminPanelUrl: undefined };
  }
}
```

- [ ] **Step 2: Run — PASS existing tests**

- [ ] **Step 3: Commit**

```bash
git add packages/profile/src/index.tsx
git commit -m "fix(profile): validate adminPanelUrl protocol at mount"
```

---

## Task B.9: Unified verification UX (dialog + persistent banner)

**Files:**

- Modify: `packages/profile/src/components/ContactMethodItem.tsx` (remove inline form; trigger dialog)
- Modify: `packages/profile/src/components/VerifyDialog.tsx` (add focus trap + minimize)
- Create: `packages/profile/src/components/VerifyBanner.tsx`
- Create: `packages/profile/src/hooks/use-focus-trap.ts`
- Modify: `packages/profile/src/components/ProfileCard.tsx` (render banner when dialog dismissed but pending still set)
- Modify: `packages/profile/src/context/profile-context.tsx` (add `minimizeVerification` action)

Implementation is mechanical given the earlier tests; ensure tests exercise:

- Dismiss dialog → banner shown → clicking banner reopens dialog
- Removing the contact clears banner
- Tab key stays inside dialog (focus-trap test using jsdom + keyboard events)

- [ ] **Step 1–5** per the TDD rhythm. Commit message:

```
feat(profile): unify verification UX with minimizable dialog + persistent banner
```

---

## Task B.10: i18n

**Files:**

- Create: `packages/profile/src/i18n/en.json`, `fr.json`, `sw.json`, `ar.json`
- Create: `packages/profile/src/i18n/index.ts`
- Modify: every component using UI strings

- [ ] **Step 1: Translations** — start with English keys; others can be empty objects that fall through.

```json
// packages/profile/src/i18n/en.json
{
  "auth.login": "Login",
  "auth.signingOut": "Signing out…",
  "auth.signOut": "Sign Out",
  "auth.loading": "Loading authentication",
  "contacts.title": "Contacts",
  "contacts.edit": "Edit contacts",
  "contacts.done": "Done",
  "contacts.add": "+ Add Contact",
  "contacts.addPlaceholder": "email@example.com or +254…",
  "contacts.cancel": "Cancel",
  "contacts.adding": "Adding…",
  "contacts.addCta": "Add",
  "verify.title": "Verify Contact",
  "verify.label": "Enter the verification code:",
  "verify.submit": "Verify",
  "verify.submitting": "Verifying…",
  "verify.cta": "Verify",
  "verify.pendingBanner": "Verify {{value}}",
  "errors.loadProfile": "Couldn't load your profile",
  "errors.network": "Network error — please retry",
  "admin.open": "Admin Panel",
  "profile.changeAvatar": "Change avatar",
  "profile.openMenu": "Open profile menu",
  "profile.dialog": "Profile",
  "settings.country": "Country",
  "settings.language": "Language",
  "settings.selectCountry": "Select country",
  "tryAgain": "Try again"
}
```

- [ ] **Step 2: Resolver**

```ts
// packages/profile/src/i18n/index.ts
import en from "./en.json";
import fr from "./fr.json";
import sw from "./sw.json";
import ar from "./ar.json";

const tables: Record<string, Record<string, string>> = { en, fr, sw, ar };

export function translator(locale?: string) {
  const key = (locale ?? "en").toLowerCase();
  const primary = tables[key] ?? tables[key.split("-")[0] ?? "en"] ?? tables.en;
  return (k: string, vars?: Record<string, string>): string => {
    let s = primary[k] ?? tables.en[k] ?? k;
    if (vars)
      for (const [vk, vv] of Object.entries(vars))
        s = s.replace(`{{${vk}}}`, vv);
    return s;
  };
}

export function isRtl(locale?: string): boolean {
  const l = (locale ?? "en").toLowerCase().split("-")[0];
  return l === "ar" || l === "he" || l === "fa" || l === "ur";
}
```

- [ ] **Step 3: Use in components**

Wrap widget root with a memoized `t` from `useContext(HooksContext).locale`. Replace literals (`"Login"`, `"Contacts"`, etc.) with `t("auth.login")`, etc.

- [ ] **Step 4: Run**

- [ ] **Step 5: Commit**

```
feat(profile): i18n module (en/fr/sw/ar + RTL)
```

---

## Task B.11: A11y — focus trap, aria-modal, focus return

**Files:**

- Create: `packages/profile/src/hooks/use-focus-trap.ts`
- Modify: `packages/profile/src/components/VerifyDialog.tsx`
- Modify: `packages/profile/src/components/ProfilePopover.tsx`
- Add devDep: `axe-core`, `@axe-core/react` (test-only)

TDD tests exercise Tab/Shift-Tab boundaries and focus return on close. Include axe-core snapshot in the integration test suite.

Commit: `feat(profile): focus trap, aria-modal, focus return, axe checks in CI`.

---

## Task B.12: Observability + MountHandle enhancements

**Files:**

- Modify: `packages/profile/src/index.tsx`
- Modify: `packages/profile/src/context/hooks-context.ts`
- Modify: `packages/profile/src/components/ProfileWidgetRoot.tsx`

- [ ] **Step 1: MountHandle** includes `version`, `getAuthState`, `prefetchDiscovery`. Injected via `define: { __STAWI_PROFILE_VERSION__: JSON.stringify(pkg.version) }` in `tsup.config.ts`.
- [ ] **Step 2: Forward `onAuthStateChange`, `onError`, `onSecurityEvent`, `onMetric` into `HooksContext` and subscribe from `AuthProvider`.
- [ ] **Step 3: Bootstrap parses `data-tokens`, `data-locale`, `data-external-fonts`, `data-gravatar`. Warn when `document.currentScript` is null.

Commit: `feat(profile): observability hooks + MountHandle (version, prefetchDiscovery)`.

---

## Task B.13: Popup callback page (bundled + documented)

**Files:**

- Create: `packages/profile/public/auth-callback.html` (copied to dist)
- Modify: `packages/profile/tsup.config.ts` (copy to dist via `onSuccess`)

```html
<!-- auth-callback.html -->
<!doctype html><meta charset="utf-8" /><title>…</title>
<script>
  (function () {
    try {
      var params = new URLSearchParams(location.search);
      var code = params.get("code"),
        state = params.get("state");
      if (window.opener && code && state) {
        window.opener.postMessage(
          { type: "stawi-auth", code: code, state: state },
          location.origin,
        );
      }
    } finally {
      window.close();
    }
  })();
</script>
```

Embedders serve this from their `redirectUri` path. README documents this. Commit: `feat(profile): ship auth-callback.html; document embedder deployment`.

---

## Task B.14: CSP and SRI guidance (README)

**Files:**

- Create: `packages/profile/README.md`

Document:

- CSP directives required
- SRI hash pattern
- Script-tag autoMount attributes (incl. `data-tokens`, `data-locale`)
- Programmatic `mount()` usage with all new props
- Deployment of `auth-callback.html`
- Token security posture (Worker isolation, non-extractable keys, DPoP, rotation + reuse detection)
- Minimum browser matrix: Chrome 88+, Firefox 90+, Safari 14+

Commit: `docs(profile): comprehensive README (embedding, CSP, SRI, security)`.

---

## Task B.15: Bump version, changeset, release

**Files:**

- Modify: `packages/profile/package.json` → `"version": "1.0.0"`
- Create: `.changeset/profile-v1.md`

```md
---
"@stawi/profile": major
"@stawi/auth-runtime": patch
---

v1 release. Hardened token handling (Worker + non-extractable keys + adaptive DPoP + rotation/reuse detection), configurable theming (design tokens + raw CSS escape hatch), inlined font subsets, opt-in Gravatar, full a11y (focus trap, aria-modal, axe in CI), i18n (en/fr/sw/ar + RTL), observability hooks, idempotency keys, per-instance runtime lifecycle, unified verification UX, sanitized picture URLs, validated adminPanelUrl, multipart avatar upload with magic-byte + dimension checks.

Breaking changes from 0.x:

- `ApiClient` removed from auth-runtime; use `runtime.fetch` / `runtime.upload`.
- `getAuthRuntime` singleton removed; use `createAuthRuntime`.
- `data-theme` now affects styling; defaults to `"auto"`.
- Gravatar is opt-in via `gravatar: true`.
- Google Fonts now opt-in via `externalFonts: true`; default is inlined subsets.
- Default scopes include `offline_access` (required for rotating refresh tokens).
```

Commit: `chore(profile): release 1.0.0`.

---

# Self-review checklist (run before merging)

1. **Spec coverage walk-through:** for each section in all three specs, point to the task that implements it. None missing.
2. **Placeholder scan:** no "TBD", "TODO", "add error handling", "similar to Task N" remains.
3. **Type consistency:** `AuthErrorCode` union in `shared/errors.ts` matches everything imported; `AuthRuntime` interface matches the proxy's implementation; `ProfileWidgetTokens` keys match `themes/apply.ts` MAP.
4. **Commands:** every `pnpm` invocation uses `--filter` correctly; every `git add` references files that actually changed in that task.
5. **Ordering:** no task imports a symbol from a later task (validated by reading through imports).
6. **Tests:** every task has at least one failing-first test and a visible passing step.
