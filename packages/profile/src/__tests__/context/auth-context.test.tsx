import { describe, it, expect, vi } from "vitest";
import { render, act } from "@testing-library/react";
import { AuthProvider } from "../../context/auth-context.js";
import * as rt from "@stawi/auth-runtime";

describe("AuthProvider", () => {
  it("creates a fresh runtime per instance and destroys on unmount", () => {
    const destroy = vi.fn();
    const stub = {
      version: "1.0", getState: () => "unauthenticated",
      onAuthStateChange: (cb: any) => { cb("unauthenticated"); return () => {}; },
      ensureAuthenticated: vi.fn(), logout: vi.fn(), fetch: vi.fn(), upload: vi.fn(),
      getRoles: vi.fn().mockResolvedValue([]), destroy, onSecurityEvent: () => () => {},
      prefetchDiscovery: vi.fn(),
    };
    const spy = vi.spyOn(rt, "createAuthRuntime").mockReturnValue(stub as any);
    const { unmount } = render(
      <AuthProvider clientId="c" idpBaseUrl="https://i" apiBaseUrl="https://a">
        <span>x</span>
      </AuthProvider>
    );
    expect(spy).toHaveBeenCalledTimes(1);
    act(() => { unmount(); });
    expect(destroy).toHaveBeenCalledTimes(1);
  });
});
