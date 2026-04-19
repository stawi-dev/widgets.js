import { useCallback } from "react";
import { useProfile } from "../hooks/use-profile.js";
import { useT } from "../hooks/use-t.js";
import { languages } from "../data/languages.js";
import { LanguageIcon } from "./Icons.js";

export function LanguageSelector() {
  const { state, setLanguage } = useProfile();
  const t = useT();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setLanguage(e.target.value).catch(console.error);
    },
    [setLanguage],
  );

  const profile = state.profile;
  if (!profile) return null;

  return (
    <div className="aiw-field">
      <span className="aiw-field-label">
        <LanguageIcon />
        {t("settings.language")}
      </span>
      <select
        className="aiw-select"
        value={profile.language ?? "en"}
        onChange={handleChange}
        aria-label={t("settings.selectLanguage")}
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.name}
          </option>
        ))}
      </select>
    </div>
  );
}
