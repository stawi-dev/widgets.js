import en from "./en.json";
import fr from "./fr.json";
import sw from "./sw.json";
import ar from "./ar.json";

type Table = Record<string, string>;

const tables: Record<string, Table> = {
  en: en as Table,
  fr: fr as Table,
  sw: sw as Table,
  ar: ar as Table,
};

export type Translator = (key: string, vars?: Record<string, string>) => string;

/**
 * Returns a translator function for the given BCP-47 locale.
 * Falls back to the base language (e.g. "fr-CA" → "fr") and then to English.
 * Missing keys fall through to the English table, and finally to the key itself.
 */
export function translator(locale?: string): Translator {
  const raw = (locale ?? "en").toLowerCase();
  const base = raw.split("-")[0] ?? "en";
  const primary = tables[raw] ?? tables[base] ?? tables.en!;
  const english = tables.en!;
  return (key: string, vars?: Record<string, string>): string => {
    let s = primary[key] ?? english[key] ?? key;
    if (vars) {
      for (const [vk, vv] of Object.entries(vars)) {
        s = s.replace(`{{${vk}}}`, vv);
      }
    }
    return s;
  };
}

/**
 * Returns true when the locale is a right-to-left script (Arabic, Hebrew,
 * Persian/Farsi, Urdu). Defaults to false for unknown locales.
 */
export function isRtl(locale?: string): boolean {
  const l = (locale ?? "en").toLowerCase().split("-")[0] ?? "";
  return l === "ar" || l === "he" || l === "fa" || l === "ur";
}
