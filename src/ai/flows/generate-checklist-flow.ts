/**
 * @fileOverview This file defines a Genkit flow for parsing a document (text or image) and extracting checklist sections and items.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { v4 as uuidv4 } from 'uuid';
import { extractChecklistSource } from '@/ai/flows/extract-checklist-source-flow';

const checklistItemSchema = z.object({
  id: z.string(),
  text: z.string().describe("The full text of the checklist item."),
  type: z.enum(['Checkbox', 'Textbox', 'Number', 'Date']).describe("The suggested type for the checklist item. Default to 'Checkbox' if unsure."),
  regulationReference: z.string().optional().describe("Any regulation code this item refers to, if present."),
});

const sectionSchema = z.object({
    id: z.string(),
    title: z.string().describe("The title or heading of the checklist section."),
    items: z.array(checklistItemSchema).describe('An array of checklist items within this section.'),
});

export const GenerateChecklistInputSchema = z.object({
  document: z.object({
    text: z.string().optional().describe('The full text content of the checklist document.'),
    image: z.string().optional().describe("A photo of the checklist document, as a data URI that must include a MIME type and use Base64 encoding. Expected format: 'data:<mimetype>;base64,<encoded_data>'."),
  })
});
export type GenerateChecklistInput = z.infer<typeof GenerateChecklistInputSchema>;

export const GenerateChecklistOutputSchema = z.object({
  sections: z.array(sectionSchema).describe('An array of structured checklist sections with their items.'),
});
export type GenerateChecklistOutput = z.infer<typeof GenerateChecklistOutputSchema>;


export async function generateChecklist(input: GenerateChecklistInput): Promise<GenerateChecklistOutput> {
    return generateChecklistFlow(input);
}

const normalizeDocumentText = (text: string) => {
    const lines = text.split(/\r?\n/);
    const normalizedLines = lines.map((line) => {
        const trimmed = line.trimEnd();
        if (!trimmed.trim()) return '';

        const looksLikeTableRow = /[\t|]/.test(trimmed) || /\S(?:\s{2,}\S)+/.test(trimmed);
        if (!looksLikeTableRow) {
            return trimmed;
        }

        const cells = trimmed
            .replace(/\s*\|\s*/g, '\t')
            .split(/\t|\s{2,}/)
            .map((cell) => cell.trim())
            .filter(Boolean);

        return cells.length >= 2 ? cells.join(' | ') : trimmed;
    });

    return normalizedLines.join('\n');
};

const prompt = ai.definePrompt({
    name: 'generateChecklistPrompt',
    input: { schema: GenerateChecklistInputSchema },
    output: { schema: GenerateChecklistOutputSchema },
    prompt: `You are an expert checklist extraction assistant. Your task is to analyze the provided document content (which could be text or an image) and extract a structured checklist from it.

The source may be a traditional regulation clause list, a table, a bulleted checklist, or normal narrative paragraphs. Identify the main sections first, then list all individual checklist items within each section.

For tables:
- Treat each meaningful row as a potential item.
- If a row has a left-hand label or requirement code and a right-hand description, preserve the wording and combine them into one item only if that is how the source presents the requirement.
- If a table row contains multiple distinct obligations, split them into separate items.

For paragraphs:
- Split a paragraph into separate items when the source clearly contains multiple obligations, bullets, numbered clauses, or semi-colon separated requirements.
- Preserve the original wording and order as closely as possible.

For all source types:
- Do not rewrite statements into questions.
- Do not paraphrase.
- Do not merge multiple numbered, bulleted, or clearly separate requirements into one item.
- Preserve the source wording exactly, with only surrounding whitespace trimmed.
- If a reference or code is present, extract it into regulationReference.

For each item, determine the most appropriate type: 'Checkbox' (for yes/no or confirmation tasks), 'Textbox' (for free-text notes), 'Number' (for numerical input), or 'Date'. Default to 'Checkbox' if unsure.

Structure the output into an array of sections, where each section has a title and an array of items. Each item must have an id (generate a new UUID for it), text, type, and an optional regulationReference.

Analyze the following document and extract the checklist:

{{#if document.text}}
Document Content:
{{document.text}}
{{/if}}

{{#if document.image}}
Document Image:
{{media url=document.image}}
{{/if}}
`,
});

const generateChecklistFlow = ai.defineFlow(
  {
    name: 'generateChecklistFlow',
    inputSchema: GenerateChecklistInputSchema,
    outputSchema: GenerateChecklistOutputSchema,
  },
  async (input) => {
    let sourceText = input.document.text?.trim() || '';
    let sourceImage = input.document.image;

    if (input.document.image) {
      try {
        const extracted = await extractChecklistSource({
          document: {
            text: input.document.text,
            image: input.document.image,
          },
        });

        if (extracted.transcript.trim()) {
          sourceText = extracted.transcript;
          sourceImage = undefined;
        }
      } catch (error) {
        console.error('Checklist source transcription failed, falling back to direct extraction.', error);
      }
    }

    const normalizedInput: GenerateChecklistInput = {
      document: {
        ...input.document,
        text: sourceText ? normalizeDocumentText(sourceText) : input.document.text,
        image: sourceImage,
      },
    };

    const { output } = await prompt(normalizedInput);
    
    if (!output) {
      return { sections: [] };
    }

    // Ensure all items have a UUID
    const sectionsWithIds = output.sections.map(section => ({
      ...section,
      id: section.id || uuidv4(),
      items: section.items.map(item => ({
        ...item,
        id: item.id || uuidv4(),
        type: item.type || 'Checkbox', // Default to checkbox
      }))
    }));

    return { sections: sectionsWithIds };
  }
);
