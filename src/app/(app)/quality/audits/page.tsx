'use client';

import { useMemo, useState, useEffect } from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { CardControlHeader, CARD_HEADER_BAND_CLASS, HEADER_ACTION_BUTTON_CLASS, HEADER_COMPACT_CONTROL_CLASS, HEADER_MOBILE_ACTION_BUTTON_CLASS } from "@/components/page-header";
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ShieldCheck, ListFilter, ChevronDown } from 'lucide-react';
import { format } from 'date-fns';
import Link from 'next/link';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useUserProfile } from '@/hooks/use-user-profile';
import { useOrganizationScope } from '@/hooks/use-organization-scope';
import { useTabVisibility } from '@/hooks/use-tab-visibility';
import { usePageLayout } from '@/hooks/use-page-layout';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { OrganizationTabsRow, ResponsiveTabRow } from '@/components/responsive-tab-row';
import { DeleteActionButton, ViewActionButton } from '@/components/record-action-buttons';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

import type { QualityAudit, ExternalOrganization } from '@/types/quality';
import type { Aircraft } from '@/types/aircraft';
import type { Department } from '../../admin/department/page';
import type { Personnel } from '../../users/personnel/page';

const parseLocalDate = (value: string) => {
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) {
        return new Date(value);
    }
    return new Date(year, month - 1, day, 12);
};

type EnrichedAudit = QualityAudit & {
    auditeeName?: string;
    targetName?: string;
    assetName?: string;
};

const getStatusBadgeVariant = (status: QualityAudit['status']): "default" | "secondary" | "destructive" | "outline" => {
    switch (status) {
        case 'Closed': return 'default';
        case 'Finalized': return 'secondary';
        case 'In Progress': return 'outline';
        default: return 'secondary';
    }
};

interface AuditActionsProps {
    audit: EnrichedAudit;
    tenantId: string;
}

function AuditActions({ audit, tenantId }: AuditActionsProps) {
    const { toast } = useToast();

    const handleDelete = async () => {
        try {
            const response = await fetch(`/api/quality-audits?id=${encodeURIComponent(audit.id)}`, { method: 'DELETE' });
            if (!response.ok) throw new Error('Failed to delete audit');
            window.dispatchEvent(new Event('safeviate-quality-updated'));
            toast({ title: "Audit Deleted", description: `Audit #${audit.auditNumber} has been removed.`});
        } catch (error: any) {
            toast({ variant: 'destructive', title: 'Error', description: error.message });
        }
    }
    
    return (
        <div className="flex items-center justify-end gap-2">
            <ViewActionButton href={`/quality/audits/${audit.id}`} />
            <DeleteActionButton
                description={`This will permanently delete audit #${audit.auditNumber}.`}
                onDelete={handleDelete}
                srLabel="Delete audit"
            />
        </div>
    )
}


interface AuditsTableProps {
    audits: EnrichedAudit[];
    tenantId: string;
}

