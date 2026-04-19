import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createAuthRuntime, type AuthRuntime, type AuthState } from "@stawi/auth-runtime";

export interface AuthContextValue {
  authState: AuthState;
  runtime: AuthRuntime;
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

export function AuthProvider({ clientId, installationId, idpBaseUrl, apiBaseUrl, children }: AuthProviderProps) {
  const runtime = useMemo(
    () => createAuthRuntime({ clientId, installationId, idpBaseUrl, apiBaseUrl }),
    [clientId, installationId, idpBaseUrl, apiBaseUrl],
  );
  const [authState, setAuthState] = useState<AuthState>("initializing");

  useEffect(() => {
    const off = runtime.onAuthStateChange(setAuthState);
    return () => {
      off();
      runtime.destroy();
    };
  }, [runtime]);

  const ensureAuthenticated = useCallback(() => runtime.ensureAuthenticated(), [runtime]);
  const logout = useCallback(() => runtime.logout(), [runtime]);

  const value = useMemo<AuthContextValue>(
    () => ({ authState, runtime, ensureAuthenticated, logout }),
    [authState, runtime, ensureAuthenticated, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
