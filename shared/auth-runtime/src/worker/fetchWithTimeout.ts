import { AuthError } from "../shared/errors.js";

export async function fetchT(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const ctrl = new AbortController();
  const existing = init.signal;
  if (existing) {
    if (existing.aborted) ctrl.abort();
    else existing.addEventListener("abort", () => ctrl.abort(), { once: true });
  }
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (err) {
    if ((err as Error).name === "AbortError" || ctrl.signal.aborted) {
      throw new AuthError("NETWORK_TIMEOUT", `request exceeded ${timeoutMs}ms`, err);
    }
    throw new AuthError("NETWORK_ERROR", "fetch failed", err);
  } finally {
    clearTimeout(timer);
  }
}
