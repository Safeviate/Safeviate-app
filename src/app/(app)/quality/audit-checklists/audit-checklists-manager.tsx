'use client';

import { useMemo, useState, useEffect } from 'react';
import { NewChecklistDialog } from './new-checklist-dialog';
import { ChecklistTemplateCard } from './checklist-template-card';
import { Accordion } from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MainPageHeader, CARD_HEADER_BAND_CLASS, HEADER_COMPACT_CONTROL_CLASS } from "@/components/page-header";
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';
import { useUserProfile } from '@/hooks/use-user-profile';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import type { ExternalOrganization, QualityAuditChecklistTemplate } from '@/types/quality';
import type { Department } from '../../admin/department/page';
import type { Personnel } from '../../users/personnel/page';

export default function AuditChecklistsManager() {
  const { tenantId } = useUserProfile();
  const isMobile = useIsMobile();
  const pathname = usePathname();
  const activeTab = pathname?.startsWith('/quality/audits') ? 'audits' : 'checklists';

  const [templates, setTemplates] = useState<QualityAuditChecklistTemplate[]>([]);
  const [personnel, setPersonnel] = useState<Personnel[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [organizations, setOrganizations] = useState<ExternalOrganization[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingTemplate, setEditingTemplate] = useState<QualityAuditChecklistTemplate | null>(null);

  const loadData = async () => {
    try {
        const [templatesResponse, personnelResponse, deptsResponse, organizationsResponse] = await Promise.all([
          fetch('/api/quality-audit-templates', { cache: 'no-store' }),
          fetch('/api/personnel', { cache: 'no-store' }),
          fetch('/api/departments', { cache: 'no-store' }),
          fetch('/api/external-organizations', { cache: 'no-store' }),
        ]);
        const [templatesPayload, personnelPayload, deptsPayload, organizationsPayload] = await Promise.all([
          templatesResponse.json().catch(() => ({ templates: [] })),
          personnelResponse.json().catch(() => ({ personnel: [] })),
          deptsResponse.json().catch(() => ({ departments: [] })),
          organizationsResponse.json().catch(() => ({ organizations: [] })),
        ]);
        setTemplates(Array.isArray(templatesPayload.templates) ? templatesPayload.templates : []);
        setPersonnel(Array.isArray(personnelPayload.personnel) ? personnelPayload.personnel : []);
        setDepartments(Array.isArray(deptsPayload.departments) ? deptsPayload.departments : []);
        setOrganizations(Array.isArray(organizationsPayload.organizations) ? organizationsPayload.organizations : []);
    } catch (e) {
        console.error('Failed to load audit template data', e);
    } finally {
        setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
    window.addEventListener('safeviate-quality-templates-updated', loadData);
    window.addEventListener('safeviate-departments-updated', loadData);
    return () => {
      window.removeEventListener('safeviate-quality-templates-updated', loadData);
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
          title="Audit Checklists"
          actions={
            <NewChecklistDialog
                tenantId={tenantId || ''}
                departments={departments || []}
            />
          }
        />
        <NewChecklistDialog
          tenantId={tenantId || ''}
          departments={departments || []}
          existingTemplate={editingTemplate || undefined}
          showTrigger={false}
          open={Boolean(editingTemplate)}
          onOpenChange={(open) => {
            if (!open) setEditingTemplate(null);
          }}
        />
        <div className={CARD_HEADER_BAND_CLASS}>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              asChild
              variant={activeTab === 'checklists' ? 'default' : 'outline'}
              className={HEADER_COMPACT_CONTROL_CLASS}
            >
              <Link href="/quality/audit-checklists">Audit Checklists</Link>
            </Button>
            <Button
              asChild
              variant={activeTab === 'audits' ? 'default' : 'outline'}
              className={HEADER_COMPACT_CONTROL_CLASS}
            >
              <Link href="/quality/audits">Audits</Link>
            </Button>
          </div>
        </div>
        <CardContent className={cn("flex-1 p-0 bg-muted/5", isMobile ? "overflow-y-auto" : "overflow-hidden")}>
          <ScrollArea className={cn(isMobile ? "h-auto" : "h-full")}>
            <div className="p-4 md:p-6 pb-20">
              {Object.keys(groupedTemplates).length > 0 ? (
                  <Accordion type="multiple" defaultValue={Object.keys(groupedTemplates)} className="w-full space-y-6">
                    {Object.entries(groupedTemplates).map(([category, categoryTemplates]) => (
                        <ChecklistTemplateCard 
                            key={category}
                            category={category}
                            templates={categoryTemplates}
                            tenantId={tenantId || ''}
                            personnel={personnel || []}
                            departments={departments || []}
                            organizations={organizations || []}
                            onEditTemplate={setEditingTemplate}
                        />
                    ))}
                  </Accordion>
              ) : (
                <div className="text-center py-20 text-muted-foreground italic uppercase font-bold text-[10px] tracking-widest bg-background rounded-2xl border-2 border-dashed shadow-sm">
                    No checklist templates found.
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
