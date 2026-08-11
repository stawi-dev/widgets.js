import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useApi } from "../../hooks/use-api.js";
import {
  AuthContext,
  type AuthContextValue,
} from "../../context/auth-context.js";

const mockRuntime = {
  fetch: vi.fn(),
  upload: vi.fn(),
  getRoles: vi.fn(),
  getClaims: vi.fn(),
  ensureAuthenticated: vi.fn(),
  logout: vi.fn(),
  onAuthStateChange: vi.fn(() => () => {}),
  onSecurityEvent: vi.fn(() => () => {}),
  getState: vi.fn(),
  prefetchDiscovery: vi.fn(),
  destroy: vi.fn(),
  version: "test",
};

function wrapper({ children }: { children: ReactNode }) {
  const value: AuthContextValue = {
    authState: "authenticated",
    runtime: mockRuntime as unknown as AuthContextValue["runtime"],
    ensureAuthenticated: vi.fn(),
    logout: vi.fn(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

describe("useApi", () => {
  it("returns the AuthRuntime from context", () => {
    const { result } = renderHook(() => useApi(), { wrapper });
    expect(result.current).toBe(mockRuntime);
  });
});
