import en from "./en.json";
import sw from "./sw.json";

type Table = Record<string, string>;

const tables: Record<string, Table> = {
  en: en as Table,
  sw: sw as Table,
};

export type Translator = (key: string, vars?: Record<string, string>) => string;

/**
 * Returns a translator for the given BCP-47 locale. Falls back to the base
 * language ("sw-KE" → "sw"), then English, then the key itself, so a missing
 * translation degrades to readable text rather than an empty label.
 */
export function translator(locale?: string): Translator {
  const raw = (locale ?? "en").toLowerCase();
  const base = raw.split("-")[0] ?? "en";
  const primary = tables[raw] ?? tables[base] ?? tables.en!;
  const english = tables.en!;
  return (key, vars) => {
    let s = primary[key] ?? english[key] ?? key;
    if (vars) {
      for (const [vk, vv] of Object.entries(vars)) {
        s = s.replace(`{{${vk}}}`, vv);
      }
    }
    return s;
  };
}

/** True when the locale is written right-to-left. */
export function isRtl(locale?: string): boolean {
  const l = (locale ?? "en").toLowerCase().split("-")[0] ?? "";
  return l === "ar" || l === "he" || l === "fa" || l === "ur";
}
