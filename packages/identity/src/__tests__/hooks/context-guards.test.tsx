import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAuth } from "../../hooks/use-auth.js";
import { useIdentity } from "../../hooks/use-identity.js";

describe("context guards", () => {
  it("useAuth requires an AuthProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useAuth())).toThrow(/AuthProvider/);
    spy.mockRestore();
  });

  it("useIdentity requires an IdentityProvider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useIdentity())).toThrow(/IdentityProvider/);
    spy.mockRestore();
  });
});
