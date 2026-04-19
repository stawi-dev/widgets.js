import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { ReactNode } from "react";
import { VerifyBanner } from "../../components/VerifyBanner.js";
import {
  ProfileContext,
  type ProfileContextValue,
} from "../../context/profile-context.js";

function createWrapper(
  pending: { contactId: string; verificationId: string } | null,
  overrides: Partial<ProfileContextValue> = {},
) {
  const value: ProfileContextValue = {
    state: {
      loading: false,
      error: null,
      profile: {
        id: "u1",
        name: "Test",
        email: "test@example.com",
        contacts: [
          { id: "c1", type: "email", value: "alice@example.com", verified: false, primary: false },
        ],
      },
      pendingVerification: pending,
    },
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    setLanguage: vi.fn(),
    setCountry: vi.fn(),
    addContact: vi.fn(),
    removeContact: vi.fn().mockResolvedValue(undefined),
    sendVerification: vi.fn(),
    verifyContact: vi.fn(),
    dismissVerification: vi.fn(),
    requestVerification: vi.fn(),
    ...overrides,
  };

  return {
    value,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
    ),
  };
}

describe("VerifyBanner", () => {
  it("renders nothing when no pending verification", () => {
    const { Wrapper } = createWrapper(null);
    const { container } = render(<VerifyBanner onEnterCode={vi.fn()} />, {
      wrapper: Wrapper,
    });
    expect(container.innerHTML).toBe("");
  });

  it("renders contact value from state when pending is set", () => {
    const { Wrapper } = createWrapper({ contactId: "c1", verificationId: "v1" });
    render(<VerifyBanner onEnterCode={vi.fn()} />, { wrapper: Wrapper });
    expect(screen.getByText(/Verify/)).toBeTruthy();
    expect(screen.getByText(/alice@example\.com/)).toBeTruthy();
  });

  it("fires onEnterCode when 'Enter code' button clicked", () => {
    const onEnterCode = vi.fn();
    const { Wrapper } = createWrapper({ contactId: "c1", verificationId: "v1" });
    render(<VerifyBanner onEnterCode={onEnterCode} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("Enter code"));
    expect(onEnterCode).toHaveBeenCalled();
  });

  it("fires dismissVerification when the ✕ dismiss button clicked", () => {
    const dismissVerification = vi.fn();
    const { Wrapper } = createWrapper(
      { contactId: "c1", verificationId: "v1" },
      { dismissVerification },
    );
    render(<VerifyBanner onEnterCode={vi.fn()} />, { wrapper: Wrapper });

    fireEvent.click(screen.getByLabelText("Dismiss verification"));
    expect(dismissVerification).toHaveBeenCalled();
  });
});
