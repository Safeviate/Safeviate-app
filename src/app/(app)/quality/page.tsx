'use client';

import { useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { menuConfig, type SubMenuItem } from '@/lib/menu-config';
import { usePermissions } from '@/hooks/use-permissions';
import { useTenantConfig } from '@/hooks/use-tenant-config';
import { isTenantHrefEnabledByLayout } from '@/lib/tenant-layout-access';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';

const QUALITY_FALLBACKS = [
  '/quality/audits',
  '/quality/audit-checklists',
  '/quality/gap-analyses/analyses',
  '/quality/gap-analyses',
  '/quality/audit-schedule',
  '/quality/coherence-matrix',
  '/quality/risk-plan',
  '/quality/task-tracker',
] as const;

const findNestedSubItem = (items: NonNullable<(typeof menuConfig)[number]['subItems']>, href: string): SubMenuItem | null => {
  for (const item of items) {
    if (item.href === href) return item;
    if (item.subItems?.length) {
      const nested = findNestedSubItem(item.subItems, href);
      if (nested) return nested;
    }
  }
  return null;
};

export default function QualityPage() {
  const router = useRouter();
  const { tenant } = useTenantConfig();
  const { canAccessMenuItem, isLoading: isPermissionsLoading } = usePermissions();
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/quality' });
  const qualityMenu = menuConfig.find((item) => item.href === '/quality');

  const targetHref = useMemo(() => {
    if (!qualityMenu) return null;
    return (
      QUALITY_FALLBACKS.find((href) => {
        const subItem = qualityMenu.subItems ? findNestedSubItem(qualityMenu.subItems, href) : null;
        return subItem && canAccessMenuItem(subItem, qualityMenu) && isTenantHrefEnabledByLayout(tenant, href);
      }) ?? null
    );
  }, [canAccessMenuItem, qualityMenu, tenant]);

  useEffect(() => {
    if (isPermissionsLoading || isAccessLoading || !isAllowed || !targetHref) return;
    router.replace(targetHref);
  }, [isAccessLoading, isAllowed, isPermissionsLoading, router, targetHref]);

  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  if (!isPermissionsLoading && !targetHref) {
    return <TenantLayoutDisabledState message="No quality pages are enabled for the current tenant." />;
  }

  return null;
}
