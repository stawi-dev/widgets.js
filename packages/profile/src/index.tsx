import { createRoot, type Root } from "react-dom/client";
import { ProfileWidgetRoot } from "./components/ProfileWidgetRoot.js";
import { ShadowStyleProvider } from "./shadow-host.js";
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

export function mount(options: MountOptions): MountHandle {
  // Validate adminPanelUrl protocol early; strip if invalid.
  if (options.adminPanelUrl) {
    try {
      const u = new URL(options.adminPanelUrl);
      if (!(u.protocol === "http:" || u.protocol === "https:")) {
        throw new Error("bad protocol");
      }
    } catch (err) {
      console.error("[profile] invalid adminPanelUrl; ignoring", err);
      options = { ...options, adminPanelUrl: undefined };
    }
  }

  const target = options.target ?? document.body;

  const host = document.createElement("div");
  host.setAttribute("data-antinvestor-profile", "");
  const theme = options.theme ?? "auto";
  host.setAttribute("data-theme", theme);
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
