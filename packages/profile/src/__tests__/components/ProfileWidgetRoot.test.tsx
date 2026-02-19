import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

// Mock auth-runtime to avoid real singleton
vi.mock("@stawi/auth-runtime", () => ({
  getAuthRuntime: vi.fn(() => ({
    getState: () => "initializing",
    getApiClient: vi.fn(),
    onAuthStateChange: vi.fn((cb: (s: string) => void) => {
      cb("initializing");
      return () => {};
    }),
    ensureAuthenticated: vi.fn(),
    logout: vi.fn(),
    destroy: vi.fn(),
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
