import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useProfile } from "../../hooks/use-profile.js";

describe("useProfile", () => {
  it("throws when used outside ProfileProvider", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useProfile())).toThrow(
      "useProfile must be used within a ProfileProvider",
    );
    vi.restoreAllMocks();
  });
});
