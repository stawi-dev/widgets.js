export function openChannel(namespace: string): BroadcastChannel {
  return new BroadcastChannel(`stawi-auth:${namespace}`);
}

export async function withRefreshLock<T>(
  namespace: string,
  fn: () => Promise<T>,
): Promise<T> {
  const locks = (navigator as any).locks;
  if (!locks?.request) return fn();
  return locks.request(`stawi-auth:refresh:${namespace}`, { mode: "exclusive" }, fn);
}
