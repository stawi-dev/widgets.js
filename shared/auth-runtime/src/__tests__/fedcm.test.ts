import { describe, it, expect } from "vitest";
import { isFedCMSupported } from "../fedcm.js";

describe("FedCM", () => {
  it("reports FedCM as not supported in test environment", () => {
    // jsdom/node doesn't have IdentityCredential
    expect(isFedCMSupported()).toBe(false);
  });
});
