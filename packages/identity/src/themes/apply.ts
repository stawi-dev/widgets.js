import type { IdentityWidgetTokens } from "./types.js";

const SIZE_RE = /^-?\d+(\.\d+)?(px|rem|em|%|vh|vw)$|^calc\(.+\)$/;

/**
 * Token key → CSS custom property. The shared entries match
 * `@stawi/profile` exactly; `tableStripe` and `tabActive` are the
 * identity-only additions for table and tab chrome.
 */
// Null-prototype: a host-supplied key like "__proto__" or "constructor"
// must miss, not resolve to an inherited Object.prototype member.
const MAP: Record<string, string> = Object.assign(Object.create(null), {
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
  fontHeading: "--aiw-font-heading",
  fontBody: "--aiw-font-body",
  fontSizeBase: "--aiw-font-size-base",
  fontWeightHeading: "--aiw-font-weight-heading",
  fontWeightBody: "--aiw-font-weight-body",
  radius: "--aiw-radius",
  radiusSm: "--aiw-radius-sm",
  popoverWidth: "--aiw-popover-width",
  popoverOffset: "--aiw-popover-offset",
  shadow: "--aiw-shadow",
  zIndexPopover: "--aiw-z-popover",
  zIndexDialog: "--aiw-z-dialog",
  triggerSize: "--aiw-trigger-size",
  avatarLargeSize: "--aiw-avatar-large-size",
  tableStripe: "--aiw-table-stripe",
  tabActive: "--aiw-tab-active",
}) as Record<string, string>;

export function tokenToCssVar(key: string): string | undefined {
  return MAP[key];
}

function isSize(v: unknown): v is string {
  return typeof v === "string" && SIZE_RE.test(v);
}

const SIZE_KEYS = new Set([
  "radius",
  "radiusSm",
  "popoverWidth",
  "popoverOffset",
  "fontSizeBase",
  "triggerSize",
  "avatarLargeSize",
]);

/**
 * Writes `tokens` onto `el` as CSS custom properties. Unknown keys, blank
 * values, malformed sizes and non-numeric z-indexes are skipped so a
 * host-supplied object can never inject arbitrary CSS through a length.
 */
export function applyTokens(
  el: HTMLElement,
  tokens: IdentityWidgetTokens,
): void {
  for (const [k, v] of Object.entries(tokens)) {
    const cssVar = MAP[k];
    if (!cssVar || v === undefined || v === null) continue;
    if (SIZE_KEYS.has(k) && !isSize(v)) continue;
    if (k.startsWith("zIndex") && !Number.isFinite(Number(v))) continue;
    el.style.setProperty(cssVar, String(v));
  }
}
