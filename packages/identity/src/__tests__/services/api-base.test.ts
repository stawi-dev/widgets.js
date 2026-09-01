import { describe, it, expect } from "vitest";
import {
  deriveProfileApiBaseUrl,
  deriveTenancyApiBaseUrl,
} from "../../services/api-base.js";

describe("deriveProfileApiBaseUrl", () => {
  it.each([
    ["https://api.stawi.org/identity", "https://api.stawi.org/profile"],
    ["https://api.stawi.org/identity/", "https://api.stawi.org/profile"],
    ["https://api.stawi.org/v1/identity", "https://api.stawi.org/v1/profile"],
    ["https://api.stawi.org", "https://api.stawi.org/profile"],
  ])("%s -> %s", (input, expected) => {
    expect(deriveProfileApiBaseUrl(input)).toBe(expected);
  });

  it("returns an unparseable base URL unchanged", () => {
    expect(deriveProfileApiBaseUrl("not a url")).toBe("not a url");
  });
});

describe("deriveTenancyApiBaseUrl", () => {
  it("swaps the last path segment for tenancy", () => {
    expect(deriveTenancyApiBaseUrl("https://api.stawi.org/identity")).toBe(
      "https://api.stawi.org/tenancy",
    );
  });

  it("ignores a trailing slash", () => {
    expect(deriveTenancyApiBaseUrl("https://api.stawi.org/identity/")).toBe(
      "https://api.stawi.org/tenancy",
    );
  });

  it("appends when the URL has no path", () => {
    expect(deriveTenancyApiBaseUrl("https://api.stawi.org")).toBe(
      "https://api.stawi.org/tenancy",
    );
    expect(deriveTenancyApiBaseUrl("https://api.stawi.org/")).toBe(
      "https://api.stawi.org/tenancy",
    );
  });

  it("keeps deeper path prefixes", () => {
    expect(
      deriveTenancyApiBaseUrl("https://api.example.com/api/v1/identity"),
    ).toBe("https://api.example.com/api/v1/tenancy");
  });

  it("handles a path-only base URL", () => {
    expect(deriveTenancyApiBaseUrl("/identity")).toBe("/tenancy");
  });
});
