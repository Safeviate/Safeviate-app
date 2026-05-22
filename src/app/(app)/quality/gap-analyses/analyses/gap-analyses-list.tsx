'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';
import { DeleteActionButton, ViewActionButton } from '@/components/record-action-buttons';
import { MainPageHeader } from '@/components/page-header';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import type { QualityAudit, ExternalOrganization } from '@/types/quality';
import type { Department } from '../../../admin/department/page';
import type { Personnel } from '../../../users/personnel/page';

const parseLocalDate = (value: string) => {
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) {
    return new Date(value);
  }
  return new Date(year, month - 1, day, 12);
};

type EnrichedGapAnalysis = QualityAudit & {
  targetName?: string;
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
  const [analyses, setAnalyses] = useState<QualityAudit[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
  const [isLoading, setIsLoading] = useState(true);

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

  const enrichedAnalyses = useMemo(() => {
    const personnelMap = new Map(personnel.map((person) => [person.id, `${person.firstName} ${person.lastName}`]));
    const departmentMap = new Map(departments.map((department) => [department.id, department.name]));
    const orgMap = new Map(organizations.map((organization) => [organization.id, organization.name]));

    return analyses.map((analysis) => ({
      ...analysis,
      targetName:
        personnelMap.get(analysis.auditeeId) ||
        departmentMap.get(analysis.auditeeId) ||
        orgMap.get(analysis.organizationId || '') ||
        analysis.auditeeId,
    }));
  }, [analyses, personnel, departments, organizations]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="h-14 w-full rounded-xl border bg-muted/20 animate-pulse" />
        <div className="h-[420px] w-full rounded-xl border bg-muted/10 animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <MainPageHeader
        title="Gap Analyses"
        description="Review live gap-analysis sessions, resolution progress, and sign-off status."
        actions={
          <Button asChild variant="outline" size="sm" className="h-8">
            <Link href="/quality/gap-analyses">
              Gap Checklists
            </Link>
          </Button>
        }
      />

      <ResponsiveCardGrid
        items={enrichedAnalyses}
        isLoading={false}
        gridClassName="sm:grid-cols-2 xl:grid-cols-3"
        className="p-0"
        emptyState={
          <div className="text-center p-8 text-muted-foreground text-sm italic uppercase font-bold tracking-widest bg-muted/5 rounded-xl border">
            No gap analyses found.
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
    </div>
  );
}
