'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowRight, CheckCircle2, CircleAlert, FileText, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { MainPageHeader } from '@/components/page-header';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { DeleteActionButton, ViewActionButton } from '@/components/record-action-buttons';
import { ResponsiveCardGrid } from '@/components/responsive-card-grid';
import { useToast } from '@/hooks/use-toast';
import type { AssetInspectionRecord } from '@/types/inspection';

function formatInspectionDate(value?: string | null) {
  if (!value) return '';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : format(parsed, 'dd MMM yyyy');
}

function getStatusBadgeClass(status: AssetInspectionRecord['status']) {
  return status === 'Grounded'
    ? 'border-card-border bg-red-50 text-[10px] font-black uppercase tracking-[0.08em] text-red-700'
    : status === 'Attention Required'
      ? 'border-card-border bg-amber-50 text-[10px] font-black uppercase tracking-[0.08em] text-amber-700'
      : 'border-card-border bg-emerald-50 text-[10px] font-black uppercase tracking-[0.08em] text-emerald-700';
}

export default function AssetInspectionsPage() {
  const { toast } = useToast();
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
      [...inspections].sort(
        (a, b) => new Date(b.inspectionDate || b.createdAt || 0).getTime() - new Date(a.inspectionDate || a.createdAt || 0).getTime(),
      ),
    [inspections],
  );

  const deleteInspection = async (inspection: AssetInspectionRecord) => {
    const confirmed = window.confirm(`Delete inspection "${inspection.assetLabel || inspection.assetId}"?`);
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/asset-inspections?id=${encodeURIComponent(inspection.id)}`, { method: 'DELETE' });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to delete inspection.');
      }
      toast({ title: 'Inspection deleted', description: `${inspection.assetLabel || inspection.assetId} was removed.` });
      window.dispatchEvent(new Event('safeviate-asset-inspections-updated'));
      await loadInspections();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete inspection.',
      });
    }
  };

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
          description="View completed inspection records saved from the asset inspection workflow."
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
              <p className="mt-1 text-sm text-muted-foreground">These are the completed inspection records and saved checklists captured through the workflow.</p>
            </div>
            <Badge variant="outline" className="border-card-border bg-background/70 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
              {recentInspections.length}
            </Badge>
          </div>

          <ScrollArea className="h-[760px]">
            <ResponsiveCardGrid
              items={recentInspections}
              isLoading={false}
              gridClassName="sm:grid-cols-2 xl:grid-cols-3"
              className="pr-1"
              renderItem={(inspection) => (
                <Card key={inspection.id} className="overflow-hidden border border-card-border shadow-none">
                  <CardHeader className="flex flex-row items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/assets/inspections/new?inspectionId=${encodeURIComponent(inspection.id)}`} className="truncate text-sm font-black uppercase tracking-[-0.01em] text-foreground hover:underline">
                          {inspection.assetType === 'vehicle' ? 'Vehicle' : 'Aircraft'}
                        </Link>
                        <Badge variant="outline" className="h-6 rounded-full px-2 text-[10px] font-black uppercase tracking-[0.08em]">
                          Inspection
                        </Badge>
                      </div>
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">{formatInspectionDate(inspection.inspectionDate)}</p>
                    </div>
                    <Badge variant="outline" className={getStatusBadgeClass(inspection.status)}>
                      {inspection.status}
                    </Badge>
                  </CardHeader>
                  <CardContent className="space-y-4 px-4 py-4">
                    <div className="rounded-lg border bg-background px-3 py-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Title</p>
                      <p className="mt-1 text-sm font-semibold text-foreground">{inspection.templateTitle || 'Inspection Checklist'}</p>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Asset</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{inspection.assetLabel || inspection.assetId}</p>
                      </div>
                      <div className="rounded-lg border bg-background px-3 py-3">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Inspector</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{inspection.inspectorName || inspection.inspectorId || '-'}</p>
                      </div>
                      <div className="rounded-lg border bg-background px-3 py-3 sm:col-span-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Scope</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{inspection.inspectionScope || 'Both'}</p>
                      </div>
                      <div className="rounded-lg border bg-background px-3 py-3 sm:col-span-2">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">Checklist Items</p>
                        <p className="mt-1 text-sm font-semibold text-foreground">{inspection.checklistItems?.length || 0} questions</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2">
                      <ViewActionButton href={`/assets/inspections/new?inspectionId=${encodeURIComponent(inspection.id)}`} />
                      <DeleteActionButton
                        description={`This will permanently delete inspection ${inspection.assetLabel || inspection.assetId}.`}
                        onDelete={() => void deleteInspection(inspection)}
                        srLabel="Delete inspection"
                      />
                    </div>
                  </CardContent>
                </Card>
              )}
              emptyState={
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-card-border bg-muted/10 px-4 text-center text-muted-foreground">
                  <FileText className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm font-black uppercase tracking-widest text-foreground/85">No completed checklists saved yet</p>
                  <p className="mt-2 text-sm">Save the first asset inspection and it will appear here.</p>
                </div>
              }
            />
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
