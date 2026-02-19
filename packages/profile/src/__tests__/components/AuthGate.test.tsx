import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AuthGate } from "../../components/AuthGate.js";
import { AuthContext, type AuthContextValue } from "../../context/auth-context.js";
import type { AuthState } from "@stawi/auth-runtime";

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

function mockAuthContext(overrides: Partial<AuthContextValue> = {}): AuthContextValue {
  return {
    authState: "authenticated" as AuthState,
    runtime: {
      getApiClient: () => mockApiClient,
      getAccessToken: vi.fn().mockResolvedValue(fakeJwt("user-1")),
      getRoles: vi.fn().mockResolvedValue([]),
    } as unknown as AuthContextValue["runtime"],
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
        id: "user-1",
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
