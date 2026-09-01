/**
 * Design tokens for the identity widget.
 *
 * The key names and their `--aiw-*` CSS variables are deliberately identical
 * to `@stawi/profile`'s, so a host can build one token object and hand the
 * same value to both widgets. Keys a widget does not use are ignored rather
 * than rejected — that is what makes the shared object work.
 */
export interface IdentityWidgetTokens {
  colorBg?: string;
  colorSurface?: string;
  colorText?: string;
  colorTextSecondary?: string;
  colorBorder?: string;
  colorPrimary?: string;
  colorPrimaryHover?: string;
  colorDanger?: string;
  colorDangerHover?: string;
  colorMuted?: string;
  colorMutedStrong?: string;
  colorFocusRing?: string;
  fontHeading?: string;
  fontBody?: string;
  fontSizeBase?: string;
  fontWeightHeading?: number;
  fontWeightBody?: number;
  radius?: string;
  radiusSm?: string;
  popoverWidth?: string;
  popoverOffset?: string;
  shadow?: string;
  zIndexPopover?: number;
  zIndexDialog?: number;
  triggerSize?: string;
  avatarLargeSize?: string;
  /** Background of alternate table rows. */
  tableStripe?: string;
  /** Accent under the selected tab. */
  tabActive?: string;
}

export interface IdentityWidgetThemedTokens extends IdentityWidgetTokens {
  dark?: IdentityWidgetTokens;
  light?: IdentityWidgetTokens;
}
