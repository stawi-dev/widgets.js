import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import { createAuthRuntime, type AuthRuntime } from "@stawi/auth-runtime";
import { mount } from "../index.js";
import { identityAuthScopes } from "../auth-scopes.js";

const destroySpy = vi.fn();

function fakeRuntime(): AuthRuntime {
  return {
    version: "runtime-test",
    getState: () => "unauthenticated" as const,
    onAuthStateChange: (cb: (s: "unauthenticated") => void) => {
      cb("unauthenticated");
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
    destroy: destroySpy,
  } as unknown as AuthRuntime;
}

vi.mock("@stawi/auth-runtime", async () => {
  const actual = await vi.importActual<typeof import("@stawi/auth-runtime")>(
    "@stawi/auth-runtime",
  );
  return { ...actual, createAuthRuntime: vi.fn(() => fakeRuntime()) };
});

const API = "https://api.stawi.org/identity";

describe("mount", () => {
  beforeEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    destroySpy.mockClear();
    vi.mocked(createAuthRuntime).mockClear();
  });

  it("creates a shadow host marked data-antinvestor-identity", () => {
    // The stylesheet lands in an effect, so flush the initial render.
    let handle!: ReturnType<typeof mount>;
    act(() => {
      handle = mount({ apiBaseUrl: API, installationId: "inst-1" });
    });

    const host = document.querySelector("[data-antinvestor-identity]");
    expect(host).toBeTruthy();
    expect(host!.shadowRoot).toBeTruthy();
    // The stylesheet is injected into the shadow root, not the host page.
    expect(host!.shadowRoot!.querySelector("style")).toBeTruthy();

    handle.unmount();
  });

  it("mounts into an explicit target", () => {
    const target = document.createElement("section");
    document.body.appendChild(target);

    const handle = mount({ apiBaseUrl: API, target, runtime: fakeRuntime() });
    expect(target.querySelector("[data-antinvestor-identity]")).toBeTruthy();

    handle.unmount();
  });

  it("defaults the theme to auto and reflects an explicit one", () => {
    const a = mount({ apiBaseUrl: API, runtime: fakeRuntime() });
    expect(
      document
        .querySelector("[data-antinvestor-identity]")!
        .getAttribute("data-theme"),
    ).toBe("auto");
    a.unmount();

    const b = mount({ apiBaseUrl: API, theme: "dark", runtime: fakeRuntime() });
    expect(
      document
        .querySelector("[data-antinvestor-identity]")!
        .getAttribute("data-theme"),
    ).toBe("dark");
    b.unmount();
  });

  it("sets dir=rtl only for right-to-left locales", () => {
    const rtl = mount({
      apiBaseUrl: API,
      locale: "ar",
      runtime: fakeRuntime(),
    });
    expect(
      document
        .querySelector("[data-antinvestor-identity]")!
        .getAttribute("dir"),
    ).toBe("rtl");
    rtl.unmount();

    const ltr = mount({
      apiBaseUrl: API,
      locale: "sw",
      runtime: fakeRuntime(),
    });
    expect(
      document
        .querySelector("[data-antinvestor-identity]")!
        .getAttribute("dir"),
    ).toBeNull();
    ltr.unmount();
  });

  it("exposes a version and the runtime auth state", () => {
    const handle = mount({ apiBaseUrl: API, runtime: fakeRuntime() });
    expect(typeof handle.version).toBe("string");
    expect(handle.version.length).toBeGreaterThan(0);
    expect(handle.getAuthState()).toBe("unauthenticated");
    handle.unmount();
  });

  it("unmount removes the host from the page", () => {
    const handle = mount({ apiBaseUrl: API, runtime: fakeRuntime() });
    expect(document.querySelector("[data-antinvestor-identity]")).toBeTruthy();
    handle.unmount();
    expect(document.querySelector("[data-antinvestor-identity]")).toBeNull();
  });

  it("does not destroy a runtime the host supplied", () => {
    const handle = mount({ apiBaseUrl: API, runtime: fakeRuntime() });
    handle.unmount();
    expect(destroySpy).not.toHaveBeenCalled();
    expect(createAuthRuntime).not.toHaveBeenCalled();
  });

  it("destroys a runtime it created itself, exactly once", () => {
    const handle = mount({ apiBaseUrl: API, installationId: "inst-1" });
    expect(createAuthRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "inst-1",
        installationId: "inst-1",
        scopes: [...identityAuthScopes],
      }),
    );
    handle.unmount();
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it("prefers an explicit clientId over the installation id", () => {
    const handle = mount({
      apiBaseUrl: API,
      installationId: "inst-1",
      clientId: "client-1",
    });
    expect(createAuthRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "client-1" }),
    );
    handle.unmount();
  });

  it("refuses to mount with neither a runtime nor a client id", () => {
    expect(() => mount({ apiBaseUrl: API })).toThrow(/clientId/);
  });

  it("writes host token overrides into the shadow root", () => {
    let handle!: ReturnType<typeof mount>;
    act(() => {
      handle = mount({
        apiBaseUrl: API,
        runtime: fakeRuntime(),
        tokens: {
          colorPrimary: "#ff0000",
          dark: { colorBg: "#000102" },
          light: { colorBg: "#fdfdfd" },
        },
        css: ".aiw-root{padding:0}",
      });
    });

    const css = Array.from(
      document
        .querySelector("[data-antinvestor-identity]")!
        .shadowRoot!.querySelectorAll("style"),
    )
      .map((s) => s.textContent ?? "")
      .join("\n");

    expect(css).toContain("--aiw-primary: #ff0000");
    expect(css).toContain('[data-theme="dark"]');
    expect(css).toContain("--aiw-bg: #000102");
    expect(css).toContain('[data-theme="light"]');
    expect(css).toContain("--aiw-bg: #fdfdfd");
    expect(css).toContain("prefers-color-scheme: light");
    expect(css).toContain(".aiw-root{padding:0}");

    handle.unmount();
  });
});
