import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock auth-runtime to avoid real runtime initialization
vi.mock("@stawi/auth-runtime", () => ({
  createAuthRuntime: vi.fn(() => ({
    fetch: vi.fn(),
    upload: vi.fn(),
    getRoles: vi.fn().mockResolvedValue([]),
    getClaims: vi.fn().mockResolvedValue({}),
    ensureAuthenticated: vi.fn(),
    logout: vi.fn(),
    onAuthStateChange: vi.fn((cb: (s: string) => void) => {
      cb("initializing");
      return () => {};
    }),
    onSecurityEvent: vi.fn(() => () => {}),
    getState: vi.fn(() => "initializing"),
    prefetchDiscovery: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
    version: "test",
  })),
  decodeJwtPayload: vi.fn(),
}));

import { ProfileWidgetRoot } from "../../components/ProfileWidgetRoot.js";

describe("ProfileWidgetRoot", () => {
  it("renders nothing while auth is initializing", () => {
    const { container } = render(
      <ProfileWidgetRoot installationId="test-inst" clientId="test-client" />,
    );
    // Display FSM: initializing → hidden (no login flash, no loader chrome)
    expect(container.querySelector(".aiw-signin-trigger")).toBeNull();
    expect(screen.queryByLabelText("Login")).toBeNull();
    expect(screen.queryByLabelText("Loading authentication")).toBeNull();
  });

  it("uses installationId as clientId fallback", () => {
    const { container } = render(<ProfileWidgetRoot installationId="inst-1" />);
    expect(container.querySelector(".aiw-signin-trigger")).toBeNull();
    expect(screen.queryByLabelText("Login")).toBeNull();
  });
});
