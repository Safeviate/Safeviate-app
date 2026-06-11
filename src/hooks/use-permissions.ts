'use client';

import { useCallback, useMemo } from 'react';
import { useUserProfile } from './use-user-profile';
import { useTenantConfig } from './use-tenant-config';
import { menuConfig } from '@/lib/menu-config';
import type { MenuItem, SubMenuItem } from '@/lib/menu-config';
import type { Personnel } from '@/app/(app)/users/personnel/page';
import { isHrefEnabledForIndustry, shouldBypassIndustryRestrictions } from '@/lib/industry-access';
import { isTenantHrefEnabledByLayout } from '@/lib/tenant-layout-access';
import { hasHierarchicalPermission, normalizePermissionIds } from '@/lib/permission-model';

export const usePermissions = () => {
  const {
    userProfile,
    rolePermissions,
    roleHiddenMenus,
    isLoading: isProfileLoading,
  } = useUserProfile();
  const { tenant, isLoading: isTenantLoading } = useTenantConfig();

  const permissionState = useMemo(() => {
    const inheritedPermissions = rolePermissions || [];
    const overridePermissions = (userProfile as Personnel | null)?.permissions || [];
    const deniedPermissions = new Set(
      normalizePermissionIds(overridePermissions.filter((permission) => permission.startsWith('!')).map((permission) => permission.slice(1)))
    );

    const grantedPermissions = new Set<string>();

    normalizePermissionIds(inheritedPermissions).forEach((permission) => {
      if (!deniedPermissions.has(permission)) {
        grantedPermissions.add(permission);
      }
    });

    normalizePermissionIds(overridePermissions.filter((permission) => !permission.startsWith('!'))).forEach((permission) => {
      grantedPermissions.add(permission);
    });

    return {
      grantedPermissions,
      deniedPermissions,
    };
  }, [rolePermissions, userProfile]);

  const effectivePermissions = permissionState.grantedPermissions;
  const deniedPermissions = permissionState.deniedPermissions;

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

      return hasHierarchicalPermission(effectivePermissions, permissionId, deniedPermissions);
    },
    [deniedPermissions, effectivePermissions, isLoading, userProfile]
  );

  const canAccessMenuItem = useCallback(
    (item: MenuItem | SubMenuItem, parentItem?: MenuItem): boolean => {
      if (isLoading || !userProfile) return false;

      const itemHref = item.href;
      const isCompanyDashboard = itemHref === '/dashboard';
      const isSafeviateOnlyAdminSurface = itemHref === '/users/access-overview';

      if (isSafeviateOnlyAdminSurface && tenant?.id && tenant.id !== 'safeviate') {
        return false;
      }

      if (isCompanyDashboard) {
        return !hiddenMenus.has(itemHref) && isTenantHrefEnabledByLayout(tenant, itemHref);
      }

      const isExplicitlyEnabled = tenant?.enabledMenus?.includes(itemHref) ?? false;
      const bypassIndustryRestrictions = shouldBypassIndustryRestrictions(tenant?.id);
      if (!bypassIndustryRestrictions && !isHrefEnabledForIndustry(itemHref, tenant?.industry) && !isExplicitlyEnabled) {
        return false;
      }

      if (hiddenMenus.has(itemHref)) return false;

      if (!isTenantHrefEnabledByLayout(tenant, itemHref)) return false;

      if (item.permissionId && !hasPermission(item.permissionId)) return false;

      const isEnabledByTenant =
        bypassIndustryRestrictions ||
        !tenant?.enabledMenus ||
        tenant.enabledMenus.includes(itemHref);
      if (!isEnabledByTenant) {
        if (item.subItems?.length) {
          return item.subItems.some((subItem) => canAccessMenuItem(subItem, parentItem || undefined));
        }
        return false;
      }

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
