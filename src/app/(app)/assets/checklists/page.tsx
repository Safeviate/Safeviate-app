'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Copy, Edit, Loader2, Plus, Trash2, Layers3, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { MainPageHeader } from '@/components/page-header';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import type { AssetInspectionTemplate } from '@/types/inspection';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { cn } from '@/lib/utils';

export default function AssetChecklistsPage() {
  const { toast } = useToast();
  const { isLoading, isAllowed } = useTenantRouteAccess({ href: '/assets/checklists' });
  const [templates, setTemplates] = useState<AssetInspectionTemplate[]>([]);
  const [isLoadingTemplates, setIsLoadingTemplates] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);

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

  const sortedTemplates = useMemo(
    () => [...templates].sort((a, b) => a.title.localeCompare(b.title)),
    [templates],
  );

  const deleteTemplate = async (template: AssetInspectionTemplate) => {
    const confirmed = window.confirm(`Delete checklist \"${template.title}\"?`);
    if (!confirmed) return;

    setIsDeleting(true);
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
    } finally {
      setIsDeleting(false);
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
          description="Create reusable inspection checklists, then use them when starting new inspections."
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
              <p className="mt-1 text-sm text-muted-foreground">The checklists here are the reusable inspection definitions created by your users.</p>
            </div>
            <Badge variant="outline" className="border-card-border bg-background/70 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
              {sortedTemplates.length}
            </Badge>
          </div>

          <ScrollArea className="h-[760px]">
            <div className="space-y-3 pr-1">
              {sortedTemplates.length > 0 ? (
                sortedTemplates.map((template) => (
                  <div key={template.id} className="rounded-lg border border-card-border bg-muted/10 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary/80">{template.assetType}</p>
                        <p className="mt-1 break-words text-sm font-semibold text-foreground">{template.title}</p>
                      </div>
                      <Badge variant="outline" className="border-card-border bg-background/70 text-[10px] font-black uppercase tracking-[0.08em] text-foreground">
                        {template.sections.length} section{template.sections.length === 1 ? '' : 's'}
                      </Badge>
                    </div>

                    <div className="mt-2 text-[11px] text-muted-foreground">
                      {template.sections.reduce((count, section) => count + section.items.length, 0)} questions
                    </div>

                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild type="button" variant="outline" size="sm" className="h-7 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]">
                        <Link href={`/assets/inspections/new?assetType=${encodeURIComponent(template.assetType === 'all' ? 'aircraft' : template.assetType)}&template=${encodeURIComponent(template.id)}`}>
                          Start Inspection
                        </Link>
                      </Button>
                      <Button asChild type="button" variant="outline" size="sm" className="h-7 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]">
                        <Link href={`/assets/checklists/new?template=${encodeURIComponent(template.id)}`}>
                          <Edit className="mr-1.5 h-3.5 w-3.5" />
                          Edit
                        </Link>
                      </Button>
                      <Button asChild type="button" variant="outline" size="sm" className="h-7 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]">
                        <Link href={`/assets/checklists/new?copyFrom=${encodeURIComponent(template.id)}`}>
                          <Copy className="mr-1.5 h-3.5 w-3.5" />
                          Duplicate
                        </Link>
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-7 border-slate-300 text-[9px] font-black uppercase tracking-[0.08em]"
                        disabled={isDeleting}
                        onClick={() => void deleteTemplate(template)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" />
                        Delete
                      </Button>
                    </div>
                  </div>
                ))
              ) : (
                <div className="flex min-h-[220px] flex-col items-center justify-center rounded-lg border border-dashed border-card-border bg-muted/10 px-4 text-center text-muted-foreground">
                  <Layers3 className="mb-3 h-10 w-10 text-muted-foreground/50" />
                  <p className="text-sm font-black uppercase tracking-widest text-foreground/85">No checklists yet</p>
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
