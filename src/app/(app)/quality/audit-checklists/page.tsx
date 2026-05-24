'use client';

import AuditChecklistsManager from './audit-checklists-manager';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';

export default function AuditChecklistsPage() {
    const { isLoading, isAllowed } = useTenantRouteAccess({ href: '/quality/audit-checklists' });

    if (!isLoading && !isAllowed) {
        return <TenantLayoutDisabledState />;
    }

    return (
        <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-4 px-1 pt-4">
            <AuditChecklistsManager />
        </div>
    );
}
