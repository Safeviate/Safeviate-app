'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';

export default function QualityRiskPlanRedirectPage() {
  const router = useRouter();
  const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/quality/risk-plan' });

  useEffect(() => {
    if (!isAccessLoading && !isAllowed) return;
    router.replace('/quality/task-tracker');
  }, [isAccessLoading, isAllowed, router]);

  if (!isAccessLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  return null;
}
