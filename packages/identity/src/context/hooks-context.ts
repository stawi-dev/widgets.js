import { createContext } from "react";
import type { AuthState, SecurityEvent } from "@stawi/auth-runtime";

/** Host-supplied callbacks and presentation preferences for the widget. */
export interface WidgetHooks {
  /** Invoked for recoverable errors that the UI has already surfaced. */
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
  /** BCP-47 locale for i18n. */
  locale?: string;
}

export const HooksContext = createContext<WidgetHooks>({});
