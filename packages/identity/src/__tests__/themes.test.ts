import { describe, it, expect } from "vitest";
import { tokenDeclarations, tokenToCssVar } from "../themes/apply.js";
import { claudeDark, claudeLight, highContrast } from "../themes/presets.js";
import { widgetStyles, widgetStylesFor } from "../styles/styles.js";
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

describe("tokenDeclarations", () => {
  it("renders known tokens as CSS custom properties", () => {
    expect(
      tokenDeclarations({
        colorPrimary: "#123456",
        radius: "12px",
        zIndexDialog: 42,
        tableStripe: "rgba(0,0,0,0.04)",
      }),
    ).toBe(
      "--aiw-primary: #123456;--aiw-radius: 12px;--aiw-z-dialog: 42;" +
        "--aiw-table-stripe: rgba(0,0,0,0.04);",
    );
  });

  it("drops values that would break out of the declaration", () => {
    // Each of these would inject a rule of its own if interpolated raw.
    const attacks: IdentityWidgetTokens[] = [
      { radius: "1px} :host{display:none" },
      { colorPrimary: "red; background: url(https://evil.test/x)" },
      { colorBg: "#fff} .aiw-table{display:none" },
      { fontBody: "Inter /* comment */" },
      { colorSurface: "url(https://evil.test/x.png)" },
      { colorText: "<script>" },
    ];
    for (const tokens of attacks) {
      expect(tokenDeclarations(tokens as Record<string, unknown>)).toBe("");
    }
  });

  it("keeps well-formed colours, fonts and lengths", () => {
    expect(
      tokenDeclarations({
        colorPrimary: "rgba(37, 99, 235, 0.9)",
        fontBody: "Inter, system-ui, sans-serif",
        radius: "0.75rem",
        radiusSm: "calc(100% - 2px)",
      }),
    ).toBe(
      "--aiw-primary: rgba(37, 99, 235, 0.9);" +
        "--aiw-font-body: Inter, system-ui, sans-serif;" +
        "--aiw-radius: 0.75rem;" +
        "--aiw-radius-sm: calc(100% - 2px);",
    );
  });

  it("ignores malformed sizes, bad z-indexes, unknown keys and blanks", () => {
    expect(
      tokenDeclarations({
        radius: "not-a-size",
        zIndexDialog: "high",
        nope: "value",
        colorBg: "   ",
        colorText: undefined,
        colorSurface: null,
      } as unknown as Record<string, unknown>),
    ).toBe("");
  });

  it("renders the shipped presets", () => {
    for (const preset of [claudeLight, claudeDark, highContrast]) {
      const css = tokenDeclarations(preset as Record<string, unknown>);
      expect(css).toContain(`--aiw-bg: ${preset.colorBg};`);
      expect(css).toContain(`--aiw-primary: ${preset.colorPrimary};`);
    }
  });
});

describe("widgetStylesFor", () => {
  it("produces a light-DOM sheet with no :host selectors", () => {
    const css = widgetStylesFor(".aiw-root");
    expect(css).not.toContain(":host");
    expect(widgetStyles).toContain(":host");
  });

  it("binds the token blocks to the given selector", () => {
    const css = widgetStylesFor("#admin .widget");
    expect(css).toContain("#admin .widget {");
    expect(css).toContain("--aiw-bg: #ffffff;");
    expect(css).toContain('#admin .widget[data-theme="dark"] {');
    expect(css).toContain('#admin .widget[data-theme="auto"] {');
    expect(css).toContain("prefers-color-scheme: dark");
    // The dark palette must be defined under both dark selectors.
    expect(css.match(/--aiw-bg: #1c1b1a;/g)?.length).toBe(2);
  });

  it("defaults to .aiw-root, the class the widget root renders", () => {
    expect(widgetStylesFor()).toBe(widgetStylesFor(".aiw-root"));
    expect(widgetStylesFor()).toContain(".aiw-root {");
  });

  it("scopes the reset so it cannot restyle the host page", () => {
    const css = widgetStylesFor(".aiw-root");
    expect(css).toContain(".aiw-root *, .aiw-root *::before");
    expect(css).not.toMatch(/^\*, \*::before/m);
  });
});
