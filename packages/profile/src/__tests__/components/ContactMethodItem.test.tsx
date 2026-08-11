import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
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
    render(<ContactMethodItem contact={primaryContact} editing={true} />, {
      wrapper: Wrapper,
    });
    expect(screen.queryByLabelText(/Remove/)).toBeNull();
  });

  it("clicking Verify calls sendVerification and does NOT render inline code form", () => {
    const sendVerification = vi.fn().mockResolvedValue(undefined);
    const { Wrapper } = createWrapper({ sendVerification });
    render(<ContactMethodItem contact={unverifiedContact} editing={true} />, {
      wrapper: Wrapper,
    });

    fireEvent.click(screen.getByText("Verify"));
    expect(sendVerification).toHaveBeenCalledWith("c3");
    // Inline code entry form is gone – it's now handled by VerifyDialog.
    expect(screen.queryByPlaceholderText("Code")).toBeNull();
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
