import { mount, type MountOptions } from "./index.js";

function autoMount() {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script) return;

  const installationId = script.getAttribute("data-installation-id");
  if (!installationId) {
    console.error(
      "[profile] Missing data-installation-id attribute on script tag.",
    );
    return;
  }

  const options: MountOptions = {
    installationId,
    clientId: script.getAttribute("data-client-id") ?? undefined,
    idpBaseUrl: script.getAttribute("data-idp-base-url") ?? undefined,
    apiBaseUrl: script.getAttribute("data-api-base-url") ?? undefined,
    theme:
      (script.getAttribute("data-theme") as MountOptions["theme"]) ??
      "auto",
    adminPanelUrl:
      script.getAttribute("data-admin-panel-url") ?? undefined,
  };

  // Mount when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mount(options));
  } else {
    mount(options);
  }
}

autoMount();
