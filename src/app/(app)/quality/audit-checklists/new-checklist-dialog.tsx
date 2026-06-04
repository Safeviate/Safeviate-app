'use client';

import type { ReactNode } from 'react';
import { TemplateEditorDialog } from '@/components/template-editor-dialog';
import { AiChecklistGenerator } from './ai-checklist-generator';
import { ImportFromMatrixDialog } from './import-from-matrix-dialog';
import { ImportFromGapAnalysesDialog } from './import-from-gap-analyses-dialog';
import type { QualityAuditChecklistTemplate } from '@/types/quality';
import type { Department } from '../../admin/department/page';

interface NewChecklistDialogProps {
  tenantId: string;
  departments: Department[];
  existingTemplate?: QualityAuditChecklistTemplate;
  trigger?: ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  showTrigger?: boolean;
}

export function NewChecklistDialog({
  tenantId,
  departments,
  existingTemplate,
  trigger,
  open,
  onOpenChange,
  showTrigger = true,
}: NewChecklistDialogProps) {
  return (
    <TemplateEditorDialog
      tenantId={tenantId}
      departments={departments}
      existingTemplate={existingTemplate}
      trigger={trigger}
      showTrigger={showTrigger}
      open={open}
      onOpenChange={onOpenChange}
      templateLabel="Checklist"
      dialogDescription="Build a reusable checklist with sections and items for conducting quality audits."
      saveEndpoint="/api/quality-audit-templates"
      successCreateTitle="Template Created"
      successUpdateTitle="Template Updated"
      successDescription="The checklist template has been saved."
      generatedToastTitle="Checklist Generated"
      generatedToastDescription={(count) => `${count} sections have been added to the form.`}
      importedToastTitle="Imported from Matrix"
      importedToastDescription={(count) => `${count} sections have been added to your checklist.`}
      renderSectionActions={({ complianceItems, onAiGeneratedSections, onImportFromMatrix }) => (
        <>
          <ImportFromMatrixDialog complianceItems={complianceItems} onImport={onImportFromMatrix} />
          <ImportFromGapAnalysesDialog onImport={onImportFromMatrix} />
          <AiChecklistGenerator onGenerated={onAiGeneratedSections} />
        </>
      )}
    />
  );
}
