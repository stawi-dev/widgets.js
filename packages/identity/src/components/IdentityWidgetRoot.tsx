import { useCallback, useId, useMemo, useRef, useState } from "react";
import { AuthProvider } from "../context/auth-context.js";
import { HooksContext, type WidgetHooks } from "../context/hooks-context.js";
import { IdentityProvider, useIdentity } from "../context/identity-context.js";
import { useAuth } from "../hooks/use-auth.js";
import { useT } from "../hooks/use-t.js";
import { createIdentityClient } from "../services/identity-client.js";
import { createProfileResolver } from "../services/profile-resolver.js";
import {
  createTenancyClient,
  deriveTenancyApiBaseUrl,
} from "../services/tenancy-client.js";
import { AuthGate } from "./AuthGate.js";
import { ErrorBoundary } from "./ErrorBoundary.js";
import { OrganizationGate } from "./OrganizationGate.js";
import { MembersView } from "./members/MembersView.js";
import { TeamsView } from "./teams/TeamsView.js";
import { RolesView } from "./roles/RolesView.js";
import { UnitsView } from "./units/UnitsView.js";
import { themedTokenSheet } from "../themes/apply.js";
import type { IdentityView, IdentityWidgetProps } from "../types.js";

/**
 * `https://api.stawi.org/identity` → `https://api.stawi.org/profile`.
 * The two services sit side by side behind one gateway, so replacing the
 * last path segment is the right default. A URL we cannot parse is returned
 * unchanged rather than mangled.
 */
