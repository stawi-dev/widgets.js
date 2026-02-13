import type { ProfileWidgetProps } from "../types.js";
import { AuthProvider } from "../context/auth-context.js";
import { AuthGate } from "./AuthGate.js";
import { ErrorBoundary } from "./ErrorBoundary.js";

export function ProfileWidgetRoot({
  installationId,
  clientId,
  idpBaseUrl,
  apiBaseUrl,
  adminPanelUrl,
  onLogout,
}: ProfileWidgetProps) {
  return (
    <ErrorBoundary>
      <AuthProvider
        clientId={clientId ?? installationId}
        installationId={installationId}
        idpBaseUrl={idpBaseUrl}
        apiBaseUrl={apiBaseUrl}
      >
        <AuthGate adminPanelUrl={adminPanelUrl} onLogout={onLogout} />
      </AuthProvider>
    </ErrorBoundary>
  );
}
