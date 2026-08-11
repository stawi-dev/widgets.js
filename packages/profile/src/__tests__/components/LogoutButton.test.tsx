import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { LogoutButton } from "../../components/LogoutButton.js";
import {
  AuthContext,
  type AuthContextValue,
} from "../../context/auth-context.js";

function renderLogout(onLogout?: () => void) {
  const mockLogout = vi.fn().mockResolvedValue(undefined);
  const ctx: AuthContextValue = {
    authState: "authenticated",
    runtime: {} as AuthContextValue["runtime"],
    ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
    logout: mockLogout,
  };

  const result = render(
    <AuthContext.Provider value={ctx}>
      <LogoutButton onLogout={onLogout} />
    </AuthContext.Provider>,
  );

  return { ...result, mockLogout };
}

describe("LogoutButton", () => {
  it("renders sign out button", () => {
    renderLogout();
    expect(screen.getByText("Sign Out")).toBeTruthy();
  });

  it("calls logout on click", async () => {
    const { mockLogout } = renderLogout();
    fireEvent.click(screen.getByText("Sign Out"));
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
    });
  });

  it("calls onLogout callback after logout", async () => {
    const onLogout = vi.fn();
    const { mockLogout } = renderLogout(onLogout);
    fireEvent.click(screen.getByText("Sign Out"));
    await waitFor(() => {
      expect(mockLogout).toHaveBeenCalled();
      expect(onLogout).toHaveBeenCalled();
    });
  });
});
