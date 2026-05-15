'use client';

import { useEffect, useState } from 'react';
import { useTenantConfig } from './use-tenant-config';
import type { TabVisibilitySettings } from '@/types/quality';

/**
 * A custom hook to determine if specific UI tabs should be visible.
 * Uses the current MOC/Vercel profile context and the tenant database route.
 */
export function useTabVisibility(pageId: string, canViewAll: boolean): boolean {
  const { tenant } = useTenantConfig();
  const [settings, setSettings] = useState<TabVisibilitySettings | null>(null);

  useEffect(() => {
    setSettings(tenant?.tabVisibilitySettings ?? null);
  }, [tenant?.tabVisibilitySettings]);

  if (canViewAll) return true;
  const pageLayoutEnabled = tenant?.pageLayoutSettings?.pages?.[pageId]?.enabled;
  if (typeof pageLayoutEnabled === 'boolean') {
    return pageLayoutEnabled;
  }
  return settings?.visibilities?.[pageId] ?? true;
}
