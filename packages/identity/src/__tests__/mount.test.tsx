import { describe, it, expect, vi, beforeEach } from "vitest";
import { act } from "@testing-library/react";
import { createAuthRuntime, type AuthRuntime } from "@stawi/auth-runtime";
import { mount, type MountHandle, type MountOptions } from "../index.js";
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

/**
 * `mount()` renders through `createRoot`, and the widget's screens then kick
 * off their loads — all React work that has to happen inside `act()` for the
 * test output to stay clean.
 */
function mountInAct(options: MountOptions): MountHandle {
  let handle!: MountHandle;
  act(() => {
    handle = mount(options);
  });
  return handle;
}

/** Flush the in-flight loads, then tear the widget down inside act(). */
async function unmountInAct(handle: MountHandle) {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
  act(() => handle.unmount());
}

describe("mount", () => {
  beforeEach(() => {
    while (document.body.firstChild) {
      document.body.removeChild(document.body.firstChild);
    }
    destroySpy.mockClear();
    vi.mocked(createAuthRuntime).mockClear();
  });

  it("creates a shadow host marked data-antinvestor-identity", async () => {
    const handle = mountInAct({ apiBaseUrl: API, installationId: "inst-1" });

    const host = document.querySelector("[data-antinvestor-identity]");
    expect(host).toBeTruthy();
    expect(host!.shadowRoot).toBeTruthy();
    // The stylesheet is injected into the shadow root, not the host page.
    expect(host!.shadowRoot!.querySelector("style")).toBeTruthy();

    await unmountInAct(handle);
  });

  it("mounts into an explicit target", async () => {
    const target = document.createElement("section");
    document.body.appendChild(target);

    const handle = mountInAct({
      apiBaseUrl: API,
      target,
      runtime: fakeRuntime(),
    });
    expect(target.querySelector("[data-antinvestor-identity]")).toBeTruthy();

    await unmountInAct(handle);
  });

  it("defaults the theme to auto and reflects an explicit one", async () => {
    const a = mountInAct({ apiBaseUrl: API, runtime: fakeRuntime() });
    expect(
      document
        .querySelector("[data-antinvestor-identity]")!
        .getAttribute("data-theme"),
    ).toBe("auto");
    await unmountInAct(a);

    const b = mountInAct({
      apiBaseUrl: API,
      theme: "dark",
      runtime: fakeRuntime(),
    });
    expect(
      document
        .querySelector("[data-antinvestor-identity]")!
        .getAttribute("data-theme"),
    ).toBe("dark");
    await unmountInAct(b);
  });

  it("sets dir=rtl only for right-to-left locales", async () => {
    const rtl = mountInAct({
      apiBaseUrl: API,
      locale: "ar",
      runtime: fakeRuntime(),
    });
    expect(
      document
        .querySelector("[data-antinvestor-identity]")!
        .getAttribute("dir"),
    ).toBe("rtl");
    await unmountInAct(rtl);

    const ltr = mountInAct({
      apiBaseUrl: API,
      locale: "sw",
      runtime: fakeRuntime(),
    });
    expect(
      document
        .querySelector("[data-antinvestor-identity]")!
        .getAttribute("dir"),
    ).toBeNull();
    await unmountInAct(ltr);
  });

  it("exposes a version and the runtime auth state", async () => {
    const handle = mountInAct({ apiBaseUrl: API, runtime: fakeRuntime() });
    expect(typeof handle.version).toBe("string");
    expect(handle.version.length).toBeGreaterThan(0);
    expect(handle.getAuthState()).toBe("unauthenticated");
    await unmountInAct(handle);
  });

  it("unmount removes the host from the page", async () => {
    const handle = mountInAct({ apiBaseUrl: API, runtime: fakeRuntime() });
    expect(document.querySelector("[data-antinvestor-identity]")).toBeTruthy();
    await unmountInAct(handle);
    expect(document.querySelector("[data-antinvestor-identity]")).toBeNull();
  });

  it("does not destroy a runtime the host supplied", async () => {
    const handle = mountInAct({ apiBaseUrl: API, runtime: fakeRuntime() });
    await unmountInAct(handle);
    expect(destroySpy).not.toHaveBeenCalled();
    expect(createAuthRuntime).not.toHaveBeenCalled();
  });

  it("destroys a runtime it created itself, exactly once", async () => {
    const handle = mountInAct({ apiBaseUrl: API, installationId: "inst-1" });
    expect(createAuthRuntime).toHaveBeenCalledWith(
      expect.objectContaining({
        clientId: "inst-1",
        installationId: "inst-1",
        scopes: [...identityAuthScopes],
      }),
    );
    await unmountInAct(handle);
    expect(destroySpy).toHaveBeenCalledTimes(1);
  });

  it("prefers an explicit clientId over the installation id", async () => {
    const handle = mountInAct({
      apiBaseUrl: API,
      installationId: "inst-1",
      clientId: "client-1",
    });
    expect(createAuthRuntime).toHaveBeenCalledWith(
      expect.objectContaining({ clientId: "client-1" }),
    );
    await unmountInAct(handle);
  });

  it("refuses to mount with neither a runtime nor a client id", async () => {
    expect(() => mount({ apiBaseUrl: API })).toThrow(/clientId/);
  });

  it("writes host token overrides into the shadow root", async () => {
    const handle = mountInAct({
      apiBaseUrl: API,
      runtime: fakeRuntime(),
      tokens: {
        colorPrimary: "#ff0000",
        dark: { colorBg: "#000102" },
        light: { colorBg: "#fdfdfd" },
      },
      css: ".aiw-root{padding:0}",
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

    await unmountInAct(handle);
  });

  it("drops a token that tries to break out of its declaration", async () => {
    const handle = mountInAct({
      apiBaseUrl: API,
      runtime: fakeRuntime(),
      tokens: {
        // Raw interpolation here would close the :host block and add a
        // rule of the attacker's choosing.
        radius: "1px} :host{display:none",
        colorPrimary: "#00ff00",
      },
    });

    const css = Array.from(
      document
        .querySelector("[data-antinvestor-identity]")!
        .shadowRoot!.querySelectorAll("style"),
    )
      .map((s) => s.textContent ?? "")
      .join("\n");

    expect(css).not.toContain("display:none");
    expect(css).not.toContain("--aiw-radius: 1px}");
    // The safe token in the same object still lands.
    expect(css).toContain(":host{--aiw-primary: #00ff00;}");

    await unmountInAct(handle);
  });
});
