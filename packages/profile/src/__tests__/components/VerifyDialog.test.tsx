import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { VerifyDialog } from "../../components/VerifyDialog.js";
import {
  ProfileContext,
  type ProfileContextValue,
} from "../../context/profile-context.js";

function createProfileWrapper(
  pending: { contactId: string; verificationId: string } | null = null,
  overrides: Partial<ProfileContextValue> = {},
) {
  const value: ProfileContextValue = {
    state: {
      loading: false,
      error: null,
      profile: { id: "u1", name: "Test", contacts: [], email: null, language: null, country: null, picture: null },
      pendingVerification: pending,
    },
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    setLanguage: vi.fn(),
    setCountry: vi.fn(),
    addContact: vi.fn(),
    removeContact: vi.fn(),
    sendVerification: vi.fn(),
    verifyContact: vi.fn().mockResolvedValue(undefined),
    dismissVerification: vi.fn(),
    ...overrides,
  };

  return {
    value,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
    ),
  };
}

describe("VerifyDialog", () => {
  it("renders nothing when no pending verification", () => {
    const { Wrapper } = createProfileWrapper(null);
    const { container } = render(<VerifyDialog />, { wrapper: Wrapper });
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog when pending verification exists", () => {
    const { Wrapper } = createProfileWrapper({ contactId: "c1", verificationId: "v1" });
    render(<VerifyDialog />, { wrapper: Wrapper });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Verify Contact")).toBeTruthy();
  });

  it("submits verification code", async () => {
    const verifyContact = vi.fn().mockResolvedValue(undefined);
    const { Wrapper } = createProfileWrapper(
      { contactId: "c1", verificationId: "v1" },
      { verifyContact },
    );
    render(<VerifyDialog />, { wrapper: Wrapper });

    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "123456" } });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    await waitFor(() => {
      expect(verifyContact).toHaveBeenCalledWith("c1", "123456");
    });
  });

  it("does not submit empty code", async () => {
    const verifyContact = vi.fn();
    const { Wrapper } = createProfileWrapper(
      { contactId: "c1", verificationId: "v1" },
      { verifyContact },
    );
    render(<VerifyDialog />, { wrapper: Wrapper });

    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(verifyContact).not.toHaveBeenCalled();
  });

  it("calls dismissVerification on cancel", () => {
    const dismissVerification = vi.fn();
    const { Wrapper } = createProfileWrapper(
      { contactId: "c1", verificationId: "v1" },
      { dismissVerification },
    );
    render(<VerifyDialog />, { wrapper: Wrapper });

    fireEvent.click(screen.getByText("Cancel"));
    expect(dismissVerification).toHaveBeenCalled();
  });

  it("calls dismissVerification on backdrop click", () => {
    const dismissVerification = vi.fn();
    const { Wrapper } = createProfileWrapper(
      { contactId: "c1", verificationId: "v1" },
      { dismissVerification },
    );
    render(<VerifyDialog />, { wrapper: Wrapper });

    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(dismissVerification).toHaveBeenCalled();
  });

  it("handles verification failure gracefully", async () => {
    const verifyContact = vi.fn().mockRejectedValue(new Error("bad code"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { Wrapper } = createProfileWrapper(
      { contactId: "c1", verificationId: "v1" },
      { verifyContact },
    );
    render(<VerifyDialog />, { wrapper: Wrapper });

    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "999999" } });
    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(
        "Verification failed:",
        expect.any(Error),
      );
    });
    errorSpy.mockRestore();
  });
});
