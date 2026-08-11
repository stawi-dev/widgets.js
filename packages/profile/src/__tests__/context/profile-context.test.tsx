import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ProfileProvider } from "../../context/profile-context.js";
import {
  AuthContext,
  type AuthContextValue,
} from "../../context/auth-context.js";
import { useProfile } from "../../hooks/use-profile.js";
import { ContactType } from "../../types.js";

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

// Shape returned by GET /profile/public/user/info — the REST
// endpoint the provider hits on mount. Sparser than the Connect RPC
// GetByIdResponse (no `data` wrapper, no `properties` map; fields
// are flat).
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

describe("ProfileContext", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockUpload.mockReset();
    mockGetClaims.mockReset();
    mockGetClaims.mockResolvedValue({ sub: "user-1" });
  });

  it("starts in loading state", () => {
    mockFetch.mockReturnValue(new Promise(() => {})); // Never resolves
    const { result } = renderHook(() => useProfile(), { wrapper });
    expect(result.current.state.loading).toBe(true);
  });

  it("loads the current profile via GET /profile/public/user/info", async () => {
    mockFetch.mockResolvedValueOnce(mockUserInfo);

    const { result } = renderHook(() => useProfile(), { wrapper });

    await waitFor(() => {
      expect(result.current.state.loading).toBe(false);
      expect(result.current.state.profile?.name).toBe("Jane");
      expect(result.current.state.profile?.email).toBe("jane@example.com");
    });

    // No POST, no Idempotency-Key, no preflight — just a plain GET
    // whose path matches the REST handler on service-profile that
    // resolves the user by JWT subject.
    expect(mockFetch).toHaveBeenCalledWith("/profile/public/user/info", {
      method: "GET",
    });
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
