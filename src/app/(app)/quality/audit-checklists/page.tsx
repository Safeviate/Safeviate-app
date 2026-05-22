'use client';

import AuditChecklistsManager from './audit-checklists-manager';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { ResponsiveTabRow } from '@/components/responsive-tab-row';
import { usePathname, useRouter } from 'next/navigation';

export default function AuditChecklistsPage() {
    const { isLoading, isAllowed } = useTenantRouteAccess({ href: '/quality/audit-checklists' });
    const router = useRouter();
    const pathname = usePathname();
    const activeTab = pathname?.startsWith('/quality/audits') ? 'audits' : 'checklists';
    const handleTabChange = (value: string) => {
        router.push(value === 'audits' ? '/quality/audits' : '/quality/audit-checklists');
    };

    if (!isLoading && !isAllowed) {
        return <TenantLayoutDisabledState />;
    }

    return (
        <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-4 px-1 pt-4">
            <ResponsiveTabRow
                value={activeTab}
                onValueChange={handleTabChange}
                options={[
                    { value: 'checklists', label: 'Audit Checklists' },
                    { value: 'audits', label: 'Audits' },
                ]}
                placeholder="Audit section"
                centerTabs
                className="rounded-xl border border-card-border bg-background px-3 py-2 shadow-none"
            />
            <AuditChecklistsManager />
        </div>
    );
}
