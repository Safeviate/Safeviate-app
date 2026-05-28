'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';
import { DeleteActionButton, ViewActionButton } from '@/components/record-action-buttons';
import {
  CardControlHeader,
  CARD_HEADER_BAND_CLASS,
  HEADER_ACTION_BUTTON_CLASS,
  HEADER_COMPACT_CONTROL_CLASS,
  HEADER_MOBILE_ACTION_BUTTON_CLASS,
} from '@/components/page-header';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { QualityAudit, ExternalOrganization } from '@/types/quality';
import type { Department } from '../../../admin/department/page';
import type { Personnel } from '../../../users/personnel/page';
import { OrganizationTabsRow } from '@/components/responsive-tab-row';
import { useOrganizationScope } from '@/hooks/use-organization-scope';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return new Date(value);
  }
  return new Date(year, month - 1, day, 12);
};

type EnrichedGapAnalysis = QualityAudit & {
  targetName?: string;
  reviewOwnerName?: string;
};

const getStatusBadgeVariant = (status: QualityAudit['status']): "default" | "secondary" | "destructive" | "outline" => {
  switch (status) {
    case 'Closed':
      return 'default';
    case 'Finalized':
      return 'secondary';
    case 'In Progress':
      return 'outline';
    default:
      return 'secondary';
  }
};

function GapAnalysisActions({ analysis }: { analysis: EnrichedGapAnalysis }) {
  const { toast } = useToast();

  const handleDelete = async () => {
    try {
      const response = await fetch(`/api/quality-gap-analyses?id=${encodeURIComponent(analysis.id)}`, { method: 'DELETE' });
      if (!response.ok) throw new Error('Failed to delete gap analysis');
      window.dispatchEvent(new Event('safeviate-gap-analyses-updated'));
      window.dispatchEvent(new Event('safeviate-quality-updated'));
      toast({ title: 'Gap Analysis Deleted', description: `Gap analysis #${analysis.auditNumber} has been removed.` });
    } catch (error: any) {
      toast({ variant: 'destructive', title: 'Error', description: error.message });
    }
  };

  return (
    <div className="flex items-center justify-end gap-2">
      <ViewActionButton href={`/quality/gap-analyses/${analysis.id}`} />
      <DeleteActionButton
        description={`This will permanently delete gap analysis #${analysis.auditNumber}.`}
        onDelete={handleDelete}
        srLabel="Delete gap analysis"
      />
    </div>
  );
}

