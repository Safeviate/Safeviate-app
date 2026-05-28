'use client';

import type { ReactNode } from 'react';
import { TemplateEditorDialog } from '@/components/template-editor-dialog';
import { AiGapAnalysisGenerator } from './ai-gap-analysis-generator';
import { ImportFromMatrixDialog } from './import-from-matrix-dialog';
import { ImportFromGapAnalysesDialog } from './import-from-gap-analyses-dialog';
import type { QualityAuditChecklistTemplate } from '@/types/quality';
import type { Department } from '../../admin/department/page';

interface NewGapAnalysisDialogProps {
  tenantId: string;
  departments: Department[];
  existingTemplate?: QualityAuditChecklistTemplate;
  trigger?: ReactNode;
}

export function NewGapAnalysisDialog({
  tenantId,
  departments,
  existingTemplate,
  trigger,
}: NewGapAnalysisDialogProps) {
  return (
    <TemplateEditorDialog
      tenantId={tenantId}
      departments={departments}
      existingTemplate={existingTemplate}
      trigger={trigger}
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
    />
  );
}
