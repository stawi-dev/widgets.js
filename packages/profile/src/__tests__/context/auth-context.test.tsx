import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import { AuthProvider, AuthContext } from "../../context/auth-context.js";
import { useAuth } from "../../hooks/use-auth.js";

// Track the state change listener
let stateChangeCallback: ((s: string) => void) | null = null;
const mockRuntime = {
  getState: vi.fn(() => "initializing"),
  getApiClient: vi.fn(() => ({ fetch: vi.fn(), upload: vi.fn() })),
  onAuthStateChange: vi.fn((cb: (s: string) => void) => {
    stateChangeCallback = cb;
    cb("initializing");
    return () => {
      stateChangeCallback = null;
    };
  }),
  ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
  logout: vi.fn().mockResolvedValue(undefined),
  destroy: vi.fn(),
};

vi.mock("@stawi/auth-runtime", () => ({
  getAuthRuntime: vi.fn(() => mockRuntime),
}));

function wrapper({ children }: { children: ReactNode }) {
  return (
    <AuthProvider clientId="test" installationId="inst-1">
      {children}
    </AuthProvider>
  );
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    stateChangeCallback = null;
  });

  it("provides auth context to children", () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.authState).toBe("initializing");
    expect(result.current.runtime).toBeDefined();
    expect(typeof result.current.ensureAuthenticated).toBe("function");
    expect(typeof result.current.logout).toBe("function");
  });

  it("updates authState when runtime notifies state change", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    expect(result.current.authState).toBe("initializing");

    act(() => {
      stateChangeCallback?.("authenticated");
    });

    expect(result.current.authState).toBe("authenticated");
  });

  it("ensureAuthenticated delegates to runtime", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.ensureAuthenticated();
    });
    expect(mockRuntime.ensureAuthenticated).toHaveBeenCalled();
  });

  it("logout delegates to runtime", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });
    await act(async () => {
      await result.current.logout();
    });
    expect(mockRuntime.logout).toHaveBeenCalled();
  });

  it("cleans up state change listener on unmount", () => {
    const { unmount } = renderHook(() => useAuth(), { wrapper });
    expect(stateChangeCallback).not.toBeNull();
    unmount();
    expect(stateChangeCallback).toBeNull();
  });
});
