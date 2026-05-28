'use client';

import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { GapAnalysesList } from './gap-analyses-list';

export default function GapAnalysesRecordsPage() {
  const { isLoading, isAllowed } = useTenantRouteAccess({ href: '/quality/gap-analyses/analyses' });

  if (!isLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  return (
    <GapAnalysesList />
  );
}
