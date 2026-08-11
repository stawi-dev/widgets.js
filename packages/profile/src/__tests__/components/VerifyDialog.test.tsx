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
      profile: {
        id: "u1",
        name: "Test",
        contacts: [
          {
            id: "c1",
            type: "email",
            value: "a@b.com",
            verified: false,
            primary: false,
          },
        ],
        email: undefined,
        language: undefined,
        country: undefined,
        picture: undefined,
      },
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
    requestVerification: vi.fn(),
    ...overrides,
  };

  return {
    value,
    Wrapper: ({ children }: { children: ReactNode }) => (
      <ProfileContext.Provider value={value}>
        {children}
      </ProfileContext.Provider>
    ),
  };
}

describe("VerifyDialog", () => {
  it("renders nothing when no pending verification", () => {
    const { Wrapper } = createProfileWrapper(null);
    const { container } = render(<VerifyDialog open={true} />, {
      wrapper: Wrapper,
    });
    expect(container.innerHTML).toBe("");
  });

  it("renders nothing when open=false even with pending verification", () => {
    const { Wrapper } = createProfileWrapper({
      contactId: "c1",
      verificationId: "v1",
    });
    const { container } = render(<VerifyDialog open={false} />, {
      wrapper: Wrapper,
    });
    expect(container.innerHTML).toBe("");
  });

  it("renders dialog when open and pending verification exists", () => {
    const { Wrapper } = createProfileWrapper({
      contactId: "c1",
      verificationId: "v1",
    });
    render(<VerifyDialog open={true} />, { wrapper: Wrapper });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Verify Contact")).toBeTruthy();
    expect(screen.getByRole("dialog").getAttribute("aria-modal")).toBe("true");
  });

  it("submits verification code", async () => {
    const verifyContact = vi.fn().mockResolvedValue(undefined);
    const { Wrapper } = createProfileWrapper(
      { contactId: "c1", verificationId: "v1" },
      { verifyContact },
    );
    render(<VerifyDialog open={true} />, { wrapper: Wrapper });

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
    render(<VerifyDialog open={true} />, { wrapper: Wrapper });

    fireEvent.submit(screen.getByRole("dialog").querySelector("form")!);
    expect(verifyContact).not.toHaveBeenCalled();
  });

  it("Cancel clears pending verification (dismissVerification)", () => {
    const dismissVerification = vi.fn();
    const onMinimize = vi.fn();
    const { Wrapper } = createProfileWrapper(
      { contactId: "c1", verificationId: "v1" },
      { dismissVerification },
    );
    render(<VerifyDialog open={true} onMinimize={onMinimize} />, {
      wrapper: Wrapper,
    });

    fireEvent.click(screen.getByText("Cancel"));
    expect(dismissVerification).toHaveBeenCalled();
    expect(onMinimize).not.toHaveBeenCalled();
  });

  it("Minimize X button keeps pending but calls onMinimize", () => {
    const dismissVerification = vi.fn();
    const onMinimize = vi.fn();
    const { Wrapper } = createProfileWrapper(
      { contactId: "c1", verificationId: "v1" },
      { dismissVerification },
    );
    render(<VerifyDialog open={true} onMinimize={onMinimize} />, {
      wrapper: Wrapper,
    });

    fireEvent.click(screen.getByLabelText("Minimize"));
    expect(onMinimize).toHaveBeenCalled();
    expect(dismissVerification).not.toHaveBeenCalled();
  });

  it("Backdrop click minimizes (does not clear pending)", () => {
    const dismissVerification = vi.fn();
    const onMinimize = vi.fn();
    const { Wrapper } = createProfileWrapper(
      { contactId: "c1", verificationId: "v1" },
      { dismissVerification },
    );
    render(<VerifyDialog open={true} onMinimize={onMinimize} />, {
      wrapper: Wrapper,
    });

    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(onMinimize).toHaveBeenCalled();
    expect(dismissVerification).not.toHaveBeenCalled();
  });

  it("handles verification failure gracefully", async () => {
    const verifyContact = vi.fn().mockRejectedValue(new Error("bad code"));
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { Wrapper } = createProfileWrapper(
      { contactId: "c1", verificationId: "v1" },
      { verifyContact },
    );
    render(<VerifyDialog open={true} />, { wrapper: Wrapper });

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

  it("Tab key stays inside dialog (focus trap)", () => {
    const { Wrapper } = createProfileWrapper({
      contactId: "c1",
      verificationId: "v1",
    });
    render(<VerifyDialog open={true} />, { wrapper: Wrapper });

    const dialog = screen.getByRole("dialog");
    // Type a valid code so the Verify submit button is enabled and included
    // in the tab order.
    const input = screen.getByPlaceholderText("000000");
    fireEvent.change(input, { target: { value: "123456" } });

    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        "button:not([disabled]), input:not([disabled])",
      ),
    );
    expect(focusables.length).toBeGreaterThanOrEqual(3);
    const first = focusables[0]!;
    const last = focusables[focusables.length - 1]!;

    // Focus on last, press Tab → should wrap to first.
    last.focus();
    fireEvent.keyDown(dialog, { key: "Tab" });
    expect(document.activeElement).toBe(first);

    // Focus on first, press Shift+Tab → should wrap to last.
    first.focus();
    fireEvent.keyDown(dialog, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });
});
