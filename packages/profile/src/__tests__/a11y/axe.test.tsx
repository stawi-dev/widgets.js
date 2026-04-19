import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import axe from "axe-core";
import { ProfilePopover } from "../../components/ProfilePopover.js";
import {
  ProfileContext,
  type ProfileContextValue,
} from "../../context/profile-context.js";
import {
  AuthContext,
  type AuthContextValue,
} from "../../context/auth-context.js";
import { HooksContext } from "../../context/hooks-context.js";
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
    ],
  },
  pendingVerification: null,
};

function mockProfileContext(): ProfileContextValue {
  return {
    state: mockState,
    updateProfile: vi.fn(),
    uploadAvatar: vi.fn(),
    setLanguage: vi.fn(),
    setCountry: vi.fn(),
    addContact: vi.fn(),
    removeContact: vi.fn(),
    sendVerification: vi.fn(),
    verifyContact: vi.fn(),
    dismissVerification: vi.fn(),
    requestVerification: vi.fn(),
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

describe("ProfilePopover a11y (axe)", () => {
  it("has no axe violations introduced by our own markup", async () => {
    const { container } = render(
      <AuthContext.Provider value={mockAuthContext()}>
        <HooksContext.Provider value={{}}>
          <ProfileContext.Provider value={mockProfileContext()}>
            <ProfilePopover />
          </ProfileContext.Provider>
        </HooksContext.Provider>
      </AuthContext.Provider>,
    );

    // Open the popover so the inner dialog markup is in the tree.
    fireEvent.click(screen.getByLabelText("Open profile menu"));

    // Run axe with a conservative rule set; jsdom lacks layout so we disable
    // rules that only apply in a real browser. We still catch ARIA / label /
    // role / focus-order issues our own code could introduce.
    const result = await new Promise<axe.AxeResults>((resolve, reject) => {
      axe.run(
        container,
        {
          runOnly: {
            type: "rule",
            values: [
              "button-name",
              "aria-allowed-attr",
              "aria-required-attr",
              "aria-valid-attr",
              "aria-valid-attr-value",
              "aria-roles",
              "aria-hidden-focus",
              "duplicate-id",
              "duplicate-id-active",
              "duplicate-id-aria",
              "image-alt",
              "label",
              "link-name",
              "role-img-alt",
              "tabindex",
            ],
          },
        },
        (err, res) => {
          if (err) reject(err);
          else resolve(res);
        },
      );
    });

    // None of our rules should flag our own markup.
    expect(result.violations).toEqual([]);
  });
});

describe("VerifyDialog a11y (axe)", () => {
  it("has no axe violations when the verify dialog is open", async () => {
    const pendingState: ProfileState = {
      ...mockState,
      pendingVerification: { contactId: "c1", verificationId: "v1" },
    };
    const ctx: ProfileContextValue = {
      ...mockProfileContext(),
      state: pendingState,
    };

    const { container } = render(
      <AuthContext.Provider value={mockAuthContext()}>
        <HooksContext.Provider value={{}}>
          <ProfileContext.Provider value={ctx}>
            <ProfilePopover />
          </ProfileContext.Provider>
        </HooksContext.Provider>
      </AuthContext.Provider>,
    );
    // Open the popover so the dialog mounts beneath it.
    fireEvent.click(screen.getByLabelText("Open profile menu"));

    const result = await new Promise<axe.AxeResults>((resolve, reject) => {
      axe.run(
        container,
        {
          runOnly: {
            type: "rule",
            values: [
              "button-name",
              "aria-allowed-attr",
              "aria-required-attr",
              "aria-valid-attr",
              "aria-valid-attr-value",
              "aria-roles",
              "aria-hidden-focus",
              "label",
              "role-img-alt",
              "tabindex",
            ],
          },
        },
        (err, res) => {
          if (err) reject(err);
          else resolve(res);
        },
      );
    });

    expect(result.violations).toEqual([]);
  });
});

describe("ProfilePopover focus return", () => {
  it("returns focus to the trigger when closed via Escape", async () => {
    render(
      <AuthContext.Provider value={mockAuthContext()}>
        <HooksContext.Provider value={{}}>
          <ProfileContext.Provider value={mockProfileContext()}>
            <ProfilePopover />
          </ProfileContext.Provider>
        </HooksContext.Provider>
      </AuthContext.Provider>,
    );

    const trigger = screen.getByLabelText("Open profile menu");
    // Open the popover.
    fireEvent.click(trigger);
    // Move focus away from the trigger to simulate interacting with the popover.
    (document.body as HTMLElement).focus();
    expect(document.activeElement).not.toBe(trigger);

    // Press Escape at the document level.
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
      // Let the queued microtask flush.
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(trigger);
  });

  it("returns focus to the trigger on outside click", async () => {
    const outside = document.createElement("button");
    outside.textContent = "outside";
    document.body.appendChild(outside);

    render(
      <AuthContext.Provider value={mockAuthContext()}>
        <HooksContext.Provider value={{}}>
          <ProfileContext.Provider value={mockProfileContext()}>
            <ProfilePopover />
          </ProfileContext.Provider>
        </HooksContext.Provider>
      </AuthContext.Provider>,
    );

    const trigger = screen.getByLabelText("Open profile menu");
    fireEvent.click(trigger);

    await act(async () => {
      fireEvent.click(outside);
      await Promise.resolve();
    });

    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(outside);
  });
});
