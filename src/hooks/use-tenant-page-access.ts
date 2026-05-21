'use client';

import { useMemo } from 'react';
import { menuConfig, type MenuItem, type SubMenuItem } from '@/lib/menu-config';
import { usePageLayout } from './use-page-layout';
import { usePermissions } from './use-permissions';

type TenantPageAccessOptions = {
  href: string;
  pageId: string;
  tabId?: string;
};

function findMenuItem(href: string): { item: MenuItem | SubMenuItem | null; parentItem?: MenuItem } {
  for (const menuItem of menuConfig) {
    if (menuItem.href === href) {
      return { item: menuItem };
    }

    const subItem = menuItem.subItems?.find((entry) => entry.href === href) || null;
    if (subItem) {
      return { item: subItem, parentItem: menuItem };
    }
  }

  return { item: null };
}

export function useTenantPageAccess({ href, pageId, tabId }: TenantPageAccessOptions) {
  const { canAccessMenuItem, isLoading: isPermissionsLoading } = usePermissions();
  const { isPageEnabled, isTabEnabled } = usePageLayout(pageId);

  return useMemo(() => {
    const { item, parentItem } = findMenuItem(href);
    const hasMenuAccess = item ? canAccessMenuItem(item, parentItem) : true;
    const hasLayoutAccess = isPageEnabled && (!tabId || isTabEnabled(tabId));

    return {
      isLoading: isPermissionsLoading,
      isAllowed: !isPermissionsLoading && hasMenuAccess && hasLayoutAccess,
      hasMenuAccess,
      hasLayoutAccess,
    };
  }, [canAccessMenuItem, href, isPageEnabled, isPermissionsLoading, isTabEnabled, tabId]);
}
