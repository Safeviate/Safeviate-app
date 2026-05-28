'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { TenantLayoutDisabledState } from '@/components/tenant-layout-disabled-state';
import { useTenantRouteAccess } from '@/hooks/use-tenant-route-access';
import { TemplateEditorDialog } from '@/components/template-editor-dialog';
import type { QualityAuditChecklistTemplate } from '@/types/quality';
import type { Department } from '../../../../admin/department/page';
import { useUserProfile } from '@/hooks/use-user-profile';
import { AiGapAnalysisGenerator } from '../../ai-gap-analysis-generator';
import { ImportFromMatrixDialog } from '../../import-from-matrix-dialog';
import { ImportFromGapAnalysesDialog } from '../../import-from-gap-analyses-dialog';

export default function GapAnalysisTemplateEditorPage() {
  const { isLoading, isAllowed } = useTenantRouteAccess({ href: '/quality/gap-analyses' });
  const params = useParams<{ templateId: string }>();
  const { tenantId } = useUserProfile();

  const templateId = params?.templateId ?? 'new';
  const [templates, setTemplates] = useState<QualityAuditChecklistTemplate[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [isDataLoading, setIsDataLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [templatesResponse, departmentsResponse] = await Promise.all([
          fetch('/api/quality-gap-analysis-templates', { cache: 'no-store' }),
          fetch('/api/departments', { cache: 'no-store' }),
        ]);
        const [templatesPayload, departmentsPayload] = await Promise.all([
          templatesResponse.json().catch(() => ({ templates: [] })),
          departmentsResponse.json().catch(() => ({ departments: [] })),
        ]);
        if (!cancelled) {
          setTemplates(Array.isArray(templatesPayload.templates) ? templatesPayload.templates : []);
          setDepartments(Array.isArray(departmentsPayload.departments) ? departmentsPayload.departments : []);
        }
      } catch (error) {
        console.error('Failed to load gap template editor data', error);
      } finally {
        if (!cancelled) setIsDataLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const existingTemplate = useMemo(
    () => (templateId === 'new' ? undefined : templates.find((template) => template.id === templateId)),
    [templateId, templates]
  );

  if (!isLoading && !isAllowed) {
    return <TenantLayoutDisabledState />;
  }

  if (isDataLoading) {
    return (
      <div className="max-w-[1100px] mx-auto w-full flex flex-col gap-4 px-1 pt-4">
        <Skeleton className="h-14 w-full" />
        <Card className="border shadow-none">
          <CardContent className="p-6 space-y-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-64 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <TemplateEditorDialog
      tenantId={tenantId || ''}
      departments={departments}
      existingTemplate={existingTemplate}
      templateLabel="Gap Analysis"
      dialogDescription="Build a reusable gap analysis template with sections and items for conducting quality reviews."
      saveEndpoint="/api/quality-gap-analysis-templates"
      successCreateTitle="Template Created"
      successUpdateTitle="Template Updated"
      successDescription="The gap analysis template has been saved."
      generatedToastTitle="Gap Analysis Generated"
      generatedToastDescription={(count) => `${count} sections have been added to the form.`}
      importedToastTitle="Imported from Matrix"
      importedToastDescription={(count) => `${count} sections have been added to your gap analysis.`}
      enableOrganizationSelection
      renderSectionActions={({ complianceItems, onAiGeneratedSections, onImportFromMatrix }) => (
        <>
          <ImportFromMatrixDialog complianceItems={complianceItems} onImport={onImportFromMatrix} />
          <ImportFromGapAnalysesDialog onImport={onImportFromMatrix} />
          <AiGapAnalysisGenerator onGenerated={onAiGeneratedSections} />
        </>
      )}
      renderAsPage
      pageBackHref="/quality/gap-analyses"
      pageBackText="Back to Gap Checklists"
    />
  );
}
