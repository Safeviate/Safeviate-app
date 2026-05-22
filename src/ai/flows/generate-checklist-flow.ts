/**
 * @fileOverview This file defines a Genkit flow for parsing a document (text or image) and extracting checklist sections and items.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';
import { v4 as uuidv4 } from 'uuid';

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

const prompt = ai.definePrompt({
    name: 'generateChecklistPrompt',
    input: { schema: GenerateChecklistInputSchema },
    output: { schema: GenerateChecklistOutputSchema },
    prompt: `You are an expert in aviation compliance and operations. Your task is to analyze the provided document content (which could be text or an image) and extract a structured audit checklist.

Identify the main sections and then list all the individual clause lines or checkable items within each section. For each item, determine the most appropriate type: 'Checkbox' (for yes/no or confirmation tasks), 'Textbox' (for free-text notes), 'Number' (for numerical input), or 'Date'. If a regulation is referenced, extract it.

Preserve the source wording exactly. Do not rewrite statements into questions, do not paraphrase, and do not combine multiple numbered or bulleted clauses into a single item. Each clause, bullet, or line should become its own item if it appears as a distinct entry in the source.

Structure the output into an array of sections, where each section has a title and an array of items. Each item must have an id (generate a new UUID for it), text, type, and an optional regulationReference. The item text should match the source line as closely as possible, with only surrounding whitespace trimmed.

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
    const { output } = await prompt(input);
    
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
