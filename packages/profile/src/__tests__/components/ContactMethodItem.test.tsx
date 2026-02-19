import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { ContactMethodItem } from "../../components/ContactMethodItem.js";
import {
  ProfileContext,
  type ProfileContextValue,
} from "../../context/profile-context.js";
import type { ContactMethod } from "../../types.js";

function createWrapper(overrides: Partial<ProfileContextValue> = {}) {
  const value: ProfileContextValue = {
    state: {
      loading: false,
      error: null,
      profile: null,
      pendingVerification: null,
    },
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    setLanguage: vi.fn(),
    setCountry: vi.fn(),
    addContact: vi.fn(),
    removeContact: vi.fn().mockResolvedValue(undefined),
    sendVerification: vi.fn().mockResolvedValue(undefined),
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

const emailContact: ContactMethod = {
  id: "c1",
  type: "email",
  value: "test@example.com",
  verified: true,
  primary: false,
};

const primaryContact: ContactMethod = {
  id: "c2",
  type: "email",
  value: "primary@example.com",
  verified: true,
  primary: true,
};

const unverifiedContact: ContactMethod = {
  id: "c3",
  type: "phone",
  value: "+1234567890",
  verified: false,
  primary: false,
};

describe("ContactMethodItem", () => {
  it("renders contact value", () => {
    const { Wrapper } = createWrapper();
    render(<ContactMethodItem contact={emailContact} editing={false} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByText("test@example.com")).toBeTruthy();
  });

  it("shows badges in edit mode", () => {
    const { Wrapper } = createWrapper();
    render(<ContactMethodItem contact={primaryContact} editing={true} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByText("Primary")).toBeTruthy();
    expect(screen.getByText("Verified")).toBeTruthy();
  });

  it("shows verify button for unverified contacts in edit mode", () => {
    const { Wrapper } = createWrapper();
    render(<ContactMethodItem contact={unverifiedContact} editing={true} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByText("Verify")).toBeTruthy();
  });

  it("does not show delete button for primary contacts", () => {
    const { Wrapper } = createWrapper();
    render(<ContactMethodItem contact={primaryContact} editing={true} />, {
      wrapper: Wrapper,
    });
    expect(screen.queryByLabelText(/Remove/)).toBeNull();
  });

  it("shows delete button for non-primary contacts", () => {
    const { Wrapper } = createWrapper();
    render(<ContactMethodItem contact={emailContact} editing={true} />, {
      wrapper: Wrapper,
    });
    expect(screen.getByLabelText("Remove test@example.com")).toBeTruthy();
  });

  it("calls removeContact when delete is clicked", () => {
    const removeContact = vi.fn().mockResolvedValue(undefined);
    const { Wrapper } = createWrapper({ removeContact });
    render(<ContactMethodItem contact={emailContact} editing={true} />, {
      wrapper: Wrapper,
    });

    fireEvent.click(screen.getByLabelText("Remove test@example.com"));
    expect(removeContact).toHaveBeenCalledWith("c1");
  });

  it("does not delete primary contacts", () => {
    const removeContact = vi.fn();
    const { Wrapper } = createWrapper({ removeContact });
    // Render a primary contact but with delete button somehow clickable
    render(<ContactMethodItem contact={primaryContact} editing={true} />, {
      wrapper: Wrapper,
    });
    // Primary contacts don't have a delete button
    expect(screen.queryByLabelText(/Remove/)).toBeNull();
  });

  it("shows verification input when verify is clicked", () => {
    const sendVerification = vi.fn().mockResolvedValue(undefined);
    const { Wrapper } = createWrapper({ sendVerification });
    render(<ContactMethodItem contact={unverifiedContact} editing={true} />, {
      wrapper: Wrapper,
    });

    fireEvent.click(screen.getByText("Verify"));
    expect(sendVerification).toHaveBeenCalledWith("c3");
    expect(screen.getByPlaceholderText("Code")).toBeTruthy();
  });

  it("submits verification code on Enter", async () => {
    const verifyContact = vi.fn().mockResolvedValue(undefined);
    const sendVerification = vi.fn().mockResolvedValue(undefined);
    const { Wrapper } = createWrapper({ verifyContact, sendVerification });
    render(<ContactMethodItem contact={unverifiedContact} editing={true} />, {
      wrapper: Wrapper,
    });

    fireEvent.click(screen.getByText("Verify"));
    const input = screen.getByPlaceholderText("Code");
    fireEvent.change(input, { target: { value: "123456" } });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(verifyContact).toHaveBeenCalledWith("c3", "123456");
    });
  });

  it("cancels verification on Escape", () => {
    const sendVerification = vi.fn().mockResolvedValue(undefined);
    const { Wrapper } = createWrapper({ sendVerification });
    render(<ContactMethodItem contact={unverifiedContact} editing={true} />, {
      wrapper: Wrapper,
    });

    fireEvent.click(screen.getByText("Verify"));
    const input = screen.getByPlaceholderText("Code");
    fireEvent.keyDown(input, { key: "Escape" });

    // Input should be gone after cancel
    expect(screen.queryByPlaceholderText("Code")).toBeNull();
  });

  it("cancels verification on Cancel button click", () => {
    const sendVerification = vi.fn().mockResolvedValue(undefined);
    const { Wrapper } = createWrapper({ sendVerification });
    render(<ContactMethodItem contact={unverifiedContact} editing={true} />, {
      wrapper: Wrapper,
    });

    fireEvent.click(screen.getByText("Verify"));
    fireEvent.click(screen.getByText("Cancel"));

    expect(screen.queryByPlaceholderText("Code")).toBeNull();
  });

  it("submits code via OK button", async () => {
    const verifyContact = vi.fn().mockResolvedValue(undefined);
    const sendVerification = vi.fn().mockResolvedValue(undefined);
    const { Wrapper } = createWrapper({ verifyContact, sendVerification });
    render(<ContactMethodItem contact={unverifiedContact} editing={true} />, {
      wrapper: Wrapper,
    });

    fireEvent.click(screen.getByText("Verify"));
    const input = screen.getByPlaceholderText("Code");
    fireEvent.change(input, { target: { value: "654321" } });
    fireEvent.click(screen.getByText("OK"));

    await waitFor(() => {
      expect(verifyContact).toHaveBeenCalledWith("c3", "654321");
    });
  });

  it("handles verification failure gracefully", async () => {
    const verifyContact = vi.fn().mockRejectedValue(new Error("fail"));
    const sendVerification = vi.fn().mockResolvedValue(undefined);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { Wrapper } = createWrapper({ verifyContact, sendVerification });
    render(<ContactMethodItem contact={unverifiedContact} editing={true} />, {
      wrapper: Wrapper,
    });

    fireEvent.click(screen.getByText("Verify"));
    fireEvent.change(screen.getByPlaceholderText("Code"), {
      target: { value: "bad" },
    });
    fireEvent.click(screen.getByText("OK"));

    await waitFor(() => {
      expect(errorSpy).toHaveBeenCalled();
    });
    errorSpy.mockRestore();
  });

  it("hides edit controls when not in edit mode", () => {
    const { Wrapper } = createWrapper();
    render(<ContactMethodItem contact={unverifiedContact} editing={false} />, {
      wrapper: Wrapper,
    });
    expect(screen.queryByText("Verify")).toBeNull();
    expect(screen.queryByLabelText(/Remove/)).toBeNull();
  });
});
