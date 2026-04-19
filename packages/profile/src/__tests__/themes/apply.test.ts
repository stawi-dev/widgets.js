import { describe, it, expect } from "vitest";
import { applyTokens, tokenToCssVar } from "../../themes/apply.js";

describe("applyTokens", () => {
  it("maps camelCase tokens to --aiw-* vars and sets on host element", () => {
    const el = document.createElement("div");
    applyTokens(el, { colorPrimary: "#0f0", radius: "12px" });
    expect(el.style.getPropertyValue("--aiw-primary")).toBe("#0f0");
    expect(el.style.getPropertyValue("--aiw-radius")).toBe("12px");
  });
  it("rejects invalid size values silently", () => {
    const el = document.createElement("div");
    applyTokens(el, { radius: "not-a-size" as unknown as string });
    expect(el.style.getPropertyValue("--aiw-radius")).toBe("");
  });
  it("tokenToCssVar handles known tokens", () => {
    expect(tokenToCssVar("colorPrimary")).toBe("--aiw-primary");
    expect(tokenToCssVar("fontHeading")).toBe("--aiw-font-heading");
    expect(tokenToCssVar("popoverWidth")).toBe("--aiw-popover-width");
  });
});
