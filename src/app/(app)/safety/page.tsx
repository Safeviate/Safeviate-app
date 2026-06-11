'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { menuConfig } from '@/lib/menu-config';
import { usePermissions } from '@/hooks/use-permissions';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { isTenantHrefEnabledByLayout } from '@/lib/tenant-layout-access';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';

const SAFETY_FALLBACKS = [
  '/safety/safety-reports',
  '/safety/risk-register',
  '/safety/safety-indicators',
  '/safety/risk-matrix',
  '/safety/management-of-change',
] as const;

export default function SafetyPage() {
  const router = useRouter();
  const { tenant } = useTenantConfig();
  const { canAccessMenuItem, isLoading: isPermissionsLoading } = usePermissions();
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/safety' });
  const safetyMenu = menuConfig.find((item) => item.href === '/safety');

  const targetHref = useMemo(() => {
    if (!safetyMenu) return null;
    return (
      SAFETY_FALLBACKS.find((href) => {
        const subItem = safetyMenu.subItems?.find((item) => item.href === href);
        return subItem && canAccessMenuItem(subItem, safetyMenu) && isTenantHrefEnabledByLayout(tenant, href);
      }) ?? null
    );
  }, [canAccessMenuItem, safetyMenu, tenant]);

  useEffect(() => {
    if (isPermissionsLoading || isAccessLoading || !isAllowed || !targetHref) return;
    router.replace(targetHref);
  }, [isAccessLoading, isAllowed, isPermissionsLoading, router, targetHref]);

  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  if (!isPermissionsLoading && !targetHref) {
    return <TenantLayoutDisabledState message="No safety pages are enabled for the current tenant." />;
  }

  return null;
}
