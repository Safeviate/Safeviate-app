'use client';

import { useCallback, useMemo } from 'react';
import { useUserProfile } from './use-user-profile';
import { useTenantConfig } from './use-tenant-config';
import { menuConfig } from '@/lib/menu-config';
import type { MenuItem, SubMenuItem } from '@/lib/menu-config';
import type { Personnel } from '@/app/(app)/users/personnel/page';
import { isHrefEnabledForIndustry, shouldBypassIndustryRestrictions } from '@/lib/industry-access';

export const usePermissions = () => {
  const {
    userProfile,
    rolePermissions,
    roleHiddenMenus,
    isLoading: isProfileLoading,
  } = useUserProfile();
  const { tenant, isLoading: isTenantLoading } = useTenantConfig();

  const effectivePermissions = useMemo(() => {
    const inheritedPermissions = rolePermissions || [];
    const overridePermissions = (userProfile as Personnel | null)?.permissions || [];
    const deniedPermissions = new Set(
      overridePermissions.filter((permission) => permission.startsWith('!')).map((permission) => permission.slice(1))
    );

    const grantedPermissions = new Set<string>();

    inheritedPermissions.forEach((permission) => {
      if (!deniedPermissions.has(permission)) {
        grantedPermissions.add(permission);
      }
    });

    overridePermissions.forEach((permission) => {
      if (!permission.startsWith('!')) {
        grantedPermissions.add(permission);
      }
    });

    return grantedPermissions;
  }, [rolePermissions, userProfile]);

  const hiddenMenus = useMemo(() => {
    const userHiddenMenus = (userProfile as Personnel | null)?.accessOverrides?.hiddenMenus || [];
    return new Set([...roleHiddenMenus, ...userHiddenMenus]);
  }, [roleHiddenMenus, userProfile]);

  const isLoading = isProfileLoading || isTenantLoading;

  const hasPermission = useCallback(
    (permissionId: string) => {
      if (isLoading || !userProfile) return false;

      if (effectivePermissions.has('*')) {
        return true;
      }

      return effectivePermissions.has(permissionId);
    },
    [effectivePermissions, isLoading, userProfile]
  );

    const canAccessMenuItem = useCallback(
    (item: MenuItem | SubMenuItem, parentItem?: MenuItem) => {
      if (isLoading || !userProfile) return false;

      const itemHref = item.href;
      const isCompanyDashboard = itemHref === '/dashboard';

      if (isCompanyDashboard) {
        return !hiddenMenus.has(itemHref);
      }

      const isExplicitlyEnabled = tenant?.enabledMenus?.includes(itemHref) ?? false;
      const bypassIndustryRestrictions = shouldBypassIndustryRestrictions(tenant?.id);
      if (!bypassIndustryRestrictions && !isHrefEnabledForIndustry(itemHref, tenant?.industry) && !isExplicitlyEnabled) {
        return false;
      }

      if (hiddenMenus.has(itemHref)) return false;

      const isEnabledByTenant =
        bypassIndustryRestrictions ||
        !tenant?.enabledMenus ||
        tenant.enabledMenus.includes(itemHref) ||
        (parentItem ? tenant.enabledMenus.includes(parentItem.href) : false);
      if (!isEnabledByTenant) return false;

      if (item.permissionId && !hasPermission(item.permissionId)) return false;

      return true;
    },
    [hasPermission, hiddenMenus, isLoading, tenant, userProfile]
  );

  return {
    permissions: effectivePermissions,
    hasPermission,
    canAccessMenuItem,
    isLoading,
  };
};
