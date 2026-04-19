import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";
import { AdminPanelButton } from "../../components/AdminPanelButton.js";
import { AuthContext, type AuthContextValue } from "../../context/auth-context.js";

function createWrapper(roles: string[]) {
  const runtime = {
    fetch: vi.fn(),
    upload: vi.fn(),
    getRoles: vi.fn().mockResolvedValue(roles),
    getClaims: vi.fn().mockResolvedValue({}),
    ensureAuthenticated: vi.fn(),
    logout: vi.fn(),
    onAuthStateChange: vi.fn(() => () => {}),
    onSecurityEvent: vi.fn(() => () => {}),
    getState: vi.fn(() => "authenticated" as const),
    prefetchDiscovery: vi.fn(),
    destroy: vi.fn(),
    version: "test",
  } as unknown as AuthContextValue["runtime"];

  const value: AuthContextValue = {
    authState: "authenticated",
    runtime,
    ensureAuthenticated: vi.fn(),
    logout: vi.fn(),
  };
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
  };
}

describe("AdminPanelButton", () => {
  it("renders nothing when user has no admin roles", async () => {
    const { container } = render(
      <AdminPanelButton adminPanelUrl="https://admin.example.com" />,
      { wrapper: createWrapper([]) },
    );
    // useRoles returns empty initially, so no button
    expect(container.querySelector("a")).toBeNull();
  });

  it("renders admin link when user has admin role", async () => {
    const Wrapper = createWrapper(["admin"]);
    const { findByText } = render(
      <Wrapper>
        <AdminPanelButton adminPanelUrl="https://admin.example.com" />
      </Wrapper>,
    );
    const link = await findByText("Admin Panel");
    expect(link.closest("a")?.getAttribute("href")).toBe(
      "https://admin.example.com",
    );
    expect(link.closest("a")?.getAttribute("target")).toBe("_blank");
  });

  it("renders admin link when user has owner role", async () => {
    const Wrapper = createWrapper(["owner"]);
    const { findByText } = render(
      <Wrapper>
        <AdminPanelButton adminPanelUrl="https://admin.example.com" />
      </Wrapper>,
    );
    expect(await findByText("Admin Panel")).toBeTruthy();
  });
});
