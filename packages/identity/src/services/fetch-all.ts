import type { PageCursor } from "../types.js";

export interface FetchAllOptions {
  /** Rows per request. Also the "was this page full?" threshold. */
  limit?: number;
  /** Safety cap. Hitting it returns `truncated: true` rather than looping. */
  maxPages?: number;
}

export interface FetchAllResult<T> {
  items: T[];
  /** True when the cap was reached, so `items` may be an incomplete view. */
  truncated: boolean;
}

const DEFAULT_LIMIT = 50;
const DEFAULT_MAX_PAGES = 20;

/**
 * Reads a `*Search` RPC to the end, one page at a time.
 *
 * The identity service parses `cursor.page` as a row offset, so pages are
 * requested as "0", "50", "100", … A page shorter than `limit` is the last
 * one. The `maxPages` cap keeps a mis-paging server from looping forever;
 * callers are expected to tell the user when it trips, since a truncated
 * list must not be read as the whole picture.
 */
export async function fetchAllPages<T>(
  fetchPage: (cursor: PageCursor) => Promise<T[]>,
  { limit = DEFAULT_LIMIT, maxPages = DEFAULT_MAX_PAGES }: FetchAllOptions = {},
): Promise<FetchAllResult<T>> {
  const items: T[] = [];
  for (let page = 0; page < maxPages; page++) {
    const batch = await fetchPage({ limit, page: String(page * limit) });
    items.push(...batch);
    if (batch.length < limit) return { items, truncated: false };
  }
  return { items, truncated: true };
}
