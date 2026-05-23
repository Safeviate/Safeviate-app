'use client';

import { DocumentAiGenerator } from '@/components/document-ai-generator';
import type { ChecklistSection } from '@/types/quality';

interface AiGapAnalysisGeneratorProps {
  onGenerated: (sections: ChecklistSection[]) => void;
}

export function AiGapAnalysisGenerator({ onGenerated }: AiGapAnalysisGeneratorProps) {
  return (
    <DocumentAiGenerator
      onGenerated={onGenerated}
      labels={{
        triggerLabel: 'Generate with AI',
        dialogTitle: 'Generate Checklist with AI',
        dialogDescription: 'Upload a file, paste text, or paste an image of a checklist, table, or paragraph-based document. The AI will parse it into sections and items.',
        textPlaceholder: 'Paste the raw text, table content, or checklist paragraphs here...',
        fileLabel: 'Checklist File (.txt, etc.)',
        imageAlt: 'Pasted checklist',
        noImageLabel: 'Click here and paste an image (Ctrl+V)',
        emptyTitle: 'No Checklist Found',
        emptyDescription: 'The AI could not identify a checklist in the document.',
        generateButtonLabel: 'Generate Checklist',
        processingLabel: 'Processing...',
      }}
    />
  );
}