function AuditsTable({ audits, tenantId }: AuditsTableProps) {
    if (audits.length === 0) {
        return <div className="text-center p-8 text-muted-foreground text-sm italic uppercase font-bold tracking-widest bg-muted/5">No audits found for this context.</div>
    }

    return (
        <ResponsiveCardGrid
            items={audits}
            isLoading={false}
            className="p-4"
            gridClassName="sm:grid-cols-2 xl:grid-cols-3"
            renderItem={(audit) => (
                <Card key={audit.id} className="overflow-hidden border shadow-none transition-shadow hover:shadow-sm">
                    <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                        <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <Link href={`/quality/audits/${audit.id}`} className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground hover:underline">{audit.auditNumber}</Link>
                                <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px] font-black uppercase tracking-[0.08em]">
                                    Audit
                                </Badge>
                            </div>
                            <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{format(parseLocalDate(audit.auditDate), 'dd MMM yyyy')}</p>
                        </div>
                        <Badge variant={getStatusBadgeVariant(audit.status)} className="text-[9px] font-black uppercase py-0.5 px-2">{audit.status}</Badge>
                    </CardHeader>
                    <CardContent className="space-y-4 px-4 py-4">
                        <div className="rounded-lg border bg-background px-3 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Title</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">{audit.title}</p>
                        </div>
                        <div className="rounded-lg border bg-background px-3 py-3">
                            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Scope</p>
                            <p className="mt-1 text-sm font-semibold text-foreground">{audit.scope || '-'}</p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <div className="rounded-lg border bg-background px-3 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Audit Target</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">{audit.targetName || audit.auditeeName || audit.auditeeId}</p>
                            </div>
                            <div className="rounded-lg border bg-background px-3 py-3">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Auditee</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">{audit.auditeeName || '-'}</p>
                            </div>
                            <div className="rounded-lg border bg-background px-3 py-3 sm:col-span-2">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Asset</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">{audit.assetName || 'Not linked to an asset'}</p>
                            </div>
                            <div className="rounded-lg border bg-background px-3 py-3 sm:col-span-2">
                                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Score</p>
                                <p className="mt-1 text-sm font-semibold text-foreground">
                                    {audit.complianceScore !== undefined ? (
                                        <Badge variant="outline" className={cn(
                                            "font-black text-[9px] uppercase py-0.5 px-2",
                                            audit.complianceScore >= 80 ? "text-primary border-primary/40 bg-primary/10" : 
                                            audit.complianceScore >= 60 ? "text-foreground border-border bg-muted" : 
                                            "text-destructive border-destructive/40 bg-destructive/10"
                                        )}>
                                            {audit.complianceScore}%
                                        </Badge>
                                    ) : '-'}
                                </p>
                            </div>
                        </div>
                        <div className="flex items-center justify-end">
                            <AuditActions audit={audit} tenantId={tenantId} />
                        </div>
                    </CardContent>
                </Card>
            )}
            emptyState={<div className="text-center p-8 text-muted-foreground text-sm italic uppercase font-bold tracking-widest bg-muted/5">No audits found for this context.</div>}
        />
    );
}

