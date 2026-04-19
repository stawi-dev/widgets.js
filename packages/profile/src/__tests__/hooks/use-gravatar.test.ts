import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { useGravatarUrl } from "../../hooks/use-gravatar.js";
import {
  HooksContext,
  type WidgetHooks,
} from "../../context/hooks-context.js";

// Known SHA-256 of "test@example.com"
const KNOWN_HASH =
  "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b";

function wrapperFor(hooks: WidgetHooks) {
  return ({ children }: { children: ReactNode }) =>
    createElement(HooksContext.Provider, { value: hooks }, children);
}

beforeEach(() => {
  if (!globalThis.crypto?.subtle) {
    vi.stubGlobal("crypto", {
      subtle: {
        digest: vi.fn().mockImplementation(async (_algo: string, data: BufferSource) => {
          return new ArrayBuffer((data as Uint8Array).byteLength);
        }),
      },
    });
  }
});

describe("useGravatarUrl", () => {
  it("returns null when gravatar is not enabled, even with a valid email", () => {
    const { result } = renderHook(
      () => useGravatarUrl("test@example.com", 80),
      { wrapper: wrapperFor({ gravatar: false }) },
    );
    expect(result.current).toBeNull();
  });

  it("returns null initially then resolves when gravatar is enabled", async () => {
    const { result } = renderHook(
      () => useGravatarUrl("test@example.com", 80),
      { wrapper: wrapperFor({ gravatar: true }) },
    );

    expect(result.current).toBeNull();

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    expect(result.current).toBe(
      `https://www.gravatar.com/avatar/${KNOWN_HASH}?s=80&d=404`,
    );
  });

  it("returns null when email is undefined", () => {
    const { result } = renderHook(() => useGravatarUrl(undefined, 80), {
      wrapper: wrapperFor({ gravatar: true }),
    });
    expect(result.current).toBeNull();
  });

  it("returns null when email is empty string", () => {
    const { result } = renderHook(() => useGravatarUrl("", 80), {
      wrapper: wrapperFor({ gravatar: true }),
    });
    expect(result.current).toBeNull();
  });

  it("normalizes email to lowercase and trimmed", async () => {
    const { result } = renderHook(
      () => useGravatarUrl("  Test@Example.COM  ", 40),
      { wrapper: wrapperFor({ gravatar: true }) },
    );

    await waitFor(() => {
      expect(result.current).not.toBeNull();
    });

    expect(result.current).toBe(
      `https://www.gravatar.com/avatar/${KNOWN_HASH}?s=40&d=404`,
    );
  });

  it("updates URL when email changes", async () => {
    const { result, rerender } = renderHook(
      ({ email }) => useGravatarUrl(email, 80),
      {
        initialProps: { email: "test@example.com" },
        wrapper: wrapperFor({ gravatar: true }),
      },
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
    expect(result.current).toContain("?s=80&d=404");
  });
});
