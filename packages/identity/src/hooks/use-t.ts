import { useContext, useMemo } from "react";
import { HooksContext } from "../context/hooks-context.js";
import { translator, type Translator } from "../i18n/index.js";

/** Memoized translator bound to the host locale from `HooksContext`. */
export function useT(): Translator {
  const { locale } = useContext(HooksContext);
  return useMemo(() => translator(locale), [locale]);
}
