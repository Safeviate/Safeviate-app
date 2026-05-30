type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

type PendingCacheEntry<T> = {
  promise: Promise<T>;
  expiresAt: number;
};

const routeCache = new Map<string, CacheEntry<unknown> | PendingCacheEntry<unknown>>();

export async function getOrSetRouteCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const existing = routeCache.get(key);
  if (existing && existing.expiresAt > now) {
    if ('promise' in existing) {
      return existing.promise as Promise<T>;
    }

    return existing.value as T;
  }

  const pending: PendingCacheEntry<T> = {
    expiresAt: Number.POSITIVE_INFINITY,
    promise: (async () => {
      try {
        const value = await loader();
        routeCache.set(key, {
          value,
          expiresAt: Date.now() + ttlMs,
        });
        return value;
      } catch (error) {
        routeCache.delete(key);
        throw error;
      }
    })(),
  };

  routeCache.set(key, pending);
  return pending.promise;
}

export function invalidateRouteCache(key: string) {
  routeCache.delete(key);
}

export function invalidateRouteCacheByPrefix(prefix: string) {
  for (const key of routeCache.keys()) {
    if (key.startsWith(prefix)) {
      routeCache.delete(key);
    }
  }
}

export function invalidatePersonnelDirectoryCaches(tenantId: string) {
  invalidateRouteCache(`personnel:roles:${tenantId}`);
  invalidateRouteCache(`personnel:departments:${tenantId}`);
  invalidateRouteCache(`personnel:list:${tenantId}`);
  invalidateRouteCache(`dashboard-summary:${tenantId}`);
  invalidateRouteCache(`schedule-data:${tenantId}`);
}

export function invalidateTenantScopedCaches(tenantId: string) {
  invalidateRouteCache(`tenant-config:${tenantId}`);
  invalidateRouteCache(`dashboard-summary:${tenantId}`);
  invalidateRouteCache(`dashboard-summary:v2:${tenantId}`);
  invalidateRouteCache(`dashboard-summary:tenant-config:${tenantId}`);
  invalidateRouteCache(`schedule-data:${tenantId}`);
  invalidateRouteCache(`aircraft:${tenantId}`);
  invalidateRouteCache(`vehicle-usage:${tenantId}`);
  invalidatePersonnelDirectoryCaches(tenantId);
}
