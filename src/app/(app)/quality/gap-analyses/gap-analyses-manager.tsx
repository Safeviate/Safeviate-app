'use client';

import { useMemo, useState, useEffect } from 'react';
import { NewGapAnalysisDialog } from './new-gap-analysis-dialog';
import { GapAnalysisTemplateCard } from './gap-analysis-template-card';
import { Accordion } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MainPageHeader } from "@/components/page-header";
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserProfile } from '@/hooks/use-user-profile';
import type { QualityAuditChecklistTemplate } from '@/types/quality';
import type { Department } from '../../admin/department/page';
import type { Personnel } from '../../users/personnel/page';

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
          title="Gap Analyses"
          actions={
            <NewGapAnalysisDialog
                tenantId={tenantId || ''}
                departments={departments || []}
            />
          }
        />
        
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
