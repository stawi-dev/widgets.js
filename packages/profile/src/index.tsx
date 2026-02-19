import { createRoot, type Root } from "react-dom/client";
import { ProfileWidgetRoot } from "./components/ProfileWidgetRoot.js";
import { ShadowStyleProvider } from "./shadow-host.js";
import type { ProfileWidgetProps } from "./types.js";

export type { ProfileWidgetProps, ProfileData, ContactMethod } from "./types.js";
export { ProfileWidgetRoot } from "./components/ProfileWidgetRoot.js";

export interface MountOptions extends ProfileWidgetProps {
  target?: HTMLElement;
}

export interface MountHandle {
  unmount: () => void;
}

export function mount(options: MountOptions): MountHandle {
  const target = options.target ?? document.body;

  const host = document.createElement("div");
  host.setAttribute("data-antinvestor-profile", "");
  if (options.theme) {
    host.setAttribute("data-theme", options.theme);
  }
  target.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: "open" });
  const mountPoint = document.createElement("div");
  shadowRoot.appendChild(mountPoint);

  const root: Root = createRoot(mountPoint);
  root.render(
    <ShadowStyleProvider shadowRoot={shadowRoot}>
      <ProfileWidgetRoot
        installationId={options.installationId}
        clientId={options.clientId}
        idpBaseUrl={options.idpBaseUrl}
        apiBaseUrl={options.apiBaseUrl}
        theme={options.theme}
        adminPanelUrl={options.adminPanelUrl}
        onLogout={options.onLogout}
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
