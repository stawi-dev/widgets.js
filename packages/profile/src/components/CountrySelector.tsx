import { useCallback } from "react";
import { useProfile } from "../hooks/use-profile.js";
import { useT } from "../hooks/use-t.js";
import { countries } from "../data/countries.js";
import { MapPinIcon } from "./Icons.js";

export function CountrySelector() {
  const { state, setCountry } = useProfile();
  const t = useT();

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLSelectElement>) => {
      setCountry(e.target.value).catch(console.error);
    },
    [setCountry],
  );

  const profile = state.profile;
  if (!profile) return null;

  return (
    <div className="aiw-field">
      <span className="aiw-field-label">
        <MapPinIcon />
        {t("settings.country")}
      </span>
      <select
        className="aiw-select"
        value={profile.country ?? ""}
        onChange={handleChange}
        aria-label={t("settings.selectCountry")}
      >
        <option value="" disabled>
          {t("settings.selectCountry")}
        </option>
        {countries.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}
