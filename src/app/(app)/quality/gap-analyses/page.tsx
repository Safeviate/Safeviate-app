'use client';

import GapAnalysesManager from './gap-analyses-manager';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';

export default function GapAnalysesPage() {
    const { isLoading, isAllowed } = useTenantRouteAccess({ href: '/quality/gap-analyses' });

    if (!isLoading && !isAllowed) {
        return <TenantLayoutDisabledState />;
    }

    return (
        <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-4 px-1 pt-4">
            <GapAnalysesManager />
        </div>
    );
}
