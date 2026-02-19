import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AvatarEditor } from "../../components/AvatarEditor.js";
import { ProfileContext, type ProfileContextValue } from "../../context/profile-context.js";
import type { ProfileState } from "../../types.js";

function makeState(overrides: Partial<ProfileState["profile"] & object> = {}): ProfileState {
  return {
    loading: false,
    error: null,
    profile: {
      id: "1",
      name: "Jane Doe",
      email: "jane@example.com",
      contacts: [],
      ...overrides,
    },
    pendingVerification: null,
  };
}

function renderAvatar(state?: ProfileState) {
  const ctx: ProfileContextValue = {
    state: state ?? makeState(),
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    setLanguage: vi.fn(),
    setCountry: vi.fn(),
    addContact: vi.fn(),
    removeContact: vi.fn(),
    sendVerification: vi.fn(),
    verifyContact: vi.fn(),
    dismissVerification: vi.fn(),
  };

  return render(
    <ProfileContext.Provider value={ctx}>
      <AvatarEditor />
    </ProfileContext.Provider>,
  );
}

describe("AvatarEditor", () => {
  it("renders initials when no picture and gravatar not yet loaded", () => {
    renderAvatar();
    expect(screen.getByText("JD")).toBeTruthy();
  });

  it("renders gravatar image when no picture is set", async () => {
    renderAvatar();

    await waitFor(() => {
      const img = document.querySelector(".aiw-avatar-large img");
      expect(img).toBeTruthy();
      expect(img?.getAttribute("src")).toContain("gravatar.com/avatar/");
    });
  });

  it("renders profile picture when set (not gravatar)", () => {
    renderAvatar(makeState({ picture: "https://example.com/photo.jpg" }));

    const img = document.querySelector(".aiw-avatar-large img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("https://example.com/photo.jpg");
  });

  it("has a file input for avatar upload", () => {
    renderAvatar();
    const input = document.querySelector('input[type="file"]');
    expect(input).toBeTruthy();
    expect(input?.getAttribute("accept")).toBe("image/*");
  });
});
