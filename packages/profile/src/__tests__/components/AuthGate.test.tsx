import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthGate, authDisplayMode } from "../../components/AuthGate.js";
import {
  AuthContext,
  type AuthContextValue,
} from "../../context/auth-context.js";
import type { AuthState } from "@stawi/auth-runtime";

const mockFetch = vi.fn();
const mockUpload = vi.fn();
const mockGetClaims = vi.fn();
const mockGetRoles = vi.fn();

function mockAuthContext(
  overrides: Partial<AuthContextValue> = {},
): AuthContextValue {
  const runtime = {
    fetch: mockFetch,
    upload: mockUpload,
    getRoles: mockGetRoles,
    getClaims: mockGetClaims,
    ensureAuthenticated: vi.fn(),
    logout: vi.fn(),
    onAuthStateChange: vi.fn(() => () => {}),
    onSecurityEvent: vi.fn(() => () => {}),
    getState: vi.fn(() => "authenticated" as const),
    prefetchDiscovery: vi.fn(),
    destroy: vi.fn(),
    version: "test",
  } as unknown as AuthContextValue["runtime"];

  return {
    authState: "authenticated" as AuthState,
    runtime,
    ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function renderWithAuth(
  authState: AuthState,
  ensureAuthenticated?: () => Promise<void>,
) {
  // Profile chrome is shown for authenticated and refreshing — both need
  // a successful profile fetch so ProfileProvider can settle.
  if (authState === "authenticated" || authState === "refreshing") {
    mockFetch.mockResolvedValueOnce({
      data: {
        id: "profile-id-1",
        type: 0,
        properties: { au_name: "Test" },
        contacts: [],
        addresses: [],
        state: 0,
      },
    });
  }

  return render(
    <AuthContext.Provider
      value={mockAuthContext({
        authState,
        ...(ensureAuthenticated ? { ensureAuthenticated } : {}),
      })}
    >
      <AuthGate />
    </AuthContext.Provider>,
  );
}

describe("authDisplayMode", () => {
  it("maps auth runtime states to display modes", () => {
    expect(authDisplayMode("initializing")).toBe("hidden");
    expect(authDisplayMode("authenticated")).toBe("profile");
    expect(authDisplayMode("refreshing")).toBe("profile");
    expect(authDisplayMode("unauthenticated")).toBe("login");
    expect(authDisplayMode("error")).toBe("login");
  });
});

describe("AuthGate", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    mockUpload.mockReset();
    mockGetClaims.mockReset();
    mockGetRoles.mockReset();
    mockGetClaims.mockResolvedValue({ sub: "profile-id-1" });
    mockGetRoles.mockResolvedValue([]);
  });

  it("shows profile popover when authenticated", () => {
    renderWithAuth("authenticated");
    expect(screen.getByLabelText("Open profile menu")).toBeTruthy();
  });

  it("keeps profile chrome visible while refreshing tokens", () => {
    renderWithAuth("refreshing");
    expect(screen.getByLabelText("Open profile menu")).toBeTruthy();
    expect(screen.queryByLabelText("Login")).toBeNull();
  });

  it("renders nothing while initializing", () => {
    const { container } = renderWithAuth("initializing");
    expect(container.firstChild).toBeNull();
    expect(screen.queryByLabelText("Login")).toBeNull();
    expect(screen.queryByLabelText("Loading authentication")).toBeNull();
    expect(screen.queryByLabelText("Open profile menu")).toBeNull();
  });

  it("shows sign-in button when unauthenticated", () => {
    renderWithAuth("unauthenticated");
    expect(screen.getByLabelText("Login")).toBeTruthy();
  });

  it("shows sign-in button when error", () => {
    renderWithAuth("error");
    expect(screen.getByLabelText("Login")).toBeTruthy();
  });

  it("calls ensureAuthenticated when sign-in button is clicked", () => {
    const ensureAuthenticated = vi.fn().mockResolvedValue(undefined);
    renderWithAuth("unauthenticated", ensureAuthenticated);

    fireEvent.click(screen.getByLabelText("Login"));
    expect(ensureAuthenticated).toHaveBeenCalled();
  });
});
