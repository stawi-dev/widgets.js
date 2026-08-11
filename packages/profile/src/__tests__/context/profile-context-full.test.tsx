import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { ProfileProvider } from "../../context/profile-context.js";
import {
  AuthContext,
  type AuthContextValue,
} from "../../context/auth-context.js";
import { useProfile } from "../../hooks/use-profile.js";
import { ContactType, ProfileType } from "../../types.js";

const mockFetch = vi.fn();
const mockUpload = vi.fn();
const mockGetClaims = vi.fn();

const mockRuntime = {
  fetch: mockFetch,
  upload: mockUpload,
  getRoles: vi.fn().mockResolvedValue([]),
  getClaims: mockGetClaims,
  ensureAuthenticated: vi.fn(),
  logout: vi.fn(),
  onAuthStateChange: vi.fn(() => () => {}),
  onSecurityEvent: vi.fn(() => () => {}),
  getState: vi.fn(() => "authenticated" as const),
  prefetchDiscovery: vi.fn(),
  destroy: vi.fn(),
  version: "test",
};

function wrapper({ children }: { children: ReactNode }) {
  const authValue: AuthContextValue = {
    authState: "authenticated",
    runtime: mockRuntime as unknown as AuthContextValue["runtime"],
    ensureAuthenticated: vi.fn(),
    logout: vi.fn(),
  };
  return (
    <AuthContext.Provider value={authValue}>
      <ProfileProvider>{children}</ProfileProvider>
    </AuthContext.Provider>
  );
}

// Initial load goes through GET /profile/public/user/info now (the
// REST endpoint that resolves the user from the JWT subject). Update
// + AddContact mutations still flow through Connect RPC and return
// the full ProfileResponse shape (data: ProfileObject), so we keep
// the proto-shaped fixture around for the mutation followup mocks.
const mockUserInfo = {
  sub: "user-1",
  name: "Jane",
  url: undefined,
  contacts: [
    {
      id: "c1",
      type: ContactType.EMAIL,
      detail: "jane@example.com",
      verified: true,
      communication_level: 0,
      state: 0,
    },
  ],
};

const mockProtoProfile = {
  data: {
    id: "user-1",
    type: ProfileType.PERSON,
    properties: { au_name: "Jane", language: "en", country: "US" },
    contacts: [
      {
        id: "c1",
        type: ContactType.EMAIL,
        detail: "jane@example.com",
        verified: true,
        communication_level: 0,
        state: 0,
      },
    ],
    addresses: [],
    state: 0,
  },
};

