import { describe, it, expect, vi } from "vitest";
import * as identity from "../index.js";

describe("package entry points", () => {
  it("exports the data layer", () => {
    expect(typeof identity.createIdentityClient).toBe("function");
    expect(typeof identity.decodeConnectStream).toBe("function");
    expect(typeof identity.createProfileResolver).toBe("function");
    expect(new identity.IdentityError("x", "y")).toBeInstanceOf(Error);
  });

  it("exports the widget entry points", () => {
    expect(typeof identity.mount).toBe("function");
    expect(typeof identity.IdentityWidgetRoot).toBe("function");
    expect(typeof identity.mergeVocabulary).toBe("function");
    expect(typeof identity.widgetStylesFor).toBe("function");
    expect(identity.commerceVocabulary.teamTypes.length).toBeGreaterThan(0);
    expect(identity.claudeDark.colorPrimary).toBeTruthy();
  });

  it("re-exports the whole public API from the IIFE bootstrap", async () => {
    // Importing bootstrap runs its auto-mount, which warns because there is
    // no currentScript under Vitest. That is the documented behaviour, so
    // swallow it rather than letting it litter the test output.
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const bootstrap = await import("../bootstrap.js");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("currentScript is null"),
    );
    warn.mockRestore();

    // window.StawiIdentity must carry everything the ESM entry does.
    for (const key of Object.keys(identity)) {
      expect(Object.keys(bootstrap)).toContain(key);
    }
  });
});
