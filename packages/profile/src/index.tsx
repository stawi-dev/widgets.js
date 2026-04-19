import { createRoot, type Root } from "react-dom/client";
import { createAuthRuntime, type AuthRuntime, type AuthState } from "@stawi/auth-runtime";
import { ProfileWidgetRoot } from "./components/ProfileWidgetRoot.js";
import { ShadowStyleProvider } from "./shadow-host.js";
import { isRtl } from "./i18n/index.js";
import type { ProfileWidgetProps } from "./types.js";

// Injected by tsup `define`. Falls back to "dev" when running from source.
declare const __STAWI_PROFILE_VERSION__: string | undefined;

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
  /** Pre-constructed AuthRuntime to reuse instead of the widget
   *  creating one internally. Passing your own runtime lets other
   *  islands / API clients in the host page share the same token
   *  store — otherwise the widget's runtime and your module-level
   *  singleton end up as two separate instances with unsynchronised
   *  auth state. The widget still owns the lifecycle: unmount()
   *  will call destroy() on this runtime. */
  runtime?: AuthRuntime;
}

export interface MountHandle {
  /** Build version of @stawi/profile. */
  readonly version: string;
  /** Current auth state from the underlying runtime. */
  getAuthState(): AuthState;
  /** Warm the OIDC discovery cache without triggering a login. */
  prefetchDiscovery(): Promise<void>;
  /** Unmount the widget and destroy the runtime. */
  unmount(): void;
}

const PROFILE_VERSION =
  typeof __STAWI_PROFILE_VERSION__ === "string"
    ? __STAWI_PROFILE_VERSION__
    : "dev";

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

  // Pre-construct the runtime at mount() scope so the MountHandle can call
  // into it (getAuthState / prefetchDiscovery) without needing to reach
  // through React internals. Callers may supply their own runtime —
  // useful when an embedder (a host page with multiple widgets or a
  // dedicated singleton for API calls) wants shared token state.
  const ownsRuntime = options.runtime === undefined;
  const runtime = options.runtime ?? createAuthRuntime({
    clientId: options.clientId ?? options.installationId,
    installationId: options.installationId,
    idpBaseUrl: options.idpBaseUrl,
    apiBaseUrl: options.apiBaseUrl,
  });

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
        runtime={runtime}
      />
    </ShadowStyleProvider>,
  );

  return {
    version: PROFILE_VERSION,
    getAuthState() {
      return runtime.getState();
    },
    prefetchDiscovery() {
      return runtime.prefetchDiscovery();
    },
    unmount() {
      root.unmount();
      host.remove();
      // Only destroy a runtime we created ourselves. If the caller
      // passed one in, they own its lifecycle — destroying it from
      // under them would break other components sharing the same
      // token store.
      if (ownsRuntime) runtime.destroy();
    },
  };
}