export default function AuditsPage() {
    const { isLoading: isAccessLoading, isAllowed } = useTenantRouteAccess({ href: '/quality/audits' });
    const { tenantId } = useUserProfile();
    const { scopedOrganizationId, shouldShowOrganizationTabs } = useOrganizationScope({ viewAllPermissionId: 'quality-audits-view-all' });
    const { isPageEnabled, isSectionEnabled, isTabEnabled } = usePageLayout('audits');
    const isMobile = useIsMobile();
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();
    const [activeOrgTab, setActiveOrgTab] = useState('internal');
    const [activeStatusTab, setActiveStatusTab] = useState('active');
    const activeTab = pathname?.startsWith('/quality/audits') ? 'audits' : 'checklists';

    const [audits, setAudits] = useState<QualityAudit[]>([]);
    const [personnel, setPersonnel] = useState<Personnel[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
    const [aircraft, setAircraft] = useState<Aircraft[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadData = async () => {
        try {
            const response = await fetch('/api/quality-audits', { cache: 'no-store' });
            const payload = await response.json().catch(() => ({ audits: [], personnel: [], departments: [], organizations: [], aircraft: [] }));
            setAudits(Array.isArray(payload.audits) ? payload.audits : []);
            setPersonnel(Array.isArray(payload.personnel) ? payload.personnel : []);
            setDepartments(Array.isArray(payload.departments) ? payload.departments : []);
            setOrganizations(Array.isArray(payload.organizations) ? payload.organizations : []);
            setAircraft(Array.isArray(payload.aircraft) ? payload.aircraft : []);
        } catch (e) {
            console.error('Failed to load quality data', e);
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        void loadData();
        window.addEventListener('safeviate-quality-updated', loadData);
        return () => window.removeEventListener('safeviate-quality-updated', loadData);
    }, []);

    useEffect(() => {
        const requestedOrg = searchParams?.get('org');
        setActiveOrgTab(requestedOrg || scopedOrganizationId);
    }, [scopedOrganizationId, searchParams]);

    const handleOrganizationChange = (value: string) => {
        setActiveOrgTab(value);
        const nextPath = pathname || '/quality/audits';
        router.replace(`${nextPath}?org=${encodeURIComponent(value)}`);
    };

    const showTabs = useTabVisibility('audits', shouldShowOrganizationTabs);
    const showOrgTabs = showTabs && isSectionEnabled('organization-scope');
    const showStatusTabs = isSectionEnabled('audit-status');
    const statusTabs = [
      { value: 'active', label: `Active (${audits.filter((audit) => audit.status !== 'Archived').length})` },
      { value: 'archived', label: `Archived (${audits.filter((audit) => audit.status === 'Archived').length})` },
    ].filter((tab) => showStatusTabs && isTabEnabled(tab.value));

    useEffect(() => {
        if (statusTabs.length === 0) return;
        if (!statusTabs.some((tab) => tab.value === activeStatusTab)) {
            setActiveStatusTab(statusTabs[0].value);
        }
    }, [activeStatusTab, statusTabs]);

    if (!isAccessLoading && !isAllowed) {
        return <TenantLayoutDisabledState />;
    }

    if (!isPageEnabled) {
      return (
        <div className="max-w-[1100px] mx-auto w-full px-1 pt-4">
          <Card className="border shadow-none">
            <CardContent className="p-6 text-center text-sm text-muted-foreground">
              This page is disabled for the current tenant layout.
            </CardContent>
          </Card>
        </div>
      );
    }

    const enrichedAudits = useMemo((): EnrichedAudit[] => {
        if (!audits || !personnel || !departments || !organizations) return [];

        const personnelMap = new Map(personnel.map(p => [p.id, `${p.firstName} ${p.lastName}`]));
        const departmentMap = new Map(departments.map(d => [d.id, d.name]));
        const orgMap = new Map(organizations.map(o => [o.id, o.name]));
        const aircraftMap = new Map(aircraft.map((item) => [item.id, item.tailNumber]));

        return audits.map(audit => ({
            ...audit,
            auditeeName: personnelMap.get(audit.auditeeId) || '',
            targetName:
              audit.targetName?.trim() ||
              orgMap.get(audit.organizationId || '') ||
              departmentMap.get(audit.targetId || '') ||
              departmentMap.get(audit.auditeeId) ||
              personnelMap.get(audit.auditeeId) ||
              audit.targetId ||
              '',
            assetName: aircraftMap.get(audit.assetId || '') || '',
        }));
    }, [aircraft, audits, personnel, departments, organizations]);

    const renderOrgContent = (orgId: string | 'internal') => {
        const filteredByOrg = enrichedAudits.filter(a => 
            orgId === 'internal' ? !a.organizationId : a.organizationId === orgId
        );

        const activeAudits = filteredByOrg.filter(a => a.status !== 'Archived');
        const archivedAudits = filteredByOrg.filter(a => a.status === 'Archived');

        if (!showStatusTabs || statusTabs.length === 0) {
            return (
                <div className="p-4 lg:p-6">
                    <AuditsTable audits={filteredByOrg} tenantId={tenantId || ''} />
                </div>
            );
        }

        return (
            <Tabs value={activeStatusTab} onValueChange={setActiveStatusTab} className="flex-1 min-h-0 flex flex-col overflow-hidden">
                {statusTabs.length > 1 ? (
                  <ResponsiveTabRow
                      value={activeStatusTab}
                      onValueChange={setActiveStatusTab}
                      placeholder="Filter Status"
                      centerTabs
                      className="px-3 py-2 border-b border-card-border/70 bg-muted/5 shrink-0 md:px-4"
                      options={statusTabs.map((tab) => ({
                          ...tab,
                          icon: ListFilter,
                      }))}
                  />
                ) : null}
                <div className="flex-1 min-h-0 overflow-y-auto">
                    {isTabEnabled('active') ? (
                      <TabsContent value="active" className="m-0 p-4 lg:p-6">
                          <AuditsTable audits={activeAudits} tenantId={tenantId || ''} />
                      </TabsContent>
                    ) : null}
                    {isTabEnabled('archived') ? (
                      <TabsContent value="archived" className="m-0 p-4 lg:p-6">
                          <AuditsTable audits={archivedAudits} tenantId={tenantId || ''} />
                      </TabsContent>
                    ) : null}
                </div>
            </Tabs>
        );
    };

    if (isLoading) {
        return (
            <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full px-1 pt-4">
                <Skeleton className="h-14 w-full" />
                <Skeleton className="h-[500px] w-full" />
            </div>
        );
    }

    return (
        <div className={cn("max-w-[1100px] mx-auto w-full flex flex-col gap-4 px-1 pt-4", isMobile ? "min-h-0 overflow-y-auto" : "h-full overflow-hidden")}>
            <Card className={cn("flex flex-col shadow-none border", isMobile ? "min-h-0 overflow-visible" : "h-full overflow-hidden")}>
                <CardControlHeader
                    className="main-page-header flex w-full shrink-0 flex-col bg-[hsl(var(--card-header-band-background))]"
                    isMobile={false}
                    context={showTabs && showOrgTabs ? (
                        <div className="flex min-w-0 items-center">
                            <OrganizationTabsRow
                                organizations={organizations || []}
                                activeTab={activeOrgTab}
                                onTabChange={handleOrganizationChange}
                                className="border-0 bg-transparent px-0 py-0"
                            />
                        </div>
                    ) : undefined}
                    actions={
                        <div className="main-page-header__actions flex w-full flex-wrap items-center justify-end gap-1.5 [&_button]:h-8 [&_button]:gap-1.5 [&_button]:px-3 [&_button]:text-[9px] [&_button]:tracking-[0.08em] [&_a]:h-8 [&_a]:gap-1.5 [&_a]:px-3 [&_a]:text-[9px] [&_a]:tracking-[0.08em]">
                            <Button
                                asChild
                                variant={isMobile ? 'outline' : 'default'}
                                className={isMobile ? HEADER_MOBILE_ACTION_BUTTON_CLASS : HEADER_ACTION_BUTTON_CLASS}
                            >
                                <Link href="/quality/audit-checklists">
                                    <span className="flex items-center gap-2">
                                        <ShieldCheck className="h-3.5 w-3.5" />
                                        Audit Templates
                                    </span>
                                    {isMobile ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" /> : null}
                                </Link>
                            </Button>
                        </div>
                    }
                />
                <div className={CARD_HEADER_BAND_CLASS}>
                    <div className="flex flex-wrap items-center justify-center gap-2">
                        <Button
                            asChild
                            variant={activeTab === 'checklists' ? 'default' : 'outline'}
                            className={HEADER_COMPACT_CONTROL_CLASS}
                        >
                            <Link href={`/quality/audit-checklists?org=${encodeURIComponent(activeOrgTab)}`}>Audit Checklists</Link>
                        </Button>
                        <Button
                            asChild
                            variant={activeTab === 'audits' ? 'default' : 'outline'}
                            className={HEADER_COMPACT_CONTROL_CLASS}
                        >
                            <Link href={`/quality/audits?org=${encodeURIComponent(activeOrgTab)}`}>Audits</Link>
                        </Button>
                    </div>
                </div>
                <CardContent className={cn("flex-1 p-0 bg-muted/5", isMobile ? "overflow-y-auto" : "overflow-hidden")}>
                    {!showTabs || !showOrgTabs ? (
                        renderOrgContent(scopedOrganizationId)
                    ) : (
                        renderOrgContent(activeOrgTab)
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
