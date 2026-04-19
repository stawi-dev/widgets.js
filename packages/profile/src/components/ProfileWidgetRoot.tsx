import { useMemo } from "react";
import type { ProfileWidgetProps } from "../types.js";
import { AuthProvider } from "../context/auth-context.js";
import { HooksContext, type WidgetHooks } from "../context/hooks-context.js";
import { AuthGate } from "./AuthGate.js";
import { ErrorBoundary } from "./ErrorBoundary.js";

export function ProfileWidgetRoot({
  installationId,
  clientId,
  idpBaseUrl,
  apiBaseUrl,
  adminPanelUrl,
  onLogout,
  locale,
  gravatar,
  onError,
  onAuthStateChange,
  onSecurityEvent,
  onMetric,
}: ProfileWidgetProps) {
  const hooks = useMemo<WidgetHooks>(
    () => ({
      onError,
      onAuthStateChange,
      onSecurityEvent,
      onMetric,
      gravatar: gravatar ?? false,
      locale: locale ?? "en",
    }),
    [onError, onAuthStateChange, onSecurityEvent, onMetric, gravatar, locale],
  );

  return (
    <ErrorBoundary>
      <HooksContext.Provider value={hooks}>
        <AuthProvider
          clientId={clientId ?? installationId}
          installationId={installationId}
          idpBaseUrl={idpBaseUrl}
          apiBaseUrl={apiBaseUrl}
        >
          <AuthGate adminPanelUrl={adminPanelUrl} onLogout={onLogout} />
        </AuthProvider>
      </HooksContext.Provider>
    </ErrorBoundary>
  );
}
