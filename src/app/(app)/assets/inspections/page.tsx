'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowRight, CheckCircle2, CircleAlert, Plus, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MainPageHeader } from '@/components/page-header';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import type { AssetInspectionRecord } from '@/types/inspection';

function formatInspectionDate(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, 'dd MMM yyyy');
}

export default function AssetInspectionsPage() {
  const { isLoading, isAllowed } = useTenantRouteAccess({ href: '/assets/inspections' });
  const [inspections, setInspections] = useState<AssetInspectionRecord[]>([]);
  const [isLoadingData, setIsLoadingData] = useState(true);

  const loadInspections = async () => {
    setIsLoadingData(true);
    try {
      const response = await fetch('/api/asset-inspections', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({ inspections: [] }));
      setInspections(Array.isArray(payload.inspections) ? payload.inspections : []);
    } catch (error) {
      console.error('Failed to load inspections', error);
      setInspections([]);
    } finally {
      setIsLoadingData(false);
    }
  };

  useEffect(() => {
    void loadInspections();
    const onUpdated = () => void loadInspections();
    window.addEventListener('safeviate-asset-inspections-updated', onUpdated);
    return () => window.removeEventListener('safeviate-asset-inspections-updated', onUpdated);
  }, []);

  const recentInspections = useMemo(
    () =>
      [...inspections]
        .sort((a, b) => new Date(b.inspectionDate || b.createdAt || 0).getTime() - new Date(a.inspectionDate || a.createdAt || 0).getTime()),
    [inspections],
  );

  if (!isLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  if (isLoading || isLoadingData) {
    return (
      <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-1 pt-4">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-[760px] w-full" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-[1180px] flex-col gap-6 px-1 pt-4">
      <Card className="overflow-hidden border shadow-none">
        <MainPageHeader
          title="Completed Checklists"
          description="View completed inspection records saved from the asset inspection flow."
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="compact" className="h-8 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]">
                <Link href="/assets/checklists">
                  <ArrowRight className="h-3.5 w-3.5" />
                  Checklists
                </Link>
              </Button>
              <Button asChild variant="outline" size="compact" className="h-8 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]">
                <Link href="/assets/inspections/new?assetType=aircraft">
                  <Plus className="h-3.5 w-3.5" />
                  New Inspection
                </Link>
              </Button>
            </div>
          )}
        />
      </Card>

      <Card className="overflow-hidden border shadow-none">
        <CardContent className="space-y-4 p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Inspection Records</p>
              <p className="mt-1 text-sm text-muted-foreground">These are the saved inspection records and completed checklists captured through the workflow.</p>
            </div>
            <Badge variant="outline" className="border-card-border bg-background/70 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
              {recentInspections.length}
            </Badge>
          </div>

          <ScrollArea className="h-[760px]">
            <div className="space-y-3 pr-1">
              {recentInspections.length > 0 ? (
                recentInspections.map((inspection) => (
                  <div key={inspection.id} className="rounded-lg border border-card-border bg-muted/15 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/80">{inspection.assetType}</p>
                        <p className="mt-1 break-words text-sm font-semibold text-foreground">{inspection.assetLabel || inspection.assetId}</p>
                        <p className="mt-1 text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">{inspection.inspectionType}</p>
                      </div>
                      <Badge
                        variant="outline"
                        className={
                          inspection.status === 'Grounded'
                            ? 'border-card-border bg-red-50 text-[10px] font-black uppercase tracking-[0.08em] text-red-700'
                            : inspection.status === 'Attention Required'
                              ? 'border-card-border bg-amber-50 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700'
                              : 'border-card-border bg-emerald-50 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700'
                        }
                      >
                        {inspection.status}
                      </Badge>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-2">
                      <Badge variant="outline" className="border-card-border bg-background/70 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
                        {inspection.templateTitle || 'Checklist'}
                      </Badge>
                      <Badge variant="outline" className="border-card-border bg-background/70 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
                        {inspection.inspectionScope || 'Both'}
                      </Badge>
                    </div>

                    <div className="mt-3 grid gap-2 text-[11px] text-muted-foreground sm:grid-cols-2">
                      <div className="rounded-md border bg-background/70 px-2.5 py-2">
                        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Inspection Date</p>
                        <p className="mt-1 font-semibold text-foreground">{formatInspectionDate(inspection.inspectionDate)}</p>
                      </div>
                      <div className="rounded-md border bg-background/70 px-2.5 py-2">
                        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Inspector</p>
                        <p className="mt-1 font-semibold text-foreground">{inspection.inspectorName || inspection.inspectorId || 'Unassigned'}</p>
                      </div>
                    </div>

                    {inspection.findings?.trim() ? (
                      <div className="mt-3 rounded-md border bg-background/70 px-3 py-2">
                        <p className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">Findings</p>
                        <p className="mt-1 text-sm leading-6 text-foreground/80">{inspection.findings}</p>
                      </div>
                    ) : null}

                    {Array.isArray(inspection.checklistItems) && inspection.checklistItems.length > 0 ? (
                      <div className="mt-3 space-y-2">
                        {inspection.checklistItems.map((item) => (
                          <div key={item.id} className="flex items-start gap-2 rounded-md border bg-background/70 px-3 py-2">
                            {item.outcome === 'Pass' ? (
                              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                            ) : (
                              <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                            )}
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-semibold text-foreground">{item.label}</p>
                              <p className="mt-0.5 text-[11px] font-black uppercase tracking-[0.12em] text-muted-foreground">{item.outcome}</p>
                              {item.notes?.trim() ? <p className="mt-1 text-xs text-muted-foreground">{item.notes}</p> : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ))
              ) : (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-card-border bg-muted/10 px-4 text-center text-muted-foreground">
                  <Wrench className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm font-black uppercase tracking-widest text-foreground/85">No completed checklists yet</p>
                  <p className="mt-2 text-sm">Save the first asset inspection and it will appear here.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
