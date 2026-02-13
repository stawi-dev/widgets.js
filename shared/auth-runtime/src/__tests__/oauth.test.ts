import { describe, it, expect } from "vitest";
import { AuthError } from "../errors.js";

describe("OAuth popup", () => {
  it("AuthError captures code and message", () => {
    const err = new AuthError("OAUTH_POPUP_BLOCKED", "Popup blocked");
    expect(err.code).toBe("OAUTH_POPUP_BLOCKED");
    expect(err.message).toBe("Popup blocked");
    expect(err.name).toBe("AuthError");
  });

  it("AuthError captures cause", () => {
    const cause = new Error("original");
    const err = new AuthError("OAUTH_FAILED", "Failed", cause);
    expect(err.cause).toBe(cause);
  });
});
