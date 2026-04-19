import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthGate } from "../../components/AuthGate.js";
import { AuthContext, type AuthContextValue } from "../../context/auth-context.js";
import type { AuthState } from "@stawi/auth-runtime";

const mockFetch = vi.fn();
const mockUpload = vi.fn();
const mockGetClaims = vi.fn();
const mockGetRoles = vi.fn();

function mockAuthContext(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
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

function renderWithAuth(authState: AuthState, ensureAuthenticated?: () => Promise<void>) {
  // For authenticated state, mock the profile fetch
  if (authState === "authenticated") {
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

  it("shows pulsing loader when initializing", () => {
    renderWithAuth("initializing");
    const btn = screen.getByLabelText("Loading authentication");
    expect(btn).toBeTruthy();
    expect((btn as HTMLButtonElement).disabled).toBe(true);
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
