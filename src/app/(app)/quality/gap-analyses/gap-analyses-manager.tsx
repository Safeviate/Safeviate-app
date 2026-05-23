'use client';

import { useMemo, useState, useEffect } from 'react';
import { GapAnalysisTemplateCard } from './gap-analysis-template-card';
import { Accordion } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MainPageHeader } from "@/components/page-header";
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserProfile } from '@/hooks/use-user-profile';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { HEADER_ACTION_BUTTON_CLASS, HEADER_MOBILE_ACTION_BUTTON_CLASS } from '@/components/page-header';
import type { QualityAuditChecklistTemplate } from '@/types/quality';
import type { Department } from '../../admin/department/page';
import type { Personnel } from '../../users/personnel/page';
import { Bot, Layers3, Library, PencilLine } from 'lucide-react';

export default function GapAnalysesManager() {
  const { tenantId } = useUserProfile();
  const isMobile = useIsMobile();

  const [templates, setTemplates] = useState<QualityAuditChecklistTemplate[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadData = async () => {
    try {
        const [templatesResponse, personnelResponse, deptsResponse] = await Promise.all([
          fetch('/api/quality-gap-analysis-templates', { cache: 'no-store' }),
          fetch('/api/personnel', { cache: 'no-store' }),
          fetch('/api/departments', { cache: 'no-store' }),
        ]);
        const [templatesPayload, personnelPayload, deptsPayload] = await Promise.all([
          templatesResponse.json().catch(() => ({ templates: [] })),
          personnelResponse.json().catch(() => ({ personnel: [] })),
          deptsResponse.json().catch(() => ({ departments: [] })),
        ]);
        setTemplates(Array.isArray(templatesPayload.templates) ? templatesPayload.templates : []);
        setPersonnel(Array.isArray(personnelPayload.personnel) ? personnelPayload.personnel : []);
        setDepartments(Array.isArray(deptsPayload.departments) ? deptsPayload.departments : []);
    } catch (e) {
        console.error('Failed to load gap analysis template data', e);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
      window.addEventListener('safeviate-gap-analysis-templates-updated', loadData);
      window.addEventListener('safeviate-departments-updated', loadData);
      return () => {
      window.removeEventListener('safeviate-gap-analysis-templates-updated', loadData);
      window.removeEventListener('safeviate-departments-updated', loadData);
    };
  }, []);

  const groupedTemplates = useMemo(() => {
    if (!templates) return {};
    
    return templates.reduce((acc, template) => {
      const category = template.category || 'Uncategorized';
      if (!acc[category]) {
        acc[category] = [];
      }
      acc[category].push(template);
      return acc;
    }, {} as Record<string, QualityAuditChecklistTemplate[]>);
  }, [templates]);

  const creationTiles = [
    {
      title: 'Manual Creation',
      description: 'Start from a blank canvas and build sections by hand.',
      icon: PencilLine,
    },
    {
      title: 'Import from Matrix',
      description: 'Pull regulations and clauses from the coherence matrix.',
      icon: Library,
    },
    {
      title: 'Import from Gap Analyses',
      description: 'Reuse existing gap-analysis structure as a template.',
      icon: Layers3,
    },
    {
      title: 'Generate with AI',
      description: 'Paste text, upload files, or drop images for AI-assisted creation.',
      icon: Bot,
    },
  ];


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
        <MainPageHeader 
          title="Gap Checklists"
          description="Manage the checklist templates that feed the live gap analysis records."
          actions={
            <Button asChild variant={isMobile ? 'outline' : 'default'} className={isMobile ? HEADER_MOBILE_ACTION_BUTTON_CLASS : HEADER_ACTION_BUTTON_CLASS}>
              <Link href="/quality/gap-analyses/template/new">
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4">+</span>
                  New Gap Analysis Template
                </span>
              </Link>
            </Button>
          }
        />
        <div className="border-t bg-muted/20 px-4 py-4 md:px-6">
          <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h3 className="text-sm font-black uppercase tracking-[0.16em] text-foreground">Creation Methods</h3>
              <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                Choose how you want to start a new template.
              </p>
            </div>
            <span className="text-[10px] font-black uppercase tracking-[0.16em] text-muted-foreground">
              4 options
            </span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {creationTiles.map((tile) => {
              const Icon = tile.icon;
              return (
                <Button
                  key={tile.title}
                  asChild
                  variant="outline"
                  className="h-auto min-h-[104px] w-full justify-start border-[hsl(var(--header-button-border))] bg-background p-4 text-left shadow-none hover:bg-muted/40"
                >
                  <Link href="/quality/gap-analyses/template/new">
                    <div className="flex w-full items-start gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border bg-muted/40">
                        <Icon className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="text-sm font-black uppercase tracking-tight">{tile.title}</div>
                        <div className="text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                          {tile.description}
                        </div>
                      </div>
                    </div>
                  </Link>
                </Button>
              );
            })}
          </div>
        </div>
        
        <CardContent className={cn("flex-1 p-0 bg-muted/5", isMobile ? "overflow-y-auto" : "overflow-hidden")}>
          <ScrollArea className={cn(isMobile ? "h-auto" : "h-full")}>
            <div className="p-4 md:p-6 pb-20">
              {Object.keys(groupedTemplates).length > 0 ? (
                  <Accordion type="multiple" defaultValue={Object.keys(groupedTemplates)} className="w-full space-y-6">
                    {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                        <GapAnalysisTemplateCard 
                            key={category}
                            category={category}
                            templates={categoryTemplates}
                            tenantId={tenantId || ''}
                            personnel={personnel || []}
                            departments={departments || []}
                        />
                    ))}
                  </Accordion>
              ) : (
                <div className="text-center py-20 text-muted-foreground italic uppercase font-bold text-[10px] tracking-widest bg-background rounded-2xl border-2 border-dashed shadow-sm">
                    No gap analysis templates found.
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
