import type { IdentityWidgetTokens } from "./types.js";

/**
 * The same four presets `@stawi/profile` ships, so a host that themes both
 * widgets picks one name and passes it to each.
 */

export const claudeLight: IdentityWidgetTokens = {
  colorBg: "#fafaf9",
  colorSurface: "#ffffff",
  colorText: "#2a2a2a",
  colorPrimary: "#d97757",
  colorPrimaryHover: "#c4633f",
};

export const claudeDark: IdentityWidgetTokens = {
  colorBg: "#2c2a28",
  colorSurface: "#363432",
  colorText: "#e8e6e1",
  colorPrimary: "#d97757",
  colorPrimaryHover: "#c4633f",
};

export const neutralLight: IdentityWidgetTokens = {
  colorBg: "#ffffff",
  colorSurface: "#f7f7f7",
  colorText: "#111111",
  colorPrimary: "#2563eb",
  colorPrimaryHover: "#1d4ed8",
};

export const highContrast: IdentityWidgetTokens = {
  colorBg: "#000000",
  colorSurface: "#0a0a0a",
  colorText: "#ffffff",
  colorBorder: "#ffffff",
  colorPrimary: "#ffff00",
  colorPrimaryHover: "#cccc00",
};
