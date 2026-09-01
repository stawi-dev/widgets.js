import { describe, it, expect } from "vitest";
import { isRtl, translator } from "../i18n/index.js";
import en from "../i18n/en.json";
import sw from "../i18n/sw.json";

describe("translator", () => {
  it("uses the requested locale", () => {
    expect(translator("sw")("org.title")).toBe("Shirika");
  });

  it("falls back to the base language, then English, then the key", () => {
    expect(translator("sw-KE")("org.title")).toBe("Shirika");
    expect(translator("fr")("org.title")).toBe("Organization");
    expect(translator()("nope.missing")).toBe("nope.missing");
  });

  it("interpolates variables", () => {
    expect(translator()("{{a}}/{{b}}", { a: "1", b: "2" })).toBe("1/2");
  });
});

describe("translation tables", () => {
  it("ship the same keys in every locale", () => {
    expect(Object.keys(sw).sort()).toEqual(Object.keys(en).sort());
  });

  it("translate every key rather than echoing English", () => {
    const t = translator("sw");
    const untranslated = Object.keys(en).filter(
      (key) => t(key) === (en as Record<string, string>)[key],
    );
    // Only keys whose Swahili really is the English word may repeat.
    expect(untranslated).toEqual([]);
  });
});

describe("isRtl", () => {
  it("detects right-to-left languages", () => {
    expect(isRtl("ar-EG")).toBe(true);
    expect(isRtl("he")).toBe(true);
    expect(isRtl("en")).toBe(false);
    expect(isRtl()).toBe(false);
  });
});
