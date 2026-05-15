'use client';

import { useMemo } from 'react';
import { useTenantConfig } from './use-tenant-config';

export function usePageLayout(pageId: string) {
  const { tenant } = useTenantConfig();

  return useMemo(() => {
    const page = tenant?.pageLayoutSettings?.pages?.[pageId] ?? null;
    return {
      page,
      isPageEnabled: page?.enabled ?? true,
      isSectionEnabled: (sectionId: string) => page?.sections?.[sectionId] ?? true,
      isTabEnabled: (tabId: string) => page?.tabs?.[tabId] ?? true,
    };
  }, [pageId, tenant?.pageLayoutSettings]);
}
