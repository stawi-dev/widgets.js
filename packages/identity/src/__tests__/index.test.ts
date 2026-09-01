import { describe, it, expect } from "vitest";
import * as identity from "../index.js";
import * as bootstrap from "../bootstrap.js";

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
    expect(identity.commerceVocabulary.teamTypes.length).toBeGreaterThan(0);
    expect(identity.claudeDark.colorPrimary).toBeTruthy();
  });

  it("re-exports the whole public API from the IIFE bootstrap", () => {
    // window.StawiIdentity must carry everything the ESM entry does.
    for (const key of Object.keys(identity)) {
      expect(Object.keys(bootstrap)).toContain(key);
    }
  });
});
