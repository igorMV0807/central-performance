import "server-only";

type CacheEntry = {
  expiresAt: number;
  value: Promise<unknown>;
};

const globalCache = globalThis as typeof globalThis & {
  __performanceDashboardCache?: Map<string, CacheEntry>;
};

const cache =
  globalCache.__performanceDashboardCache || new Map<string, CacheEntry>();

globalCache.__performanceDashboardCache = cache;

export function cached<T>(key: string, ttlMs: number, loader: () => Promise<T>) {
  const now = Date.now();
  const current = cache.get(key);
  if (current && current.expiresAt > now) {
    return current.value as Promise<T>;
  }

  const value = loader().catch((error) => {
    cache.delete(key);
    throw error;
  });

  cache.set(key, { expiresAt: now + ttlMs, value });
  return value;
}
