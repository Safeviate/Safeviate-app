'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Plus, Layers3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { MainPageHeader } from '@/components/page-header';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useToast } from '@/hooks/use-toast';
import type { AssetInspectionTemplate } from '@/types/inspection';
import { ChecklistTemplateCard } from './checklist-template-card';

const ASSET_CATEGORY_LABELS: Record<string, string> = {
  aircraft: 'Aircraft',
  vehicle: 'Vehicle',
  all: 'All Assets',
};

export default function AssetChecklistsPage() {
  const { toast } = useToast();
  const { isLoading, isAllowed } = useTenantRouteAccess({ href: '/assets/checklists' });
  const [templates, setTemplates] = useState<AssetInspectionTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);

  const loadTemplates = async () => {
    setIsLoadingTemplates(true);
    try {
      const response = await fetch('/api/asset-inspection-templates', { cache: 'no-store' });
      const payload = await response.json().catch(() => ({ templates: [] }));
      setTemplates(Array.isArray(payload.templates) ? payload.templates : []);
    } catch (error) {
      console.error('Failed to load asset checklists', error);
      setTemplates([]);
    } finally {
      setIsLoadingTemplates(false);
    }
  };

  useEffect(() => {
    void loadTemplates();
    const onUpdated = () => void loadTemplates();
    window.addEventListener('safeviate-asset-inspection-templates-updated', onUpdated);
    return () => window.removeEventListener('safeviate-asset-inspection-templates-updated', onUpdated);
  }, []);

  const groupedTemplates = useMemo(() => {
    return templates.reduce((acc, template) => {
      const category = template.assetType || 'all';
      if (!acc[category]) acc[category] = [];
      acc[category].push(template);
      return acc;
    }, {} as Record<string, AssetInspectionTemplate[]>);
  }, [templates]);

  const sortedCategories = useMemo(() => {
    return Object.keys(groupedTemplates).sort((a, b) => {
      if (a === 'all') return 1;
      if (b === 'all') return -1;
      return ASSET_CATEGORY_LABELS[a].localeCompare(ASSET_CATEGORY_LABELS[b]);
    });
  }, [groupedTemplates]);

  const deleteTemplate = async (template: AssetInspectionTemplate) => {
    const confirmed = window.confirm(`Delete checklist "${template.title}"?`);
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/asset-inspection-templates?id=${encodeURIComponent(template.id)}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => null) as { error?: string } | null;
        throw new Error(payload?.error || 'Failed to delete checklist.');
      }
      toast({ title: 'Checklist deleted', description: `${template.title} was removed.` });
      window.dispatchEvent(new Event('safeviate-asset-inspection-templates-updated'));
      await loadTemplates();
    } catch (error) {
      toast({
        variant: 'destructive',
        title: 'Delete failed',
        description: error instanceof Error ? error.message : 'Failed to delete checklist.',
      });
    }
  };

  if (!isLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  if (isLoading || isLoadingTemplates) {
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
          title="Inspection Checklists"
          description="Create reusable inspection checklists, then start inspections from the saved checklist library."
          actions={(
            <div className="flex flex-wrap items-center gap-2">
              <Button asChild variant="outline" size="compact" className="h-8 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]">
                <Link href="/assets/checklists/new">
                  <Plus className="h-3.5 w-3.5" />
                  New Checklist
                </Link>
              </Button>
              <Button asChild variant="outline" size="compact" className="h-8 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]">
                <Link href="/assets/inspections">
                  <ArrowRight className="h-3.5 w-3.5" />
                  Inspections
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
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground">Saved Checklists</p>
              <p className="mt-1 text-sm text-muted-foreground">The reusable inspection lists are grouped by asset type for quick access.</p>
            </div>
            <Badge variant="outline" className="border-card-border bg-background/70 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
              {templates.length}
            </Badge>
          </div>

          <ScrollArea className="h-[760px]">
            <div className="space-y-4 pr-1">
              {sortedCategories.length > 0 ? (
                <div className="space-y-4">
                  {sortedCategories.map((category) => (
                    <ChecklistTemplateCard
                      key={category}
                      category={ASSET_CATEGORY_LABELS[category] || category}
                      templates={groupedTemplates[category]}
                      onDelete={deleteTemplate}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-card-border bg-muted/10 px-4 text-center text-muted-foreground">
                  <Layers3 className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm font-black uppercase tracking-widest text-foreground/85">No checklists saved yet</p>
                  <p className="mt-2 text-sm">Create the first inspection checklist to start reusing inspections across assets.</p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
