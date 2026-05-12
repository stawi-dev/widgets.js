export function openChannel(namespace: string): BroadcastChannel {
  return new BroadcastChannel(`stawi-auth:${namespace}`);
}

export async function withRefreshLock<T>(
  namespace: string,
  fn: () => Promise<T>,
): Promise<T> {
  const locks = (navigator as Navigator & {
    locks?: { request: (name: string, opts: { mode: "exclusive" | "shared" }, cb: () => Promise<T>) => Promise<T> };
  }).locks;
  if (!locks?.request) return fn();
  return locks.request(`stawi-auth:refresh:${namespace}`, { mode: "exclusive" }, fn);
}
