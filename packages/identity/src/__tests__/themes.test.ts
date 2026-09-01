import { describe, it, expect } from "vitest";
import { applyTokens, tokenToCssVar } from "../themes/apply.js";
import { claudeDark, claudeLight, highContrast } from "../themes/presets.js";
import type { IdentityWidgetTokens } from "../themes/types.js";

describe("tokenToCssVar", () => {
  it("maps token keys to --aiw-* variables", () => {
    expect(tokenToCssVar("colorPrimary")).toBe("--aiw-primary");
    expect(tokenToCssVar("fontHeading")).toBe("--aiw-font-heading");
    expect(tokenToCssVar("tableStripe")).toBe("--aiw-table-stripe");
    expect(tokenToCssVar("tabActive")).toBe("--aiw-tab-active");
  });

  it("returns undefined for keys it does not own", () => {
    expect(tokenToCssVar("colorPrimaryButNot")).toBeUndefined();
    expect(tokenToCssVar("__proto__")).toBeUndefined();
  });

  it("uses the same variable names as @stawi/profile for shared keys", () => {
    // A host passes one token object to both widgets; these must agree.
    const shared: Record<string, string> = {
      colorBg: "--aiw-bg",
      colorSurface: "--aiw-surface",
      colorText: "--aiw-text",
      colorTextSecondary: "--aiw-text-secondary",
      colorBorder: "--aiw-border",
      colorPrimary: "--aiw-primary",
      colorPrimaryHover: "--aiw-primary-hover",
      colorDanger: "--aiw-danger",
      colorDangerHover: "--aiw-danger-hover",
      colorMuted: "--aiw-muted",
      colorMutedStrong: "--aiw-muted-strong",
      colorFocusRing: "--aiw-focus-ring",
      fontBody: "--aiw-font-body",
      fontSizeBase: "--aiw-font-size-base",
      fontWeightHeading: "--aiw-font-weight-heading",
      fontWeightBody: "--aiw-font-weight-body",
      radius: "--aiw-radius",
      radiusSm: "--aiw-radius-sm",
      shadow: "--aiw-shadow",
      zIndexDialog: "--aiw-z-dialog",
    };
    for (const [key, cssVar] of Object.entries(shared)) {
      expect(tokenToCssVar(key)).toBe(cssVar);
    }
  });
});

describe("applyTokens", () => {
  function el() {
    return document.createElement("div");
  }

  it("writes known tokens as CSS custom properties", () => {
    const node = el();
    applyTokens(node, {
      colorPrimary: "#123456",
      radius: "12px",
      zIndexDialog: 42,
      tableStripe: "rgba(0,0,0,0.04)",
    });
    expect(node.style.getPropertyValue("--aiw-primary")).toBe("#123456");
    expect(node.style.getPropertyValue("--aiw-radius")).toBe("12px");
    expect(node.style.getPropertyValue("--aiw-z-dialog")).toBe("42");
    expect(node.style.getPropertyValue("--aiw-table-stripe")).toBe(
      "rgba(0,0,0,0.04)",
    );
  });

  it("ignores malformed sizes so hosts cannot inject CSS through a length", () => {
    const node = el();
    applyTokens(node, {
      radius: "12px; color: red",
      radiusSm: "not-a-size",
      fontSizeBase: "14px",
    });
    expect(node.style.getPropertyValue("--aiw-radius")).toBe("");
    expect(node.style.getPropertyValue("--aiw-radius-sm")).toBe("");
    expect(node.style.getPropertyValue("--aiw-font-size-base")).toBe("14px");
  });

  it("ignores non-numeric z-indexes and unknown keys", () => {
    const node = el();
    applyTokens(node, {
      zIndexDialog: "high" as unknown as number,
      nope: "value",
    } as IdentityWidgetTokens);
    expect(node.style.getPropertyValue("--aiw-z-dialog")).toBe("");
    expect(node.getAttribute("style")).toBeNull();
  });

  it("skips undefined values", () => {
    const node = el();
    applyTokens(node, { colorPrimary: undefined, colorBg: "#fff" });
    expect(node.style.getPropertyValue("--aiw-primary")).toBe("");
    expect(node.style.getPropertyValue("--aiw-bg")).toBe("#fff");
  });

  it("applies the shipped presets", () => {
    for (const preset of [claudeLight, claudeDark, highContrast]) {
      const node = el();
      applyTokens(node, preset);
      expect(node.style.getPropertyValue("--aiw-bg")).toBe(preset.colorBg);
      expect(node.style.getPropertyValue("--aiw-primary")).toBe(
        preset.colorPrimary,
      );
    }
  });
});
