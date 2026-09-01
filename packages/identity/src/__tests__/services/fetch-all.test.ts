import { describe, it, expect, vi } from "vitest";
import { fetchAllPages } from "../../services/fetch-all.js";
import type { PageCursor } from "../../types.js";

/** A fake service page: `n` rows numbered from the requested offset. */
function rows(offset: number, n: number): string[] {
  return Array.from({ length: n }, (_, i) => `r${offset + i}`);
}

describe("fetchAllPages", () => {
  it("keeps paging until a short page ends the stream", async () => {
    const pages = [rows(0, 2), rows(2, 2), rows(4, 1)];
    const fetchPage = vi.fn(async (cursor: PageCursor) => {
      const index = Number(cursor.page) / 2;
      return pages[index] ?? [];
    });

    const result = await fetchAllPages(fetchPage, { limit: 2 });

    expect(result.items).toEqual(["r0", "r1", "r2", "r3", "r4"]);
    expect(result.truncated).toBe(false);
    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(fetchPage.mock.calls.map(([c]) => c)).toEqual([
      { limit: 2, page: "0" },
      { limit: 2, page: "2" },
      { limit: 2, page: "4" },
    ]);
  });

  it("stops at the page cap and says the result is truncated", async () => {
    const fetchPage = vi.fn(async (cursor: PageCursor) =>
      rows(Number(cursor.page), 2),
    );

    const result = await fetchAllPages(fetchPage, { limit: 2, maxPages: 3 });

    expect(fetchPage).toHaveBeenCalledTimes(3);
    expect(result.items).toHaveLength(6);
    expect(result.truncated).toBe(true);
  });

  it("treats an empty first page as the whole result", async () => {
    const fetchPage = vi.fn(async () => [] as string[]);

    expect(await fetchAllPages(fetchPage)).toEqual({
      items: [],
      truncated: false,
    });
    expect(fetchPage).toHaveBeenCalledWith({ limit: 50, page: "0" });
  });
});
