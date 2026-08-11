import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ContactMethods } from "../../components/ContactMethods.js";
import {
  ProfileContext,
  type ProfileContextValue,
} from "../../context/profile-context.js";
import type { ProfileState } from "../../types.js";

const mockState: ProfileState = {
  loading: false,
  error: null,
  profile: {
    id: "1",
    name: "Jane Doe",
    email: "jane@example.com",
    contacts: [
      {
        id: "c1",
        type: "email",
        value: "jane@example.com",
        verified: true,
        primary: true,
      },
      {
        id: "c2",
        type: "phone",
        value: "+254700000000",
        verified: false,
        primary: false,
      },
    ],
  },
  pendingVerification: null,
};

function renderContacts(overrides: Partial<ProfileContextValue> = {}) {
  const ctx: ProfileContextValue = {
    state: mockState,
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    setLanguage: vi.fn(),
    setCountry: vi.fn(),
    addContact: vi.fn().mockResolvedValue(undefined),
    removeContact: vi.fn().mockResolvedValue(undefined),
    sendVerification: vi.fn().mockResolvedValue(undefined),
    verifyContact: vi.fn().mockResolvedValue(undefined),
    dismissVerification: vi.fn(),
    ...overrides,
  };

  return render(
    <ProfileContext.Provider value={ctx}>
      <ContactMethods />
    </ProfileContext.Provider>,
  );
}

function enterEditMode() {
  fireEvent.click(screen.getByLabelText("Edit contacts"));
}

describe("ContactMethods", () => {
  it("renders contact list in clean view (no badges)", () => {
    renderContacts();
    expect(screen.getByText("jane@example.com")).toBeTruthy();
    expect(screen.getByText("+254700000000")).toBeTruthy();
    expect(screen.queryByText("Primary")).toBeNull();
    expect(screen.queryByText("Verify")).toBeNull();
    expect(screen.queryByText("+ Add Contact")).toBeNull();
  });

  it("shows edit pen icon button", () => {
    renderContacts();
    expect(screen.getByLabelText("Edit contacts")).toBeTruthy();
  });

  it("shows badges and actions after clicking edit", () => {
    renderContacts();
    enterEditMode();
    expect(screen.getByText("Primary")).toBeTruthy();
    expect(screen.getByText("Verify")).toBeTruthy();
    expect(screen.getByText("+ Add Contact")).toBeTruthy();
  });

  it("shows input when add contact is clicked in edit mode", () => {
    renderContacts();
    enterEditMode();
    fireEvent.click(screen.getByText("+ Add Contact"));
    expect(
      screen.getByPlaceholderText("email@example.com or +254..."),
    ).toBeTruthy();
  });

  it("hides add form when exiting edit mode", () => {
    renderContacts();
    enterEditMode();
    fireEvent.click(screen.getByText("+ Add Contact"));
    expect(
      screen.getByPlaceholderText("email@example.com or +254..."),
    ).toBeTruthy();
    // Click pen again to exit edit mode
    fireEvent.click(screen.getByLabelText("Done editing"));
    expect(
      screen.queryByPlaceholderText("email@example.com or +254..."),
    ).toBeNull();
    expect(screen.queryByText("+ Add Contact")).toBeNull();
  });
});
