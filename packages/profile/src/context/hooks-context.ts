import { createContext } from "react";
import type { AuthState, SecurityEvent } from "@stawi/auth-runtime";

export interface WidgetHooks {
  /** Error hook invoked for recoverable/UI errors. */
  onError?: (err: unknown) => void;
  /** Auth state change hook. */
  onAuthStateChange?: (s: AuthState) => void;
  /** Security event hook. */
  onSecurityEvent?: (e: SecurityEvent) => void;
  /** Metric hook. */
  onMetric?: (
    name: string,
    durationMs: number,
    tags: Record<string, string>,
  ) => void;
  /** Opt-in Gravatar fallback for avatars. */
  gravatar?: boolean;
  /** BCP-47 locale for i18n. */
  locale?: string;
}

export const HooksContext = createContext<WidgetHooks>({});
