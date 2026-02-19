import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  getAuthRuntime,
  type AuthState,
  type AuthRuntime,
  ApiClient,
} from "@stawi/auth-runtime";

export interface AuthContextValue {
  authState: AuthState;
  runtime: AuthRuntime & { getApiClient(): ApiClient };
  ensureAuthenticated: () => Promise<void>;
  logout: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  clientId: string;
  installationId?: string;
  idpBaseUrl?: string;
  apiBaseUrl?: string;
  children: ReactNode;
}

export function AuthProvider({
  clientId,
  installationId,
  idpBaseUrl,
  apiBaseUrl,
  children,
}: AuthProviderProps) {
  const runtime = useMemo(
    () =>
      getAuthRuntime({
        clientId,
        installationId,
        idpBaseUrl,
        apiBaseUrl,
      }),
    [clientId, installationId, idpBaseUrl, apiBaseUrl],
  );

  const [authState, setAuthState] = useState<AuthState>(runtime.getState());

  useEffect(() => {
    return runtime.onAuthStateChange(setAuthState);
  }, [runtime]);

  const ensureAuthenticated = useCallback(
    () => runtime.ensureAuthenticated(),
    [runtime],
  );

  const logout = useCallback(() => runtime.logout(), [runtime]);

  const value = useMemo<AuthContextValue>(
    () => ({ authState, runtime, ensureAuthenticated, logout }),
    [authState, runtime, ensureAuthenticated, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
