'use client';

import GapAnalysesManager from './gap-analyses-manager';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { ResponsiveTabRow } from '@/components/responsive-tab-row';
import { usePathname, useRouter } from 'next/navigation';

export default function GapAnalysesPage() {
    const { isLoading, isAllowed } = useTenantRouteAccess({ href: '/quality/gap-analyses' });
    const router = useRouter();
    const pathname = usePathname();
    const activeTab = pathname?.startsWith('/quality/gap-analyses/analyses') ? 'analyses' : 'checklists';

    if (!isLoading && !isAllowed) {
        return <TenantLayoutDisabledState />;
    }

    return (
        <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-4 px-1 pt-4">
            <ResponsiveTabRow
                value={activeTab}
                onValueChange={(value) => router.push(value === 'analyses' ? '/quality/gap-analyses/analyses' : '/quality/gap-analyses')}
                options={[
                    { value: 'checklists', label: 'Gap Checklists' },
                    { value: 'analyses', label: 'Gap Analyses' },
                ]}
                placeholder="Gap section"
                centerTabs
                className="rounded-xl border border-card-border bg-background px-3 py-2 shadow-none"
            />
            <GapAnalysesManager />
        </div>
    );
}
