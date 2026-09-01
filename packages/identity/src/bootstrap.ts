import { mount, type MountOptions } from "./index.js";
import {
  commerceVocabulary,
  fintechVocabulary,
  generalVocabulary,
  manufacturingVocabulary,
  mergeVocabulary,
  type IdentityVocabulary,
} from "./vocabulary/index.js";
import type { IdentityWidgetThemedTokens } from "./themes/types.js";
import type { IdentityView } from "./types.js";
import type { PermissionModel } from "./permissions/types.js";

// Re-exported so the IIFE global (`window.StawiIdentity`) carries the whole
// public API — `mount`, the vocabulary presets, the data layer — not just
// the auto-mount side effect.
export * from "./index.js";

const PRESETS: Record<string, IdentityVocabulary> = {
  general: generalVocabulary,
  fintech: fintechVocabulary,
  commerce: commerceVocabulary,
  manufacturing: manufacturingVocabulary,
};

/** Parses a JSON attribute; a malformed value is logged and dropped. */
function parseJsonAttr<T>(name: string, raw: string | null): T | undefined {
  if (!raw) return undefined;
  try {
    return JSON.parse(raw) as T;
  } catch (err) {
    console.error(`[identity] Failed to parse ${name} attribute as JSON`, err);
    return undefined;
  }
}

/**
 * Presence means true; an explicit "false"/"0" means false; absence returns
 * undefined so the widget's own default applies.
 */
function parseBoolAttr(raw: string | null): boolean | undefined {
  if (raw === null) return undefined;
  const v = raw.trim().toLowerCase();
  if (v === "false" || v === "0") return false;
  return true;
}

/**
 * `data-vocabulary` is either a preset name (`general`, `fintech`,
 * `commerce`, `manufacturing`) or a JSON object merged over the general
 * preset. Anything else is logged and ignored, leaving the default.
 */
export function parseVocabularyAttr(
  raw: string | null,
): IdentityVocabulary | undefined {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("{")) {
    const preset = Object.prototype.hasOwnProperty.call(PRESETS, trimmed)
      ? PRESETS[trimmed]
      : undefined;
    if (!preset) {
      console.error(
        `[identity] Unknown data-vocabulary preset; expected one of ${Object.keys(
          PRESETS,
        ).join(", ")} or a JSON object`,
        trimmed,
      );
      return undefined;
    }
    return preset;
  }
  const override = parseJsonAttr<Partial<IdentityVocabulary>>(
    "data-vocabulary",
    trimmed,
  );
  return override ? mergeVocabulary(generalVocabulary, override) : undefined;
}

function autoMount() {
  const script = document.currentScript as HTMLScriptElement | null;
  if (!script) {
    console.warn(
      "[identity] document.currentScript is null; auto-mount skipped. " +
        "Use programmatic mount() instead or avoid loading this script via module/import.",
    );
    return;
  }

  const apiBaseUrl = script.getAttribute("data-api-base-url");
  if (!apiBaseUrl) {
    console.error(
      "[identity] Missing data-api-base-url attribute on script tag.",
    );
    return;
  }

  const options: MountOptions = {
    apiBaseUrl,
    installationId: script.getAttribute("data-installation-id") ?? undefined,
    clientId: script.getAttribute("data-client-id") ?? undefined,
    idpBaseUrl: script.getAttribute("data-idp-base-url") ?? undefined,
    logoutRedirectUri:
      script.getAttribute("data-logout-redirect-uri") ?? undefined,
    profileApiBaseUrl:
      script.getAttribute("data-profile-api-base-url") ?? undefined,
    tenancyApiBaseUrl:
      script.getAttribute("data-tenancy-api-base-url") ?? undefined,
    permissionModel: parseJsonAttr<PermissionModel>(
      "data-permission-model",
      script.getAttribute("data-permission-model"),
    ),
    organizationId: script.getAttribute("data-organization-id") ?? undefined,
    allowCreateOrganization: parseBoolAttr(
      script.getAttribute("data-allow-create-organization"),
    ),
    vocabulary: parseVocabularyAttr(script.getAttribute("data-vocabulary")),
    features: parseJsonAttr<MountOptions["features"]>(
      "data-features",
      script.getAttribute("data-features"),
    ),
    tokens: parseJsonAttr<IdentityWidgetThemedTokens>(
      "data-tokens",
      script.getAttribute("data-tokens"),
    ),
    css: script.getAttribute("data-css") ?? undefined,
    theme:
      (script.getAttribute("data-theme") as MountOptions["theme"]) ?? "auto",
    locale: script.getAttribute("data-locale") ?? undefined,
    initialView:
      (script.getAttribute("data-initial-view") as IdentityView | null) ??
      undefined,
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => mount(options));
  } else {
    mount(options);
  }
}

autoMount();
