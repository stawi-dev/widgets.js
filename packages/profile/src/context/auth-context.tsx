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
import { profileAuthScopes } from "../auth-scopes.js";

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
   * (the caller owns the lifecycle).
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
        scopes: [...profileAuthScopes],
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
      // Only destroy runtimes we created ourselves. If the caller supplied
      // the runtime, they own its lifecycle.
      if (!providedRuntime) {
        runtime.destroy();
      }
    };
  }, [runtime, providedRuntime]);

  // Forward auth state changes into the HooksContext so embedders can observe.
  useEffect(() => {
    if (!hooks.onAuthStateChange) return;
    return runtime.onAuthStateChange((s) => hooks.onAuthStateChange?.(s));
  }, [runtime, hooks]);

  // Forward security events.
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
