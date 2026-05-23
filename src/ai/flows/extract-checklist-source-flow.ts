/**
 * @fileOverview Vision/text transcription flow used to normalize source documents before checklist extraction.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

export const ExtractChecklistSourceInputSchema = z.object({
  document: z.object({
    text: z.string().optional().describe('Optional text already extracted from the source document.'),
    image: z
      .string()
      .optional()
      .describe("A photo of the source document, as a data URI that must include a MIME type and use Base64 encoding."),
  }),
});

export type ExtractChecklistSourceInput = z.infer<typeof ExtractChecklistSourceInputSchema>;

export const ExtractChecklistSourceOutputSchema = z.object({
  transcript: z
    .string()
    .describe('A faithful plain-text transcript of the source document with layout cues preserved for downstream parsing.'),
});

export type ExtractChecklistSourceOutput = z.infer<typeof ExtractChecklistSourceOutputSchema>;

export async function extractChecklistSource(
  input: ExtractChecklistSourceInput
): Promise<ExtractChecklistSourceOutput> {
  return extractChecklistSourceFlow(input);
}

const prompt = ai.definePrompt({
  name: 'extractChecklistSourcePrompt',
  input: { schema: ExtractChecklistSourceInputSchema },
  output: { schema: ExtractChecklistSourceOutputSchema },
  prompt: `You are an expert OCR and document-layout reconstruction assistant.

Your task is to convert the provided source into a faithful plain-text transcript that preserves layout cues for downstream checklist extraction.

Rules:
- Do not summarize, interpret, or normalize the wording.
- Preserve headings, numbering, bullets, clause markers, table row breaks, and paragraph breaks.
- If the source looks like a table, represent each meaningful row on its own line and separate cells with " | ".
- If a row contains multiple distinct clauses or bullet points, keep each visible item on its own line.
- If the source contains normal paragraphs, keep paragraph breaks.
- Do not merge separate items into one line.
- Do not invent text that is not visible.
- If some text is unclear, keep the closest visible wording and retain the visible line structure.
- Return plain text only inside the transcript field.

{{#if document.text}}
Supporting Text:
{{document.text}}
{{/if}}

{{#if document.image}}
Document Image:
{{media url=document.image}}
{{/if}}
`,
});

const extractChecklistSourceFlow = ai.defineFlow(
  {
    name: 'extractChecklistSourceFlow',
    inputSchema: ExtractChecklistSourceInputSchema,
    outputSchema: ExtractChecklistSourceOutputSchema,
  },
  async (input) => {
    const { output } = await prompt(input);
    if (!output?.transcript) {
      return { transcript: input.document.text?.trim() || '' };
    }

    return {
      transcript: output.transcript.trim(),
    };
  }
);
