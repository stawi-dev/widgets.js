import { describe, it, expect, vi } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { useRoles } from "../../hooks/use-roles.js";
import { AuthContext, type AuthContextValue } from "../../context/auth-context.js";
import type { AuthState } from "@stawi/auth-runtime";

function createWrapper(authState: AuthState, roles: string[] = []) {
  return function Wrapper({ children }: { children: ReactNode }) {
    const runtime = {
      fetch: vi.fn(),
      upload: vi.fn(),
      getRoles: vi.fn().mockResolvedValue(roles),
      getClaims: vi.fn().mockResolvedValue({}),
      ensureAuthenticated: vi.fn(),
      logout: vi.fn(),
      onAuthStateChange: vi.fn(() => () => {}),
      onSecurityEvent: vi.fn(() => () => {}),
      getState: vi.fn(() => authState),
      prefetchDiscovery: vi.fn(),
      destroy: vi.fn(),
      version: "test",
    } as unknown as AuthContextValue["runtime"];

    const value: AuthContextValue = {
      authState,
      runtime,
      ensureAuthenticated: vi.fn(),
      logout: vi.fn(),
    };
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  };
}

describe("useRoles", () => {
  it("returns empty array when not authenticated", () => {
    const { result } = renderHook(() => useRoles(), {
      wrapper: createWrapper("unauthenticated"),
    });
    expect(result.current).toEqual([]);
  });

  it("fetches roles when authenticated", async () => {
    const { result } = renderHook(() => useRoles(), {
      wrapper: createWrapper("authenticated", ["admin", "user"]),
    });

    await waitFor(() => {
      expect(result.current).toEqual(["admin", "user"]);
    });
  });

  it("resets roles when auth state changes to unauthenticated", () => {
    const { result, rerender } = renderHook(() => useRoles(), {
      wrapper: createWrapper("unauthenticated"),
    });

    rerender();
    expect(result.current).toEqual([]);
  });
});
