import { createRoot, type Root } from "react-dom/client";
import { ProfileWidgetRoot } from "./components/ProfileWidgetRoot.js";
import { ShadowStyleProvider } from "./shadow-host.js";
import { isRtl } from "./i18n/index.js";
import type { ProfileWidgetProps } from "./types.js";

export type { ProfileWidgetProps, ProfileData, ContactMethod } from "./types.js";
export { ProfileWidgetRoot } from "./components/ProfileWidgetRoot.js";
export type {
  ProfileWidgetTokens,
  ProfileWidgetThemedTokens,
} from "./themes/types.js";
export {
  claudeDark,
  claudeLight,
  neutralLight,
  highContrast,
} from "./themes/presets.js";

export interface MountOptions extends ProfileWidgetProps {
  target?: HTMLElement;
}

export interface MountHandle {
  unmount: () => void;
}

/**
 * Validates that an admin-panel URL uses http(s). Returns the URL if valid,
 * or undefined otherwise. Logs an error on reject so embedders get feedback.
 */
function validateAdminPanelUrl(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") {
      throw new Error(`bad protocol: ${u.protocol}`);
    }
    return raw;
  } catch (err) {
    console.error("[profile] invalid adminPanelUrl; ignoring", err);
    return undefined;
  }
}

export function mount(options: MountOptions): MountHandle {
  const adminPanelUrl = validateAdminPanelUrl(options.adminPanelUrl);
  if (adminPanelUrl !== options.adminPanelUrl) {
    options = { ...options, adminPanelUrl };
  }

  const target = options.target ?? document.body;

  const host = document.createElement("div");
  host.setAttribute("data-antinvestor-profile", "");
  const theme = options.theme ?? "auto";
  host.setAttribute("data-theme", theme);
  // RTL: set dir on the host element when the locale is a right-to-left script.
  if (isRtl(options.locale)) {
    host.setAttribute("dir", "rtl");
  }
  target.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: "open" });
  const mountPoint = document.createElement("div");
  shadowRoot.appendChild(mountPoint);

  const root: Root = createRoot(mountPoint);
  root.render(
    <ShadowStyleProvider
      shadowRoot={shadowRoot}
      hostElement={host}
      externalFonts={options.externalFonts ?? false}
      tokens={options.tokens}
      css={options.css}
    >
      <ProfileWidgetRoot
        installationId={options.installationId}
        clientId={options.clientId}
        idpBaseUrl={options.idpBaseUrl}
        apiBaseUrl={options.apiBaseUrl}
        theme={theme}
        adminPanelUrl={options.adminPanelUrl}
        onLogout={options.onLogout}
        maxAvatarBytes={options.maxAvatarBytes}
        locale={options.locale}
        gravatar={options.gravatar}
        onError={options.onError}
        onAuthStateChange={options.onAuthStateChange}
        onSecurityEvent={options.onSecurityEvent}
        onMetric={options.onMetric}
      />
    </ShadowStyleProvider>,
  );

  return {
    unmount() {
      root.unmount();
      host.remove();
    },
  };
}