export function deriveProfileApiBaseUrl(apiBaseUrl: string): string {
  try {
    const url = new URL(apiBaseUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    segments.pop();
    segments.push("profile");
    url.pathname = `/${segments.join("/")}`;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return apiBaseUrl;
  }
}

/** The React entry point. Renders into the host's DOM — no shadow root. */
export function IdentityWidgetRoot(props: IdentityWidgetProps) {
  const {
    installationId,
    clientId,
    idpBaseUrl,
    apiBaseUrl,
    logoutRedirectUri,
    runtime,
    theme,
    tokens,
    css,
    locale,
    onError,
    onAuthStateChange,
    onMetric,
  } = props;

  const hooks = useMemo<WidgetHooks>(
    () => ({
      onError,
      onAuthStateChange,
      onMetric,
      locale: locale ?? "en",
    }),
    [onError, onAuthStateChange, onMetric, locale],
  );

  // One instance attribute per mounted root, so a host's tokens style only
  // this widget even with several on the page. `useId` returns colons, which
  // are legal inside a quoted attribute selector but not worth relying on.
  const instance = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const styleText = useMemo(() => {
    const scope = `[data-aiw-instance="${instance}"]`;
    const tokenCss = tokens
      ? themedTokenSheet(tokens, (s) =>
          s === "base" ? scope : `${scope}[data-theme="${s}"]`,
        )
      : "";
    // The host's raw `css` goes last so it wins over both the base
    // stylesheet and the token block.
    return `${tokenCss}${css ?? ""}`;
  }, [instance, tokens, css]);

  return (
    // The root element owns the design tokens: `:host` supplies them in the
    // shadow build, this element in the light-DOM build (see
    // `widgetStylesFor`). It is rendered in both so the class and the
    // `data-theme` hook are always where a host expects them.
    <div
      className="aiw-root"
      data-theme={theme ?? "auto"}
      data-aiw-instance={instance}
    >
      {styleText ? <style>{styleText}</style> : null}
      <ErrorBoundary onError={onError}>
        <HooksContext.Provider value={hooks}>
          <AuthProvider
            clientId={clientId ?? installationId ?? ""}
            installationId={installationId}
            idpBaseUrl={idpBaseUrl}
            apiBaseUrl={apiBaseUrl}
            logoutRedirectUri={logoutRedirectUri}
            runtime={runtime}
          >
            <AuthGate>
              <IdentityShell {...props} />
            </AuthGate>
          </AuthProvider>
        </HooksContext.Provider>
      </ErrorBoundary>
    </div>
  );
}

/**
 * Everything below the auth gate. Split out because the identity client and
 * the profile resolver need the runtime, which `AuthProvider` may have
 * created itself.
 */
function IdentityShell({
  apiBaseUrl,
  profileApiBaseUrl,
  tenancyApiBaseUrl,
  permissionModel,
  onMemberChange,
  organizationId,
  allowCreateOrganization = true,
  vocabulary,
  features,
  initialView,
}: IdentityWidgetProps) {
  const { runtime } = useAuth();

  const client = useMemo(
    () => createIdentityClient({ runtime, apiBaseUrl }),
    [runtime, apiBaseUrl],
  );

  const tenancy = useMemo(
    () =>
      createTenancyClient({
        runtime,
        apiBaseUrl: tenancyApiBaseUrl ?? deriveTenancyApiBaseUrl(apiBaseUrl),
      }),
    [runtime, tenancyApiBaseUrl, apiBaseUrl],
  );

  const profileResolver = useMemo(
    () =>
      createProfileResolver({
        runtime,
        profileApiBaseUrl:
          profileApiBaseUrl ?? deriveProfileApiBaseUrl(apiBaseUrl),
      }),
    [runtime, profileApiBaseUrl, apiBaseUrl],
  );

  return (
    <IdentityProvider
      client={client}
      tenancy={tenancy}
      permissionModel={permissionModel}
      onMemberChange={onMemberChange}
      profileResolver={profileResolver}
      vocabulary={vocabulary}
      features={features}
    >
      <OrganizationGate
        organizationId={organizationId}
        allowCreateOrganization={allowCreateOrganization}
      >
        <IdentityTabs
          initialView={initialView}
          pinned={Boolean(organizationId)}
        />
      </OrganizationGate>
    </IdentityProvider>
  );
}

interface TabDescriptor {
  view: IdentityView;
  label: string;
  render: () => React.ReactElement;
}

interface IdentityTabsProps {
  initialView?: IdentityView;
  /** True when the host pinned an organization, which hides the switcher. */
  pinned: boolean;
}

function IdentityTabs({ initialView, pinned }: IdentityTabsProps) {
  const { vocabulary, features, organization, setOrganization } = useIdentity();
  const t = useT();
  const baseId = useId();
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const tabs = useMemo<TabDescriptor[]>(() => {
    const labels = vocabulary.labels ?? {};
    const list: TabDescriptor[] = [
      {
        view: "members",
        label: labels.members ?? "Members",
        render: () => <MembersView />,
      },
      {
        view: "teams",
        label: labels.teams ?? "Teams",
        render: () => <TeamsView />,
      },
      {
        view: "roles",
        label: labels.roles ?? "Roles",
        render: () => <RolesView />,
      },
    ];
    if (features.orgUnits) {
      list.push({
        view: "units",
        label: labels.units ?? "Org units",
        render: () => <UnitsView />,
      });
    }
    return list;
  }, [vocabulary.labels, features.orgUnits]);

  // An `initialView` naming a flagged-off screen falls back to the first tab
  // rather than rendering nothing.
  const [active, setActive] = useState<IdentityView>(
    () => tabs.find((tab) => tab.view === initialView)?.view ?? tabs[0]!.view,
  );

  const activeIndex = Math.max(
    0,
    tabs.findIndex((tab) => tab.view === active),
  );
  const current = tabs[activeIndex]!;

  const focusTab = useCallback((index: number) => {
    const el = tabRefs.current[index];
    el?.focus();
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      const last = tabs.length - 1;
      let next: number | null = null;
      switch (e.key) {
        case "ArrowRight":
          next = activeIndex === last ? 0 : activeIndex + 1;
          break;
        case "ArrowLeft":
          next = activeIndex === 0 ? last : activeIndex - 1;
          break;
        case "Home":
          next = 0;
          break;
        case "End":
          next = last;
          break;
        default:
          return;
      }
      e.preventDefault();
      setActive(tabs[next]!.view);
      focusTab(next);
    },
    [activeIndex, focusTab, tabs],
  );

  return (
    <div className="aiw-views">
      <div className="aiw-header">
        <div className="aiw-header-org">
          <span className="aiw-header-title">{organization?.name}</span>
          <span className="aiw-header-code">{organization?.code}</span>
        </div>
        {!pinned && (
          <button
            type="button"
            className="aiw-link-button"
            onClick={() => setOrganization(null)}
          >
            {t("org.switch")}
          </button>
        )}
      </div>

      <div className="aiw-tabs" role="tablist" aria-label={t("nav.views")}>
        {tabs.map((tab, i) => (
          <button
            key={tab.view}
            ref={(el) => {
              tabRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${tab.view}`}
            className="aiw-tab"
            aria-selected={tab.view === active}
            aria-controls={`${baseId}-panel-${tab.view}`}
            tabIndex={tab.view === active ? 0 : -1}
            onClick={() => setActive(tab.view)}
            onKeyDown={handleKeyDown}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div
        className="aiw-tabpanel"
        role="tabpanel"
        id={`${baseId}-panel-${current.view}`}
        aria-labelledby={`${baseId}-tab-${current.view}`}
        tabIndex={0}
      >
        {current.render()}
      </div>
    </div>
  );
}
