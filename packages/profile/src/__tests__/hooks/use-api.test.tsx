import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { useApi } from "../../hooks/use-api.js";
import { AuthContext, type AuthContextValue } from "../../context/auth-context.js";

const mockApiClient = { fetch: vi.fn(), upload: vi.fn() };

function wrapper({ children }: { children: ReactNode }) {
  const value: AuthContextValue = {
    authState: "authenticated",
    runtime: {
      getApiClient: () => mockApiClient,
    } as unknown as AuthContextValue["runtime"],
    ensureAuthenticated: vi.fn(),
    logout: vi.fn(),
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

describe("useApi", () => {
  it("returns the ApiClient from runtime", () => {
    const { result } = renderHook(() => useApi(), { wrapper });
    expect(result.current).toBe(mockApiClient);
  });
});
