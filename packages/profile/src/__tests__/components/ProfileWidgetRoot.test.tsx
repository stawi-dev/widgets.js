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
  it("renders without crashing", () => {
    render(
      <ProfileWidgetRoot
        installationId="test-inst"
        clientId="test-client"
      />,
    );
    // In initializing state, shows the loading button
    expect(screen.getByLabelText("Loading authentication")).toBeTruthy();
  });

  it("uses installationId as clientId fallback", () => {
    render(<ProfileWidgetRoot installationId="inst-1" />);
    expect(screen.getByLabelText("Loading authentication")).toBeTruthy();
  });
});
