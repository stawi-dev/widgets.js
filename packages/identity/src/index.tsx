import { createRoot, type Root } from "react-dom/client";
import {
  createAuthRuntime,
  type AuthRuntime,
  type AuthState,
} from "@stawi/auth-runtime";
import { IdentityWidgetRoot } from "./components/IdentityWidgetRoot.js";
import { ShadowStyleProvider } from "./shadow-host.js";
import { isRtl } from "./i18n/index.js";
import { identityAuthScopes } from "./auth-scopes.js";
import type { IdentityWidgetProps } from "./types.js";

// Injected by tsup `define`. Falls back to "dev" when running from source.
declare const __STAWI_IDENTITY_VERSION__: string | undefined;

const IDENTITY_VERSION =
  typeof __STAWI_IDENTITY_VERSION__ === "string"
    ? __STAWI_IDENTITY_VERSION__
    : "dev";

export interface MountOptions extends IdentityWidgetProps {
  /** Where to append the widget host. Defaults to `document.body`. */
  target?: HTMLElement;
  /**
   * A pre-built AuthRuntime to reuse instead of the widget creating one.
   * Sharing the host's runtime keeps every island and API client on the
   * same token store. A runtime passed in here is *not* destroyed by
   * `unmount()` — the host owns its lifecycle.
   */
  runtime?: AuthRuntime;
}

export interface MountHandle {
  /** Build version of @stawi/identity. */
  readonly version: string;
  /** Current auth state from the underlying runtime. */
  getAuthState(): AuthState;
  /** Remove the widget; destroys the runtime only if the widget made it. */
  unmount(): void;
}

/** Mounts the identity widget as a shadow-DOM island. */
export function mount(options: MountOptions): MountHandle {
  const target = options.target ?? document.body;

  const host = document.createElement("div");
  host.setAttribute("data-antinvestor-identity", "");
  const theme = options.theme ?? "auto";
  host.setAttribute("data-theme", theme);
  if (isRtl(options.locale)) host.setAttribute("dir", "rtl");
  target.appendChild(host);

  const shadowRoot = host.attachShadow({ mode: "open" });
  const mountPoint = document.createElement("div");
  shadowRoot.appendChild(mountPoint);

  // Built at mount() scope so MountHandle can reach the runtime without
  // going through React internals.
  const ownsRuntime = options.runtime === undefined;
  const clientId = options.clientId ?? options.installationId;
  if (ownsRuntime && !clientId) {
    throw new Error(
      "[identity] mount() needs a `runtime`, or a `clientId` / " +
        "`installationId` to build one from.",
    );
  }
  const runtime =
    options.runtime ??
    createAuthRuntime({
      clientId: clientId!,
      installationId: options.installationId,
      idpBaseUrl: options.idpBaseUrl,
      apiBaseUrl: options.apiBaseUrl,
      logoutRedirectUri: options.logoutRedirectUri,
      scopes: [...identityAuthScopes],
    });

  const root: Root = createRoot(mountPoint);
  root.render(
    <ShadowStyleProvider
      shadowRoot={shadowRoot}
      hostElement={host}
      tokens={options.tokens}
      css={options.css}
    >
      <IdentityWidgetRoot {...options} theme={theme} runtime={runtime} />
    </ShadowStyleProvider>,
  );

  return {
    version: IDENTITY_VERSION,
    getAuthState() {
      return runtime.getState();
    },
    unmount() {
      root.unmount();
      host.remove();
      // Destroying a host-supplied runtime would break every other island
      // sharing the same token store, so only an owned one is torn down.
      if (ownsRuntime) runtime.destroy();
    },
  };
}

export { IdentityWidgetRoot } from "./components/IdentityWidgetRoot.js";
/**
 * `widgetStyles` is the shadow-DOM build (tokens on `:host`).
 * `widgetStylesFor()` is the light-DOM build for React hosts rendering
 * `<IdentityWidgetRoot />` without a shadow root.
 */
export { widgetStyles, widgetStylesFor } from "./styles/styles.js";
export type {
  IdentityWidgetProps,
  IdentityView,
  AccessRoleAssignment,
  AccessScopeType,
  InternalTeam,
  Organization,
  OrgUnit,
  OrgUnitType,
  OrganizationType,
  PageCursor,
  State,
  TeamMembership,
  WorkforceMember,
} from "./types.js";

export type {
  IdentityWidgetTokens,
  IdentityWidgetThemedTokens,
} from "./themes/types.js";
export {
  claudeDark,
  claudeLight,
  neutralLight,
  highContrast,
} from "./themes/presets.js";

export { createIdentityClient } from "./services/identity-client.js";
export type {
  IdentityClient,
  IdentityClientDeps,
  OrganizationQuery,
  OrgUnitQuery,
  WorkforceMemberQuery,
  InternalTeamQuery,
  TeamMembershipQuery,
  AccessRoleAssignmentQuery,
} from "./services/identity-client.js";
export { decodeConnectStream } from "./services/connect-stream.js";
export { createProfileResolver } from "./services/profile-resolver.js";
export type {
  ProfileResolver,
  ProfileResolverDeps,
  ProfileSummary,
} from "./services/profile-resolver.js";
export { IdentityError } from "./services/errors.js";
export {
  generalVocabulary,
  fintechVocabulary,
  commerceVocabulary,
  manufacturingVocabulary,
  mergeVocabulary,
} from "./vocabulary/index.js";
export type {
  IdentityVocabulary,
  VocabularyOption,
  RoleKeyOption,
} from "./vocabulary/index.js";
