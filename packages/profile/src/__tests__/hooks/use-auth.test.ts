import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAuth } from "../../hooks/use-auth.js";

describe("useAuth", () => {
  it("throws when used outside AuthProvider", () => {
    // Suppress React error boundary console output
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(
      "useAuth must be used within an AuthProvider",
    );
    vi.restoreAllMocks();
  });
});
