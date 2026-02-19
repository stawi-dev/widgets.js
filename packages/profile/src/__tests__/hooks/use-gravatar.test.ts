import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { useGravatarUrl } from "../../hooks/use-gravatar.js";

// Known SHA-256 of "test@example.com"
const KNOWN_HASH =
  "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b";

beforeEach(() => {
  // Ensure crypto.subtle is available (jsdom provides it)
  if (!globalThis.crypto?.subtle) {
    vi.stubGlobal("crypto", {
      subtle: {
        digest: vi.fn().mockImplementation(async (_algo: string, data: BufferSource) => {
          // Minimal mock — returns zeroed buffer
          return new ArrayBuffer((data as Uint8Array).byteLength);
        }),
      },
    });
  }
});

describe("useGravatarUrl", () => {
  it("returns null initially then resolves to a gravatar URL", async () => {
    const { result } = renderHook(() =>
      useGravatarUrl("test@example.com", 80),
    );

    // Synchronously null on first render
    expect(result.current).toBeNull();

    // After async hash, should be a gravatar URL
    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    expect(result.current).toBe(
      `https://www.gravatar.com/avatar/${KNOWN_HASH}?s=80&d=retro`,
    );
  });

  it("returns null when email is undefined", () => {
    const { result } = renderHook(() =>
      useGravatarUrl(undefined, 80),
    );
    expect(result.current).toBeNull();
  });

  it("returns null when email is empty string", () => {
    const { result } = renderHook(() =>
      useGravatarUrl("", 80),
    );
    expect(result.current).toBeNull();
  });

  it("normalizes email to lowercase and trimmed", async () => {
    const { result } = renderHook(() =>
      useGravatarUrl("  Test@Example.COM  ", 40),
    );

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    // Should produce the same hash as "test@example.com"
    expect(result.current).toBe(
      `https://www.gravatar.com/avatar/${KNOWN_HASH}?s=40&d=retro`,
    );
  });

  it("updates URL when email changes", async () => {
    const { result, rerender } = renderHook(
      ({ email }) => useGravatarUrl(email, 80),
      { initialProps: { email: "test@example.com" } },
    );

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    const firstUrl = result.current;

    rerender({ email: "other@example.com" });

    await waitFor(() => {
      expect(result.current).not.toBe(firstUrl);
    });

    expect(result.current).toContain("https://www.gravatar.com/avatar/");
    expect(result.current).toContain("?s=80&d=retro");
  });
});
