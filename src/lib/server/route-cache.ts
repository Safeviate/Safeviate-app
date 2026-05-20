type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const routeCache = new Map<string, CacheEntry<unknown>>();

export async function getOrSetRouteCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>
): Promise<T> {
  const now = Date.now();
  const existing = routeCache.get(key);
  if (existing && existing.expiresAt > now) {
    return existing.value as T;
  }

  const value = await loader();
  routeCache.set(key, {
    value,
    expiresAt: now + ttlMs,
  });
  return value;
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
