import { useCallback, useEffect, useState } from "react";

export interface AsyncResult<T> {
  data: T | null;
  error: unknown;
  loading: boolean;
  /** Re-runs the async function, discarding any in-flight result. */
  reload: () => void;
}

/**
 * Runs `fn` whenever `deps` change and tracks its outcome. Results from a
 * superseded or unmounted run are dropped, so a slow response can never
 * overwrite a newer one.
 */
export function useAsync<T>(
  fn: () => Promise<T>,
  deps: unknown[],
): AsyncResult<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let live = true;
    setLoading(true);
    setError(null);
    fn().then(
      (value) => {
        if (!live) return;
        setData(value);
        setLoading(false);
      },
      (err: unknown) => {
        if (!live) return;
        setError(err);
        setData(null);
        setLoading(false);
      },
    );
    return () => {
      live = false;
    };
    // The caller owns the dependency list; `fn` is intentionally not part of
    // it so inline closures don't re-trigger the effect on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  return { data, error, loading, reload };
}
