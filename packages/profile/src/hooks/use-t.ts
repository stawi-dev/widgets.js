import { useContext, useMemo } from "react";
import { HooksContext } from "../context/hooks-context.js";
import { translator, type Translator } from "../i18n/index.js";

/**
 * React hook returning a memoized translator bound to the current locale
 * from `HooksContext`. Re-computes only when the locale changes.
 */
export function useT(): Translator {
  const { locale } = useContext(HooksContext);
  return useMemo(() => translator(locale), [locale]);
}
