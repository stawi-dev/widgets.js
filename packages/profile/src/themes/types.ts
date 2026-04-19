export interface ProfileWidgetTokens {
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
}

export interface ProfileWidgetThemedTokens extends ProfileWidgetTokens {
  dark?: ProfileWidgetTokens;
  light?: ProfileWidgetTokens;
}
