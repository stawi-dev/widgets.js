import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { useState, useCallback } from "react";
import { ProfileCard } from "../../components/ProfileCard.js";
import {
  ProfileContext,
  type ProfileContextValue,
} from "../../context/profile-context.js";
import {
  AuthContext,
  type AuthContextValue,
} from "../../context/auth-context.js";
import type { ProfileState, ContactMethod } from "../../types.js";
import { HooksContext } from "../../context/hooks-context.js";

/**
 * A harness that models the portion of ProfileProvider behavior we need:
 * - exposes setPending / setContacts from test code
 * - wires dismissVerification / removeContact to update internal state
 *   so the reducer side-effect (clear pending on remove) is simulated.
 */
function Harness({ initialContacts, initialPending }: {
  initialContacts: ContactMethod[];
  initialPending: { contactId: string; verificationId: string } | null;
}) {
  const [pending, setPending] = useState(initialPending);
  const [contacts, setContacts] = useState(initialContacts);

  const removeContact = useCallback(async (contactId: string) => {
    setContacts((prev) => prev.filter((c) => c.id !== contactId));
    setPending((prev) => (prev?.contactId === contactId ? null : prev));
  }, []);

  const dismissVerification = useCallback(() => setPending(null), []);
  const requestVerification = useCallback(
    (contactId: string, verificationId: string) =>
      setPending({ contactId, verificationId }),
    [],
  );

  const state: ProfileState = {
    loading: false,
    error: null,
    profile: {
      id: "u1",
      name: "Test User",
      email: "test@example.com",
      contacts,
    },
    pendingVerification: pending,
  };

  const value: ProfileContextValue = {
    state,
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    setLanguage: vi.fn(),
    setCountry: vi.fn(),
    addContact: vi.fn(),
    removeContact,
    sendVerification: vi.fn(),
    verifyContact: vi.fn(),
    dismissVerification,
    requestVerification,
  };

  const authValue: AuthContextValue = {
    authState: "authenticated",
    runtime: {} as AuthContextValue["runtime"],
    ensureAuthenticated: vi.fn().mockResolvedValue(undefined),
    logout: vi.fn().mockResolvedValue(undefined),
  };

  return (
    <AuthContext.Provider value={authValue}>
      <HooksContext.Provider value={{}}>
        <ProfileContext.Provider value={value}>
          <ProfileCard />
        </ProfileContext.Provider>
      </HooksContext.Provider>
    </AuthContext.Provider>
  );
}

function renderCard(
  initialContacts: ContactMethod[],
  initialPending: { contactId: string; verificationId: string } | null,
): ReturnType<typeof render> {
  return render(
    <Harness initialContacts={initialContacts} initialPending={initialPending} />,
  );
}

describe("ProfileCard verification UX", () => {
  const contact: ContactMethod = {
    id: "c1",
    type: "email",
    value: "alice@example.com",
    verified: false,
    primary: false,
  };

  it("auto-opens the dialog when pendingVerification arrives", () => {
    renderCard([contact], { contactId: "c1", verificationId: "v1" });
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("Verify Contact")).toBeTruthy();
  });

  it("minimizing the dialog shows the banner; clicking banner reopens the dialog", () => {
    renderCard([contact], { contactId: "c1", verificationId: "v1" });

    expect(screen.getByRole("dialog")).toBeTruthy();
    // Click minimize X.
    fireEvent.click(screen.getByLabelText("Minimize"));
    // Dialog should disappear.
    expect(screen.queryByRole("dialog")).toBeNull();
    // Banner should appear.
    const enterCodeBtn = screen.getByText("Enter code");
    expect(enterCodeBtn).toBeTruthy();
    // Banner mentions the contact value (appears in contact list and in banner).
    const matches = screen.getAllByText(/alice@example\.com/);
    expect(matches.length).toBeGreaterThanOrEqual(1);

    // Click Enter code → dialog reopens.
    fireEvent.click(enterCodeBtn);
    expect(screen.getByRole("dialog")).toBeTruthy();
    // Banner should go away when dialog is reopened.
    expect(screen.queryByText("Enter code")).toBeNull();
  });

  it("backdrop click minimizes (banner appears), not cancels", () => {
    renderCard([contact], { contactId: "c1", verificationId: "v1" });
    fireEvent.click(screen.getByRole("dialog").parentElement!);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Enter code")).toBeTruthy();
  });

  it("Cancel clears pending: no banner, no dialog", () => {
    renderCard([contact], { contactId: "c1", verificationId: "v1" });
    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText("Enter code")).toBeNull();
  });

  it("removeContact clears the banner", async () => {
    renderCard([contact], { contactId: "c1", verificationId: "v1" });

    // Minimize to get to banner state.
    fireEvent.click(screen.getByLabelText("Minimize"));
    expect(screen.getByText("Enter code")).toBeTruthy();

    // Enter edit mode in ContactMethods.
    fireEvent.click(screen.getByLabelText("Edit contacts"));
    // Remove the contact.
    await act(async () => {
      fireEvent.click(screen.getByLabelText("Remove alice@example.com"));
    });
    // Banner should be gone.
    expect(screen.queryByText("Enter code")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("dismiss (× button) on the banner also clears pending", () => {
    renderCard([contact], { contactId: "c1", verificationId: "v1" });
    fireEvent.click(screen.getByLabelText("Minimize"));
    fireEvent.click(screen.getByLabelText("Dismiss verification"));
    expect(screen.queryByText("Enter code")).toBeNull();
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
