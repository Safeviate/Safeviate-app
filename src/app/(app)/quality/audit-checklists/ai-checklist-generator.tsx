'use client';

import { DocumentAiGenerator } from '@/components/document-ai-generator';
import type { ChecklistSection } from '@/types/quality';

interface AiChecklistGeneratorProps {
  onGenerated: (sections: ChecklistSection[]) => void;
}

export function AiChecklistGenerator({ onGenerated }: AiChecklistGeneratorProps) {
  return (
    <DocumentAiGenerator
      onGenerated={onGenerated}
      labels={{
        triggerLabel: 'Generate with AI',
        dialogTitle: 'Generate Checklist with AI',
        dialogDescription: 'Upload a file, paste text, or paste an image of a checklist. The AI will parse it into sections and items.',
        textPlaceholder: 'Paste the raw text of the checklist here...',
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
