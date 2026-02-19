import { useCallback } from "react";
import { useProfile } from "../hooks/use-profile.js";
import { countries } from "../data/countries.js";
import { MapPinIcon } from "./Icons.js";

export function CountrySelector() {
  const { state, setCountry } = useProfile();

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
        Country
      </span>
      <select
        className="aiw-select"
        value={profile.country ?? ""}
        onChange={handleChange}
        aria-label="Select country"
      >
        <option value="" disabled>
          Select country
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
