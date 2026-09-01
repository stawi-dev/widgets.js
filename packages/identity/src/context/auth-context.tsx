import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  createAuthRuntime,
  type AuthRuntime,
  type AuthState,
} from "@stawi/auth-runtime";
import { HooksContext } from "./hooks-context.js";
import { identityAuthScopes } from "../auth-scopes.js";

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
  logoutRedirectUri?: string;
  /**
   * Optional pre-constructed runtime. When provided, AuthProvider uses it
   * directly instead of creating one, and does NOT destroy it on unmount
   * (the host owns the lifecycle, and usually shares it with other widgets).
   */
  runtime?: AuthRuntime;
  children: ReactNode;
}

export function AuthProvider({
  clientId,
  installationId,
  idpBaseUrl,
  apiBaseUrl,
  logoutRedirectUri,
  runtime: providedRuntime,
  children,
}: AuthProviderProps) {
  const runtime = useMemo(
    () =>
      providedRuntime ??
      createAuthRuntime({
        clientId,
        installationId,
        idpBaseUrl,
        apiBaseUrl,
        logoutRedirectUri,
        scopes: [...identityAuthScopes],
      }),
    [
      providedRuntime,
      clientId,
      installationId,
      idpBaseUrl,
      apiBaseUrl,
      logoutRedirectUri,
    ],
  );
  const [authState, setAuthState] = useState<AuthState>("initializing");
  const hooks = useContext(HooksContext);

  useEffect(() => {
    const off = runtime.onAuthStateChange(setAuthState);
    return () => {
      off();
      if (!providedRuntime) {
        runtime.destroy();
      }
    };
  }, [runtime, providedRuntime]);

  useEffect(() => {
    if (!hooks.onAuthStateChange) return;
    return runtime.onAuthStateChange((s) => hooks.onAuthStateChange?.(s));
  }, [runtime, hooks]);

  useEffect(() => {
    if (!hooks.onSecurityEvent) return;
    return runtime.onSecurityEvent((e) => hooks.onSecurityEvent?.(e));
  }, [runtime, hooks]);

  const ensureAuthenticated = useCallback(
    () => runtime.ensureAuthenticated(),
    [runtime],
  );
  const logout = useCallback(
    () => runtime.logout({ redirectToIdP: true }),
    [runtime],
  );

  const value = useMemo<AuthContextValue>(
    () => ({ authState, runtime, ensureAuthenticated, logout }),
    [authState, runtime, ensureAuthenticated, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
