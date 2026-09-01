import type { IdentityWidgetThemedTokens } from "./types.js";

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

/**
 * Characters that would let a host-supplied token value escape its
 * declaration and inject rules of its own — `radius: "1px} :host{display:none"`
 * is the shape of the attack. `url(` is rejected too, so a token can never
 * pull in a remote resource.
 */
const UNSAFE_RE = /[;{}<>]|\/\*|\*\/|url\(/i;

/** Token keys whose value must be a CSS length. */
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
 * Validates one token, returning the value to write or `null` to drop it.
 * Unknown keys, blank and unsafe values, malformed sizes and non-numeric
 * z-indexes are all rejected.
 */
export function safeTokenValue(key: string, value: unknown): string | null {
  if (!MAP[key] || value === undefined || value === null) return null;
  const text = String(value).trim();
  if (!text || UNSAFE_RE.test(text)) return null;
  if (SIZE_KEYS.has(key) && !SIZE_RE.test(text)) return null;
  if (key.startsWith("zIndex") && !Number.isFinite(Number(text))) return null;
  return text;
}

/**
 * Renders `tokens` as CSS declarations (`--aiw-x: y;`), dropping anything
 * `safeTokenValue` rejects. This is the only path host tokens take into
 * stylesheet text, in both the shadow and light-DOM builds.
 */
export function tokenDeclarations(tokens: Record<string, unknown>): string {
  const out: string[] = [];
  for (const [key, value] of Object.entries(tokens)) {
    const safe = safeTokenValue(key, value);
    if (safe !== null) out.push(`${MAP[key]!}: ${safe};`);
  }
  return out.join("");
}

/** Renders a `selector{...}` block, or "" when no token survives validation. */
function block(selector: string, tokens: Record<string, unknown>): string {
  const decls = tokenDeclarations(tokens);
  return decls ? `${selector}{${decls}}` : "";
}

/** The four selector slots a themed token sheet writes into. */
export type TokenScope = "base" | "dark" | "light" | "auto";

/**
 * Renders a themed token object as stylesheet text. `selector` maps each
 * scope to the selector that build uses — `:host(...)` in the shadow build,
 * an instance attribute in the light-DOM one — so both paths share this
 * (and therefore share `tokenDeclarations`' validation).
 *
 * `auto` follows the OS, so each themed block is emitted twice: once for the
 * explicit `data-theme` choice, once behind the matching media query.
 */
export function themedTokenSheet(
  tokens: IdentityWidgetThemedTokens,
  selector: (scope: TokenScope) => string,
): string {
  const { dark, light, ...base } = tokens;
  const parts: string[] = [
    block(selector("base"), base as Record<string, unknown>),
  ];
  for (const [scope, overrides] of [
    ["dark", dark],
    ["light", light],
  ] as const) {
    if (!overrides) continue;
    const values = overrides as Record<string, unknown>;
    parts.push(block(selector(scope), values));
    const inner = block(selector("auto"), values);
    if (inner) parts.push(`@media (prefers-color-scheme: ${scope}){${inner}}`);
  }
  return parts.filter(Boolean).join("");
}
