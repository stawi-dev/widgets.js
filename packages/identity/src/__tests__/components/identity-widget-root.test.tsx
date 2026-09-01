import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import type { AuthRuntime } from "@stawi/auth-runtime";
import {
  IdentityWidgetRoot,
  deriveProfileApiBaseUrl,
} from "../../components/IdentityWidgetRoot.js";
import type { IdentityClient } from "../../services/identity-client.js";
import type { ProfileResolver } from "../../services/profile-resolver.js";
import type { Organization } from "../../types.js";

const ORG: Organization = { id: "o1", name: "Acme Imports", code: "ACME" };

/** Let a newly-shown screen finish its loads inside act(). */
async function settle() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

const client: IdentityClient = {
  organizationSearch: vi.fn().mockResolvedValue([ORG]),
  organizationSave: vi.fn(),
  orgUnitSearch: vi.fn().mockResolvedValue([]),
  orgUnitSave: vi.fn(),
  workforceMemberSearch: vi.fn().mockResolvedValue([]),
  workforceMemberGet: vi.fn(),
  workforceMemberSave: vi.fn(),
  internalTeamSearch: vi.fn().mockResolvedValue([]),
  internalTeamSave: vi.fn(),
  teamMembershipSearch: vi.fn().mockResolvedValue([]),
  teamMembershipSave: vi.fn(),
  accessRoleAssignmentSearch: vi.fn().mockResolvedValue([]),
  accessRoleAssignmentSave: vi.fn(),
};

const createIdentityClient = vi.fn<(deps: unknown) => IdentityClient>(
  () => client,
);
const createProfileResolver = vi.fn<(deps: unknown) => ProfileResolver>(() => ({
  resolve: vi.fn().mockResolvedValue(new Map()),
  byContact: vi.fn(),
}));

vi.mock("../../services/identity-client.js", () => ({
  createIdentityClient: (deps: unknown) => createIdentityClient(deps),
}));
vi.mock("../../services/profile-resolver.js", () => ({
  createProfileResolver: (deps: unknown) => createProfileResolver(deps),
}));

function runtime(): AuthRuntime {
  return {
    version: "test",
    getState: () => "authenticated",
    onAuthStateChange: (cb: (s: "authenticated") => void) => {
      cb("authenticated");
      return () => {};
    },
    onSecurityEvent: () => () => {},
    ensureAuthenticated: vi.fn(),
    logout: vi.fn(),
    fetch: vi.fn(),
    upload: vi.fn(),
    getRoles: vi.fn().mockResolvedValue([]),
    getClaims: vi.fn().mockResolvedValue({}),
    prefetchDiscovery: vi.fn().mockResolvedValue(undefined),
    destroy: vi.fn(),
  } as unknown as AuthRuntime;
}

function renderRoot(
  props: Partial<Parameters<typeof IdentityWidgetRoot>[0]> = {},
) {
  return render(
    <IdentityWidgetRoot
      runtime={runtime()}
      apiBaseUrl="https://api.stawi.org/identity"
      {...props}
    />,
  );
}