export function GapAnalysesList() {
  const { scopedOrganizationId, shouldShowOrganizationTabs } = useOrganizationScope({ viewAllPermissionId: 'quality-audits-view-all' });
  const isMobile = useIsMobile();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [analyses, setAnalyses] = useState<QualityAudit[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeOrgTab, setActiveOrgTab] = useState('internal');
  const activeTab = pathname?.startsWith('/quality/gap-analyses/analyses') ? 'analyses' : 'checklists';

  useEffect(() => {
    let cancelled = false;

    const loadData = async () => {
      try {
        const response = await fetch('/api/quality-gap-analyses', { cache: 'no-store' });
        const payload = await response.json().catch(() => ({ audits: [], personnel: [], departments: [], organizations: [] }));

        if (cancelled) return;

        setAnalyses(Array.isArray(payload.audits) ? payload.audits : []);
        setPersonnel(Array.isArray(payload.personnel) ? payload.personnel : []);
        setDepartments(Array.isArray(payload.departments) ? payload.departments : []);
        setOrganizations(Array.isArray(payload.organizations) ? payload.organizations : []);
      } catch (error) {
        console.error('Failed to load gap analyses', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    void loadData();
    window.addEventListener('safeviate-gap-analyses-updated', loadData);
    window.addEventListener('safeviate-quality-updated', loadData);
    return () => {
      cancelled = true;
      window.removeEventListener('safeviate-gap-analyses-updated', loadData);
      window.removeEventListener('safeviate-quality-updated', loadData);
    };
  }, []);

  useEffect(() => {
    const requestedOrg = searchParams?.get('org');
    setActiveOrgTab(requestedOrg || scopedOrganizationId);
  }, [scopedOrganizationId, searchParams]);

  const handleOrganizationChange = (value: string) => {
    setActiveOrgTab(value);
    const nextPath = pathname || '/quality/gap-analyses/analyses';
    router.replace(`${nextPath}?org=${encodeURIComponent(value)}`);
  };

  const enrichedAnalyses = useMemo(() => {
    const personnelMap = new Map(personnel.map((person) => [person.id, `${person.firstName} ${person.lastName}`]));
    const departmentMap = new Map(departments.map((department) => [department.id, department.name]));
    const orgMap = new Map(organizations.map((organization) => [organization.id, organization.name]));

    return analyses.map((analysis) => ({
      ...analysis,
      targetName:
        departmentMap.get(analysis.targetId || '') ||
        orgMap.get(analysis.organizationId || '') ||
        personnelMap.get(analysis.targetId || '') ||
        analysis.targetId ||
        analysis.auditeeId,
      reviewOwnerName:
        personnelMap.get(analysis.auditeeId) ||
        analysis.auditeeId,
    }));
  }, [analyses, personnel, departments, organizations]);

  const filteredAnalyses = useMemo(() => {
    return enrichedAnalyses.filter((analysis) =>
      activeOrgTab === 'internal'
        ? !analysis.organizationId
        : analysis.organizationId === activeOrgTab
    );
  }, [activeOrgTab, enrichedAnalyses]);

  if (isLoading) {
    return (
      <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-6 h-full px-1">
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
          context={shouldShowOrganizationTabs ? (
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
              <Button asChild variant={isMobile ? 'outline' : 'default'} className={isMobile ? HEADER_MOBILE_ACTION_BUTTON_CLASS : HEADER_ACTION_BUTTON_CLASS}>
                <Link href="/quality/gap-analyses/template/new">
                  <span className="flex items-center gap-2">
                    <span className="h-4 w-4">+</span>
                    New Gap Analysis Template
                  </span>
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
              <Link href={`/quality/gap-analyses?org=${encodeURIComponent(activeOrgTab)}`}>Gap Checklists</Link>
            </Button>
            <Button
              asChild
              variant={activeTab === 'analyses' ? 'default' : 'outline'}
              className={HEADER_COMPACT_CONTROL_CLASS}
            >
              <Link href={`/quality/gap-analyses/analyses?org=${encodeURIComponent(activeOrgTab)}`}>Gap Analyses</Link>
            </Button>
          </div>
        </div>
        <CardContent className={cn("flex-1 p-4 md:p-6 bg-muted/5", isMobile ? "overflow-y-auto" : "overflow-hidden")}>
          <ResponsiveCardGrid
            items={filteredAnalyses}
            isLoading={false}
            gridClassName="sm:grid-cols-2 xl:grid-cols-3"
            className="p-0 pb-20"
            emptyState={
              <div className="text-center p-8 text-muted-foreground text-sm italic uppercase font-bold tracking-widest bg-background rounded-xl border border-dashed">
                No gap analyses found for this context.
              </div>
            }
            renderItem={(analysis) => (
              <Card key={analysis.id} className="overflow-hidden border shadow-none transition-shadow hover:shadow-sm">
                <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Link href={`/quality/gap-analyses/${analysis.id}`} className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground hover:underline">
                        {analysis.auditNumber}
                      </Link>
                      <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px] font-black uppercase tracking-[0.08em]">
                        Gap Analysis
                      </Badge>
                    </div>
                    <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      {format(parseLocalDate(analysis.auditDate), 'dd MMM yyyy')}
                    </p>
                  </div>
                  <Badge variant={getStatusBadgeVariant(analysis.status)} className="text-[9px] font-black uppercase py-0.5 px-2">
                    {analysis.status}
                  </Badge>
                </CardHeader>
                <CardContent className="space-y-4 px-4 py-4">
                  <div className="rounded-lg border bg-background px-3 py-3">
                    <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Title</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{analysis.title}</p>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Target</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{analysis.targetName || analysis.auditeeId}</p>
                    </div>
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Review Owner</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{analysis.reviewOwnerName || '-'}</p>
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-1">
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Resolution</p>
                      <p className={cn("mt-1 text-sm font-semibold text-foreground")}>
                        {analysis.complianceScore !== undefined ? (
                          <Badge
                            variant="outline"
                            className={cn(
                              "font-black text-[9px] uppercase py-0.5 px-2",
                              analysis.complianceScore >= 80
                                ? "text-primary border-primary/40 bg-primary/10"
                                : analysis.complianceScore >= 60
                                  ? "text-foreground border-border bg-muted"
                                  : "text-destructive border-destructive/40 bg-destructive/10"
                            )}
                          >
                            {analysis.complianceScore}%
                          </Badge>
                        ) : '-'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-end">
                    <GapAnalysisActions analysis={analysis} />
                  </div>
                </CardContent>
              </Card>
            )}
          />
        </CardContent>
      </Card>
    </div>
  );
}
