import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ProfileProvider } from "../../context/profile-context.js";
import { AuthContext, type AuthContextValue } from "../../context/auth-context.js";
import { useProfile } from "../../hooks/use-profile.js";
import { ContactType, ProfileType } from "../../types.js";

// Build a minimal JWT with a `sub` claim
function fakeJwt(sub: string): string {
  const header = btoa(JSON.stringify({ alg: "none" }));
  const payload = btoa(JSON.stringify({ sub }));
  return `${header}.${payload}.sig`;
}

const mockFetch = vi.fn();
const mockApiClient = {
  fetch: mockFetch,
  upload: vi.fn(),
};

const mockRuntime = {
  getApiClient: () => mockApiClient,
  getState: () => "authenticated" as const,
  ensureAuthenticated: vi.fn(),
  getAccessToken: vi.fn().mockResolvedValue(fakeJwt("user-1")),
  getUser: vi.fn(),
  getRoles: vi.fn().mockResolvedValue([]),
  logout: vi.fn(),
  onAuthStateChange: vi.fn(() => () => {}),
  destroy: vi.fn(),
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

const mockProtoProfile = {
  data: {
    id: "user-1",
    type: ProfileType.PERSON,
    properties: {
      au_name: "Jane",
      language: "en",
    },
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

describe("ProfileContext", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockRuntime.getAccessToken.mockResolvedValue(fakeJwt("user-1"));
  });

  it("starts in loading state", () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // Never resolves
    const { result } = renderHook(() => useProfile(), { wrapper });
    expect(result.current.state.loading).toBe(true);
  });

  it("loads profile via ConnectRPC GetById", async () => {
    mockFetch.mockResolvedValueOnce(mockProtoProfile);

    const { result } = renderHook(() => useProfile(), { wrapper });

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
      expect(result.current.state.profile?.name).toBe("Jane");
      expect(result.current.state.profile?.email).toBe("jane@example.com");
    });

    expect(mockFetch).toHaveBeenCalledWith(
      "/profile.v1.ProfileService/GetById",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ id: "user-1" }),
      }),
    );
  });

  it("handles API error", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const { result } = renderHook(() => useProfile(), { wrapper });

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
      expect(result.current.state.error).toBe("Network error");
    });
  });
});
