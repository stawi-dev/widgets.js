import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ProfilePopover } from "../../components/ProfilePopover.js";
import {
  ProfileContext,
  type ProfileContextValue,
} from "../../context/profile-context.js";
import {
  AuthContext,
  type AuthContextValue,
} from "../../context/auth-context.js";
import type { ProfileState } from "../../types.js";

const mockProfile: ProfileState = {
  loading: false,
  error: null,
  profile: {
    id: "1",
    name: "Jane Doe",
    email: "jane@example.com",
    contacts: [],
  },
  pendingVerification: null,
};

function mockProfileContext(
  overrides: Partial<ProfileContextValue> = {},
): ProfileContextValue {
  return {
    state: mockProfile,
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    setLanguage: vi.fn(),
    setCountry: vi.fn(),
    addContact: vi.fn(),
    removeContact: vi.fn(),
    sendVerification: vi.fn(),
    verifyContact: vi.fn(),
    dismissVerification: vi.fn(),
    ...overrides,
  };
}

function mockAuthContext(): AuthContextValue {
  return {
    authState: "authenticated",
    runtime: {} as AuthContextValue["runtime"],
    ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  };
}

function renderPopover() {
  return render(
    <AuthContext.Provider value={mockAuthContext()}>
      <ProfileContext.Provider value={mockProfileContext()}>
        <ProfilePopover />
      </ProfileContext.Provider>
    </AuthContext.Provider>,
  );
}

describe("ProfilePopover", () => {
  it("renders trigger button with initials or gravatar", async () => {
    renderPopover();
    expect(screen.getByLabelText("Open profile menu")).toBeTruthy();

    // Initially shows initials, then switches to gravatar img
    await waitFor(() => {
      const trigger = screen.getByLabelText("Open profile menu");
      const img = trigger.querySelector("img");
      const initials = trigger.querySelector(".aiw-trigger-initials");
      // Either gravatar img or initials should be present
      expect(img || initials).toBeTruthy();
    });
  });

  it("opens popover on click", () => {
    renderPopover();

    const trigger = screen.getByLabelText("Open profile menu");
    fireEvent.click(trigger);

    expect(screen.getByText("Jane Doe")).toBeTruthy();
    expect(screen.getByText("jane@example.com")).toBeTruthy();
  });
});
