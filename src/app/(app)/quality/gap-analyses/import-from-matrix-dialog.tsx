'use client';

import type { ChecklistSection, ComplianceRequirement } from '@/types/quality';
import { ImportFromMatrixDialog as AuditImportFromMatrixDialog } from '../audit-checklists/import-from-matrix-dialog';

interface ImportFromMatrixDialogProps {
  complianceItems: ComplianceRequirement[];
  onImport: (sections: ChecklistSection[]) => void;
}

export function ImportFromMatrixDialog({ complianceItems, onImport }: ImportFromMatrixDialogProps) {
  return (
    <AuditImportFromMatrixDialog
      complianceItems={complianceItems}
      onImport={(sections) =>
        onImport(
          sections.map((section) => ({
            ...section,
            items: section.items.map((item) => {
              const { responsibleManagerId, ...rest } = item;
              return rest;
            }),
          }))
        )
      }
    />
  );
}
