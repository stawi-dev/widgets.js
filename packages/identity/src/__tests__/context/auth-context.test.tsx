import { describe, it, expect, vi } from "vitest";
import { act, render, screen } from "@testing-library/react";
import type { AuthRuntime, AuthState } from "@stawi/auth-runtime";
import { AuthProvider } from "../../context/auth-context.js";
import { HooksContext } from "../../context/hooks-context.js";
import { useAuth } from "../../hooks/use-auth.js";

function makeRuntime() {
  const authListeners: Array<(s: AuthState) => void> = [];
  const securityListeners: Array<(e: unknown) => void> = [];
  const runtime = {
    onAuthStateChange: vi.fn((cb: (s: AuthState) => void) => {
      authListeners.push(cb);
      return () => {};
    }),
    onSecurityEvent: vi.fn((cb: (e: unknown) => void) => {
      securityListeners.push(cb);
      return () => {};
    }),
    ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  } as unknown as AuthRuntime;
  return { runtime, authListeners, securityListeners };
}

function Probe() {
  const { authState, ensureAuthenticated, logout } = useAuth();
  return (
    <div>
      <span data-testid="state">{authState}</span>
      <button type="button" onClick={() => void ensureAuthenticated()}>
        login
      </button>
      <button type="button" onClick={() => void logout()}>
        logout
      </button>
    </div>
  );
}

describe("AuthProvider", () => {
  it("publishes runtime auth state and forwards it to host hooks", () => {
    const { runtime, authListeners } = makeRuntime();
    const onAuthStateChange = vi.fn();

    render(
      <HooksContext.Provider value={{ onAuthStateChange }}>
        <AuthProvider clientId="c" runtime={runtime}>
          <Probe />
        </AuthProvider>
      </HooksContext.Provider>,
    );

    expect(screen.getByTestId("state").textContent).toBe("initializing");
    act(() => authListeners.forEach((cb) => cb("authenticated")));
    expect(screen.getByTestId("state").textContent).toBe("authenticated");
    expect(onAuthStateChange).toHaveBeenCalledWith("authenticated");
  });

  it("forwards security events to host hooks", () => {
    const { runtime, securityListeners } = makeRuntime();
    const onSecurityEvent = vi.fn();

    render(
      <HooksContext.Provider value={{ onSecurityEvent }}>
        <AuthProvider clientId="c" runtime={runtime}>
          <Probe />
        </AuthProvider>
      </HooksContext.Provider>,
    );

    const event = { type: "token_refresh_failed" };
    act(() => securityListeners.forEach((cb) => cb(event)));
    expect(onSecurityEvent).toHaveBeenCalledWith(event);
  });

  it("never destroys a runtime the host supplied", () => {
    const { runtime } = makeRuntime();
    const { unmount } = render(
      <AuthProvider clientId="c" runtime={runtime}>
        <Probe />
      </AuthProvider>,
    );

    unmount();
    expect(runtime.destroy).not.toHaveBeenCalled();
  });

  it("delegates sign-in and sign-out to the runtime", () => {
    const { runtime } = makeRuntime();
    render(
      <AuthProvider clientId="c" runtime={runtime}>
        <Probe />
      </AuthProvider>,
    );

    screen.getByRole("button", { name: "login" }).click();
    screen.getByRole("button", { name: "logout" }).click();
    expect(runtime.ensureAuthenticated).toHaveBeenCalledTimes(1);
    expect(runtime.logout).toHaveBeenCalledWith({ redirectToIdP: true });
  });
});