describe("IdentityWidgetRoot", () => {
  beforeEach(() => {
    createIdentityClient.mockClear();
    createProfileResolver.mockClear();
  });

  it("renders Members, Teams and Roles tabs, with Members selected", async () => {
    renderRoot();
    const tablist = await screen.findByRole("tablist");
    const tabs = screen.getAllByRole("tab");
    expect(tabs.map((t) => t.textContent)).toEqual([
      "Members",
      "Teams",
      "Roles",
    ]);
    expect(tabs[0]!.getAttribute("aria-selected")).toBe("true");
    expect(tablist).toBeTruthy();
  });

  it("hides the Units tab unless features.orgUnits is on", async () => {
    renderRoot({ features: { orgUnits: true } });
    await screen.findByRole("tablist");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Members",
      "Teams",
      "Roles",
      "Org units",
    ]);
  });

  it("uses vocabulary labels for the tab names", async () => {
    renderRoot({
      vocabulary: { labels: { members: "Staff", teams: "Squads" } },
    });
    await screen.findByRole("tablist");
    expect(screen.getAllByRole("tab").map((t) => t.textContent)).toEqual([
      "Staff",
      "Squads",
      "Roles",
    ]);
  });

  it("honours initialView", async () => {
    renderRoot({ initialView: "roles" });
    await screen.findByRole("tablist");
    const roles = screen.getByRole("tab", { name: "Roles" });
    expect(roles.getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("tabpanel").getAttribute("aria-labelledby")).toBe(
      roles.id,
    );
  });

  it("falls back to the first tab when initialView names a disabled view", async () => {
    renderRoot({ initialView: "units" });
    await screen.findByRole("tablist");
    expect(
      screen
        .getByRole("tab", { name: "Members" })
        .getAttribute("aria-selected"),
    ).toBe("true");
  });

  it("moves selection with arrow, Home and End keys", async () => {
    renderRoot();
    await screen.findByRole("tablist");
    const members = screen.getByRole("tab", { name: "Members" });

    fireEvent.keyDown(members, { key: "ArrowRight" });
    expect(
      screen.getByRole("tab", { name: "Teams" }).getAttribute("aria-selected"),
    ).toBe("true");

    fireEvent.keyDown(screen.getByRole("tab", { name: "Teams" }), {
      key: "ArrowLeft",
    });
    expect(members.getAttribute("aria-selected")).toBe("true");

    // Wraps backwards from the first tab to the last.
    fireEvent.keyDown(members, { key: "ArrowLeft" });
    expect(
      screen.getByRole("tab", { name: "Roles" }).getAttribute("aria-selected"),
    ).toBe("true");

    fireEvent.keyDown(screen.getByRole("tab", { name: "Roles" }), {
      key: "Home",
    });
    expect(members.getAttribute("aria-selected")).toBe("true");

    fireEvent.keyDown(members, { key: "End" });
    expect(
      screen.getByRole("tab", { name: "Roles" }).getAttribute("aria-selected"),
    ).toBe("true");

    await settle();
  });

  it("keeps only the selected tab in the tab order", async () => {
    renderRoot();
    await screen.findByRole("tablist");
    const [members, teams] = screen.getAllByRole("tab");
    expect(members!.getAttribute("tabindex")).toBe("0");
    expect(teams!.getAttribute("tabindex")).toBe("-1");
  });

  it("shows the organisation and returns to the gate when switching", async () => {
    // Two organisations, so releasing the selection lands on the picker.
    const two = {
      ...client,
      organizationSearch: vi
        .fn()
        .mockResolvedValue([ORG, { id: "o2", name: "Beta", code: "BETA" }]),
    };
    createIdentityClient.mockReturnValue(two);

    renderRoot();
    // Neither org auto-selects, so the picker shows first.
    fireEvent.click(await screen.findByText("Acme Imports"));
    await screen.findByRole("tablist");
    expect(screen.getByText("ACME")).toBeTruthy();

    fireEvent.click(
      screen.getByRole("button", { name: "Switch organisation" }),
    );
    expect(await screen.findByText("Choose an organization")).toBeTruthy();

    createIdentityClient.mockReturnValue(client);
  });

  it("hides the switcher when the host pinned an organisation", async () => {
    renderRoot({ organizationId: "o1" });
    await screen.findByRole("tablist");
    expect(
      screen.queryByRole("button", { name: "Switch organisation" }),
    ).toBeNull();
  });

  it("derives the profile base URL from the identity base URL", async () => {
    renderRoot();
    await screen.findByRole("tablist");
    expect(createProfileResolver).toHaveBeenCalledWith(
      expect.objectContaining({
        profileApiBaseUrl: "https://api.stawi.org/profile",
      }),
    );
    expect(createIdentityClient).toHaveBeenCalledWith(
      expect.objectContaining({ apiBaseUrl: "https://api.stawi.org/identity" }),
    );
  });

  it("prefers an explicit profileApiBaseUrl", async () => {
    renderRoot({ profileApiBaseUrl: "https://other.example/profile" });
    await screen.findByRole("tablist");
    expect(createProfileResolver).toHaveBeenCalledWith(
      expect.objectContaining({
        profileApiBaseUrl: "https://other.example/profile",
      }),
    );
  });

  it("reports render-time failures through onError", () => {
    const onError = vi.fn();
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    createIdentityClient.mockImplementation(() => {
      throw new Error("kaboom");
    });

    try {
      renderRoot({ onError });
      expect(screen.getByRole("alert").textContent).toContain("kaboom");
      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    } finally {
      createIdentityClient.mockImplementation(() => client);
      spy.mockRestore();
    }
  });
});

describe("deriveProfileApiBaseUrl", () => {
  it.each([
    ["https://api.stawi.org/identity", "https://api.stawi.org/profile"],
    ["https://api.stawi.org/identity/", "https://api.stawi.org/profile"],
    ["https://api.stawi.org/v1/identity", "https://api.stawi.org/v1/profile"],
    ["https://api.stawi.org", "https://api.stawi.org/profile"],
  ])("%s -> %s", (input, expected) => {
    expect(deriveProfileApiBaseUrl(input)).toBe(expected);
  });

  it("returns an unparseable base URL unchanged", () => {
    expect(deriveProfileApiBaseUrl("not a url")).toBe("not a url");
  });
});
