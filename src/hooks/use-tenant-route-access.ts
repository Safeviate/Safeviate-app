'use client';

import { useMemo } from 'react';
import { menuConfig, type MenuItem, type SubMenuItem } from '@/lib/menu-config';
import {
  getTenantLayoutRequirement,
  isTenantLayoutRequirementEnabled,
  type TenantLayoutRequirement,
} from '@/lib/tenant-layout-access';
import { usePermissions } from './use-permissions';
import { useTenantConfig } from './use-tenant-config';

type TenantRouteAccessOptions = {
  href?: string;
  requirement?: TenantLayoutRequirement | null;
};

const findMenuEntry = (href: string): { item: MenuItem | SubMenuItem; parent?: MenuItem } | null => {
  for (const menu of menuConfig) {
    if (menu.href === href) {
      return { item: menu };
    }
    const subItem = menu.subItems?.find((entry) => entry.href === href);
    if (subItem) {
      return { item: subItem, parent: menu };
    }
  }
  return null;
};

export function useTenantRouteAccess(options: TenantRouteAccessOptions) {
  const { href, requirement } = options;
  const { tenant, isLoading: isTenantLoading } = useTenantConfig();
  const { canAccessMenuItem, isLoading: isPermissionsLoading } = usePermissions();

  const menuEntry = useMemo(() => (href ? findMenuEntry(href) : null), [href]);
  const layoutRequirement = useMemo(
    () => requirement ?? (href ? getTenantLayoutRequirement(href) : null),
    [href, requirement]
  );

  const isLoading = isTenantLoading || isPermissionsLoading;
  const isLayoutEnabled = isTenantLayoutRequirementEnabled(tenant, layoutRequirement);
  const canAccessHref = !href || !menuEntry ? true : canAccessMenuItem(menuEntry.item, menuEntry.parent);

  return {
    isLoading,
    isAllowed: canAccessHref && isLayoutEnabled,
    isLayoutEnabled,
    canAccessHref,
  };
}
