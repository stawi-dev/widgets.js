import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import type { AuthRuntime } from "@stawi/auth-runtime";
import { IdentityWidgetRoot } from "../src/components/IdentityWidgetRoot.js";
import { widgetStylesFor } from "../src/styles/styles.js";
import {
  commerceVocabulary,
  fintechVocabulary,
  generalVocabulary,
  manufacturingVocabulary,
} from "../src/vocabulary/index.js";
import type { IdentityVocabulary } from "../src/vocabulary/index.js";

// The widget normally lives in a shadow root; the playground renders it into
// the light DOM, so it takes the light-DOM build of the same stylesheet.
const playgroundCss = widgetStylesFor();

const PRESETS: Record<string, IdentityVocabulary> = {
  general: generalVocabulary,
  fintech: fintechVocabulary,
  commerce: commerceVocabulary,
  manufacturing: manufacturingVocabulary,
};

/** A signed-in runtime that never touches the network. */
const runtime = {
  version: "playground",
  getState: () => "authenticated" as const,
  onAuthStateChange: (cb: (s: "authenticated") => void) => {
    cb("authenticated");
    return () => {};
  },
  onSecurityEvent: () => () => {},
  ensureAuthenticated: async () => {},
  logout: async () => {},
  fetch: async () => ({}),
  upload: async () => ({}),
  getRoles: async () => [],
  getClaims: async () => ({}),
  prefetchDiscovery: async () => {},
  destroy: () => {},
} as unknown as AuthRuntime;

function Playground() {
  const [preset, setPreset] = useState("general");
  const [theme, setTheme] = useState<"light" | "dark" | "auto">("light");
  const [locale, setLocale] = useState("en");
  const [orgUnits, setOrgUnits] = useState(true);
  const [platformRoles, setPlatformRoles] = useState(true);

  const vocabulary = PRESETS[preset] ?? generalVocabulary;
  // Remount on every switch so gates and tab state start clean.
  const key = `${preset}-${locale}-${orgUnits}-${platformRoles}`;

  const features = useMemo(
    () => ({ orgUnits, platformRoles }),
    [orgUnits, platformRoles],
  );

  return (
    <>
      <style>{playgroundCss}</style>
      <div style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
          <label>
            Vocabulary{" "}
            <select value={preset} onChange={(e) => setPreset(e.target.value)}>
              {Object.keys(PRESETS).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Theme{" "}
            <select
              value={theme}
              onChange={(e) =>
                setTheme(e.target.value as "light" | "dark" | "auto")
              }
            >
              <option value="light">light</option>
              <option value="dark">dark</option>
              <option value="auto">auto</option>
            </select>
          </label>
          <label>
            Locale{" "}
            <select value={locale} onChange={(e) => setLocale(e.target.value)}>
              <option value="en">en</option>
              <option value="sw">sw</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={orgUnits}
              onChange={(e) => setOrgUnits(e.target.checked)}
            />{" "}
            orgUnits
          </label>
          <label>
            <input
              type="checkbox"
              checked={platformRoles}
              onChange={(e) => setPlatformRoles(e.target.checked)}
            />{" "}
            platformRoles
          </label>
        </div>

        <div style={{ border: "1px solid #ddd", borderRadius: 12 }}>
          <IdentityWidgetRoot
            key={key}
            runtime={runtime}
            apiBaseUrl="https://api.example.test/identity"
            vocabulary={vocabulary}
            features={features}
            locale={locale}
            theme={theme}
            onError={(err) => console.warn("[playground] onError", err)}
          />
        </div>
      </div>
    </>
  );
}

createRoot(document.getElementById("root")!).render(<Playground />);
