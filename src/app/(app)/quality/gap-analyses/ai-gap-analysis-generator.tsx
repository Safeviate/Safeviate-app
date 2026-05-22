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
        dialogTitle: 'Generate Gap Analysis with AI',
        dialogDescription: 'Upload a file, paste text, or paste an image of a gap analysis source. The AI will parse it into sections and items.',
        textPlaceholder: 'Paste the raw text of the gap analysis source here...',
        fileLabel: 'Gap Analysis File (.txt, etc.)',
        imageAlt: 'Pasted gap analysis source',
        noImageLabel: 'Click here and paste an image (Ctrl+V)',
        emptyTitle: 'No Gap Analysis Found',
        emptyDescription: 'The AI could not identify a gap analysis in the document.',
        generateButtonLabel: 'Generate Gap Analysis',
        processingLabel: 'Processing...',
      }}
    />
  );
}
