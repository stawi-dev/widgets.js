import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { AuthProvider, AuthContext } from "../../context/auth-context.js";
import * as rt from "@stawi/auth-runtime";
import { useContext } from "react";
import { profileAuthScopes } from "../../auth-scopes.js";

describe("AuthProvider", () => {
  it("creates a fresh runtime per instance and destroys on unmount", () => {
    const destroy = vi.fn();
    const stub = {
      version: "1.0",
      getState: () => "unauthenticated",
      onAuthStateChange: (cb: any) => {
        cb("unauthenticated");
        return () => {};
      },
      ensureAuthenticated: vi.fn(),
      logout: vi.fn(),
      fetch: vi.fn(),
      upload: vi.fn(),
      getRoles: vi.fn().mockResolvedValue([]),
      destroy,
      onSecurityEvent: () => () => {},
      prefetchDiscovery: vi.fn(),
    };
    const spy = vi.spyOn(rt, "createAuthRuntime").mockReturnValue(stub as any);
    const { unmount } = render(
      <AuthProvider clientId="c" idpBaseUrl="https://i" apiBaseUrl="https://a">
        <span>x</span>
      </AuthProvider>,
    );
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => {
      unmount();
    });
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("creates runtime with OAuth scopes allowed by the profile client", () => {
    const stub = {
      version: "1.0",
      getState: () => "unauthenticated",
      onAuthStateChange: (cb: any) => {
        cb("unauthenticated");
        return () => {};
      },
      ensureAuthenticated: vi.fn(),
      logout: vi.fn(),
      fetch: vi.fn(),
      upload: vi.fn(),
      getRoles: vi.fn().mockResolvedValue([]),
      destroy: vi.fn(),
      onSecurityEvent: () => () => {},
      prefetchDiscovery: vi.fn(),
    };
    const spy = vi.spyOn(rt, "createAuthRuntime").mockReturnValue(stub as any);

    render(
      <AuthProvider clientId="c" idpBaseUrl="https://i" apiBaseUrl="https://a">
        <span>x</span>
      </AuthProvider>,
    );

    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ scopes: [...profileAuthScopes] }),
    );
  });

  it("requests full IdP redirect logout from the runtime", async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const stub = {
      version: "1.0",
      getState: () => "authenticated",
      onAuthStateChange: (cb: any) => {
        cb("authenticated");
        return () => {};
      },
      ensureAuthenticated: vi.fn(),
      logout,
      fetch: vi.fn(),
      upload: vi.fn(),
      getRoles: vi.fn().mockResolvedValue([]),
      destroy: vi.fn(),
      onSecurityEvent: () => () => {},
      onFedcmEvent: () => () => {},
      prefetchDiscovery: vi.fn(),
    };
    vi.spyOn(rt, "createAuthRuntime").mockReturnValue(stub as any);

    function Consumer() {
      const auth = useContext(AuthContext);
      return (
        <button
          onClick={() => {
            void auth?.logout();
          }}
        >
          logout
        </button>
      );
    }

    const { getByText } = render(
      <AuthProvider clientId="c" idpBaseUrl="https://i" apiBaseUrl="https://a">
        <Consumer />
      </AuthProvider>,
    );

    await act(async () => {
      getByText("logout").click();
    });

    expect(logout).toHaveBeenCalledWith({ redirectToIdP: true });
  });
});
