import { describe, it, expect } from "vitest";
import { isRtl, translator } from "../i18n/index.js";

describe("translator", () => {
  it("uses the requested locale", () => {
    expect(translator("sw")("org.title")).toBe("Shirika");
  });

  it("falls back to the base language, then English, then the key", () => {
    expect(translator("sw-KE")("org.title")).toBe("Shirika");
    expect(translator("sw")("org.pickHint")).toBe(
      "You belong to more than one organization.",
    );
    expect(translator("fr")("org.title")).toBe("Organization");
    expect(translator()("nope.missing")).toBe("nope.missing");
  });

  it("interpolates variables", () => {
    expect(translator()("{{a}}/{{b}}", { a: "1", b: "2" })).toBe("1/2");
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
