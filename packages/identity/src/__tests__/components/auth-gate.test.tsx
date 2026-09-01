import { describe, it, expect, vi } from "vitest";
import {
  act,
  render,
  screen,
  fireEvent,
  waitFor,
} from "@testing-library/react";
import type { AuthState } from "@stawi/auth-runtime";
import { AuthGate, authDisplayMode } from "../../components/AuthGate.js";
import {
  AuthContext,
  type AuthContextValue,
} from "../../context/auth-context.js";

function renderGate(
  authState: AuthState,
  ensureAuthenticated: () => Promise<void> = vi
    .fn()
    .mockResolvedValue(undefined),
) {
  const value = {
    authState,
    runtime: {} as AuthContextValue["runtime"],
    ensureAuthenticated,
    logout: vi.fn().mockResolvedValue(undefined),
  };
  return render(
    <AuthContext.Provider value={value}>
      <AuthGate>
        <div>protected</div>
      </AuthGate>
    </AuthContext.Provider>,
  );
}

describe("authDisplayMode", () => {
  it("maps runtime auth states to display modes", () => {
    expect(authDisplayMode("initializing")).toBe("hidden");
    expect(authDisplayMode("authenticated")).toBe("content");
    expect(authDisplayMode("refreshing")).toBe("content");
    expect(authDisplayMode("unauthenticated")).toBe("login");
    expect(authDisplayMode("error")).toBe("login");
  });
});

describe("AuthGate", () => {
  it("renders nothing while auth is initializing", () => {
    const { container } = renderGate("initializing");
    expect(container.innerHTML).toBe("");
  });

  it("renders children once authenticated", () => {
    renderGate("authenticated");
    expect(screen.getByText("protected")).toBeTruthy();
  });

  it("renders a login button when unauthenticated", async () => {
    const ensure = vi.fn().mockResolvedValue(undefined);
    renderGate("unauthenticated", ensure);

    const button = screen.getByRole("button", { name: "Sign in" });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(ensure).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("protected")).toBeNull();
  });

  it("shows a friendly message for a known sign-in failure", async () => {
    const ensure = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("blocked"), { code: "OAUTH_POPUP_BLOCKED" }),
      );
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    renderGate("unauthenticated", ensure);

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => {
      expect(screen.getByRole("alert").textContent).toMatch(/Pop-ups/);
    });
    spy.mockRestore();
  });

  it("stays quiet when the user closes the sign-in popup", async () => {
    const ensure = vi
      .fn()
      .mockRejectedValue(
        Object.assign(new Error("closed"), { code: "OAUTH_POPUP_CLOSED" }),
      );
    renderGate("unauthenticated", ensure);

    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(ensure).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