describe("ProfileContext - full coverage", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockUpload.mockReset();
    mockGetClaims.mockReset();
    mockGetClaims.mockResolvedValue({ sub: "user-1" });
  });

  async function renderAndLoad() {
    mockFetch.mockResolvedValueOnce(mockUserInfo);
    const hook = renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(hook.result.current.state.loading).toBe(false));
    return hook;
  }

  it("updateProfile calls RPC and updates state", async () => {
    const { result } = await renderAndLoad();
    mockFetch.mockResolvedValueOnce(undefined);

    await act(async () => {
      await result.current.updateProfile({ name: "Jane Doe" });
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/profile/profile.v1.ProfileService/Update",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result.current.state.profile?.name).toBe("Jane Doe");
  });

  it("setLanguage calls RPC and updates state", async () => {
    const { result } = await renderAndLoad();
    mockFetch.mockResolvedValueOnce(undefined);

    await act(async () => {
      await result.current.setLanguage("fr");
    });

    expect(result.current.state.profile?.language).toBe("fr");
  });

  it("setCountry calls RPC and updates state", async () => {
    const { result } = await renderAndLoad();
    mockFetch.mockResolvedValueOnce(undefined);

    await act(async () => {
      await result.current.setCountry("FR");
    });

    expect(result.current.state.profile?.country).toBe("FR");
  });

  it("addContact adds contact and sets pending verification", async () => {
    const { result } = await renderAndLoad();

    const addContactResponse = {
      data: {
        ...mockProtoProfile.data,
        contacts: [
          ...mockProtoProfile.data.contacts,
          {
            id: "c2",
            type: ContactType.MSISDN,
            detail: "+1234567890",
            verified: false,
            communication_level: 0,
            state: 0,
          },
        ],
      },
      verification_id: "v1",
    };
    mockFetch.mockResolvedValueOnce(addContactResponse);

    await act(async () => {
      await result.current.addContact("phone", "+1234567890");
    });

    expect(result.current.state.profile?.contacts.length).toBe(2);
    expect(result.current.state.pendingVerification?.contactId).toBe("c2");
    expect(result.current.state.pendingVerification?.verificationId).toBe("v1");
  });

  it("removeContact removes contact from state", async () => {
    const { result } = await renderAndLoad();
    mockFetch.mockResolvedValueOnce(undefined);

    await act(async () => {
      await result.current.removeContact("c1");
    });

    expect(result.current.state.profile?.contacts).toEqual([]);
  });

  it("sendVerification creates verification and sets pending", async () => {
    const { result } = await renderAndLoad();
    mockFetch.mockResolvedValueOnce({ id: "v2" });

    await act(async () => {
      await result.current.sendVerification("c1");
    });

    expect(result.current.state.pendingVerification).toEqual({
      contactId: "c1",
      verificationId: "v2",
    });
  });

  it("verifyContact marks contact as verified", async () => {
    const { result } = await renderAndLoad();

    // First set up pending verification
    mockFetch.mockResolvedValueOnce({ id: "v3" });
    await act(async () => {
      await result.current.sendVerification("c1");
    });

    // Now verify
    mockFetch.mockResolvedValueOnce(undefined);
    await act(async () => {
      await result.current.verifyContact("c1", "123456");
    });

    const contact = result.current.state.profile?.contacts.find(
      (c) => c.id === "c1",
    );
    expect(contact?.verified).toBe(true);
    expect(result.current.state.pendingVerification).toBeNull();
  });

  it("verifyContact does nothing without pending verification", async () => {
    const { result } = await renderAndLoad();

    await act(async () => {
      await result.current.verifyContact("c1", "123456");
    });

    // fetch should only have been called for initial load
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  it("dismissVerification clears pending", async () => {
    const { result } = await renderAndLoad();
    mockFetch.mockResolvedValueOnce({ id: "v4" });

    await act(async () => {
      await result.current.sendVerification("c1");
    });
    expect(result.current.state.pendingVerification).not.toBeNull();

    act(() => {
      result.current.dismissVerification();
    });
    expect(result.current.state.pendingVerification).toBeNull();
  });

  it("uploadAvatar uploads to files then updates profile with mxc ref", async () => {
    const { result } = await renderAndLoad();
    // 1) files REST upload
    mockFetch.mockResolvedValueOnce({
      content_uri: "mxc://files.example/media123",
    });
    // 2) profile Connect Update
    mockFetch.mockResolvedValueOnce({
      data: {
        id: "user-1",
        type: ProfileType.PERSON,
        properties: { au_avater_uri: "mxc://files.example/media123" },
        contacts: [],
        addresses: [],
        state: 0,
      },
    });

    const file = new File([new Uint8Array([1, 2, 3, 4])], "avatar.png", {
      type: "image/png",
    });
    // jsdom File may lack arrayBuffer — polyfill for the unit test.
    if (typeof file.arrayBuffer !== "function") {
      Object.defineProperty(file, "arrayBuffer", {
        value: async () => new Uint8Array([1, 2, 3, 4]).buffer,
      });
    }

    await act(async () => {
      await result.current.uploadAvatar(file);
    });

    // First post-load call is files upload; second is profile Update.
    const uploadCall = mockFetch.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("/files/v1/media/upload"),
    );
    expect(uploadCall).toBeTruthy();
    expect(uploadCall![1]).toMatchObject({ method: "POST" });

    const updateCall = mockFetch.mock.calls.find(
      (c) =>
        typeof c[0] === "string" &&
        (c[0] as string).includes("/profile/profile.v1.ProfileService/Update"),
    );
    expect(updateCall).toBeTruthy();
    expect(updateCall![1].body).toContain("au_avater_uri");
    expect(updateCall![1].body).toContain("mxc://files.example/media123");

    expect(result.current.state.profile?.picture).toBe(
      "mxc://files.example/media123",
    );
  });

  it("updateProfile is no-op when no profile loaded", async () => {
    mockFetch.mockRejectedValueOnce(new Error("load failed"));
    const hook = renderHook(() => useProfile(), { wrapper });
    await waitFor(() => expect(hook.result.current.state.loading).toBe(false));

    await act(async () => {
      await hook.result.current.updateProfile({ name: "nope" });
    });

    // Only the initial load call should have been made
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
