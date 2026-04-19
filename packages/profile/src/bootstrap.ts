import { mount, type MountOptions } from "./index.js";
import type { ProfileWidgetThemedTokens } from "./themes/types.js";

/**
 * Parse a JSON attribute (e.g. data-tokens). On parse failure, logs an error
 * and returns undefined so the widget can still mount with defaults.
 */
function parseJsonAttr<T>(
  name: string,
  raw: string | null,
): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[profile] Failed to parse ${name} attribute as JSON`, err);
    return undefined;
  }
}

/**
 * Parse a boolean-flavoured attribute. Presence means true; an explicit
 * "false" / "0" value forces false; absence returns undefined so callers
 * can distinguish "not set" from "set to false".
 */
function parseBoolAttr(raw: string | null): boolean | undefined {
  if (raw === null) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "false" || v === "0") return false;
  return true;
}

function autoMount() {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script) {
    console.warn(
      "[profile] document.currentScript is null; auto-mount skipped. " +
        "Use programmatic mount() instead or avoid loading this script via module/import.",
    );
    return;
  }

  const installationId = script.getAttribute("data-installation-id");
  if (!installationId) {
    console.error(
      "[profile] Missing data-installation-id attribute on script tag.",
    );
    return;
  }

  const tokens = parseJsonAttr<ProfileWidgetThemedTokens>(
    "data-tokens",
    script.getAttribute("data-tokens"),
  );
  const locale = script.getAttribute("data-locale") ?? undefined;
  const externalFonts = parseBoolAttr(script.getAttribute("data-external-fonts"));
  const gravatar = parseBoolAttr(script.getAttribute("data-gravatar"));

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
    tokens,
    locale,
    externalFonts,
    gravatar,
  };

  // Mount when DOM is ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mount(options));
  } else {
    mount(options);
  }
}

autoMount();
