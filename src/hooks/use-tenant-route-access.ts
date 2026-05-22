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
    const findNested = (entries?: SubMenuItem[]): SubMenuItem | null => {
      if (!entries?.length) return null;
      for (const entry of entries) {
        if (entry.href === href) return entry;
        const nested = findNested(entry.subItems);
        if (nested) return nested;
      }
      return null;
    };
    const subItem = findNested(menu.subItems);
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
