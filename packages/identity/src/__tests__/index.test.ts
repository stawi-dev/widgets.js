import { describe, it, expect } from "vitest";
import * as identity from "../index.js";
import * as bootstrap from "../bootstrap.js";

describe("package entry points", () => {
  it("exports the data layer", () => {
    expect(typeof identity.createIdentityClient).toBe("function");
    expect(typeof identity.decodeConnectStream).toBe("function");
    expect(new identity.IdentityError("x", "y")).toBeInstanceOf(Error);
  });

  it("re-exports the data layer from the IIFE bootstrap", () => {
    expect(Object.keys(bootstrap).sort()).toEqual(Object.keys(identity).sort());
  });
});
