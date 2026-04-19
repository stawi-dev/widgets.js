import { describe, it, expect } from "vitest";
import { translator, isRtl } from "../../i18n/index.js";

describe("translator", () => {
  it("returns English strings by default", () => {
    const t = translator();
    expect(t("auth.login")).toBe("Login");
    expect(t("auth.signOut")).toBe("Sign Out");
  });

  it("returns French strings when locale is fr", () => {
    const t = translator("fr");
    expect(t("auth.login")).toBe("Connexion");
    expect(t("auth.signOut")).toBe("Déconnexion");
  });

  it("falls back to base language for regional variants", () => {
    const t = translator("fr-CA");
    expect(t("auth.login")).toBe("Connexion");
  });

  it("falls back to English for missing keys in a partial locale", () => {
    const t = translator("sw");
    // sw.json only has a few keys; missing ones should fall through to en.
    expect(t("auth.login")).toBe("Ingia");
    expect(t("contacts.title")).toBe("Contacts");
  });

  it("falls back to English when locale is unknown", () => {
    const t = translator("xx");
    expect(t("auth.login")).toBe("Login");
  });

  it("returns the key itself when missing everywhere", () => {
    const t = translator();
    expect(t("no.such.key")).toBe("no.such.key");
  });

  it("substitutes {{var}} placeholders", () => {
    const t = translator();
    expect(t("verify.pendingBanner", { value: "a@b.com" })).toBe(
      "Verify a@b.com",
    );
  });
});

describe("isRtl", () => {
  it("returns true for Arabic", () => {
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("ar-EG")).toBe(true);
  });
  it("returns true for Hebrew / Farsi / Urdu", () => {
    expect(isRtl("he")).toBe(true);
    expect(isRtl("fa")).toBe(true);
    expect(isRtl("ur")).toBe(true);
  });
  it("returns false for LTR languages", () => {
    expect(isRtl("en")).toBe(false);
    expect(isRtl("fr")).toBe(false);
    expect(isRtl("sw")).toBe(false);
    expect(isRtl(undefined)).toBe(false);
  });
});
