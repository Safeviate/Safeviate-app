/**
 * @fileOverview OpenAI-backed document parsing flow for the coherence matrix.
 */

import { z } from 'genkit';
import { ensureAiEnvironment, resolveAiApiKey } from '@/lib/server/ai-env';

ensureAiEnvironment('document summarization');

const RegulationSchema = z.object({
  regulationCode: z.string().describe('The full code for the extracted item.'),
  regulationStatement: z.string().describe('The short, official title or heading of the extracted item only.'),
  technicalStandard: z.string().describe('The detailed text body for that specific extracted item only.'),
  companyReference: z.string().describe('A suggested internal manual reference placeholder.'),
  parentRegulationCode: z.string().optional().describe('The parent item code for this extracted item.'),
});

export const SummarizeDocumentInputSchema = z.object({
  targetParentCode: z.string().optional().describe('The code of the selected manual parent item that these extracted items should sit under.'),
  document: z.object({
    text: z.string().optional().describe('The full text content of the regulations document.'),
    images: z.array(z.string()).optional().describe("A sequence of photos of the regulations document, as data URIs."),
  }),
  isMultiPage: z.boolean().optional().describe('If true, treat the sequence of images as a single, continuous document.'),
});
export type SummarizeDocumentInput = z.infer<typeof SummarizeDocumentInputSchema>;

export const SummarizeDocumentOutputSchema = z.object({
  requirements: z.array(RegulationSchema).describe('An array of structured compliance requirements extracted from the document.'),
});
export type SummarizeDocumentOutput = z.infer<typeof SummarizeDocumentOutputSchema>;

const OpenAiRequirementSchema = z.object({
  regulationCode: z.string(),
  regulationStatement: z.string(),
  technicalStandardLines: z.array(z.string()).default([]),
  companyReference: z.string(),
  parentRegulationCode: z.string().optional(),
});

const OpenAiSummarizeDocumentOutputSchema = z.object({
  requirements: z.array(OpenAiRequirementSchema).default([]),
});

function extractJsonPayload(content: string) {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch?.[1] ?? content;
  return JSON.parse(candidate.trim());
}

function normalizeCodeFragment(value: string) {
  return value.trim().replace(/\s+/g, ' ').replace(/[.,;:]+$/g, '');
}

function resolveRegulationCode(rawCode: string, parentCode?: string | null) {
  const code = normalizeCodeFragment(rawCode);
  const normalizedParent = parentCode?.trim() || '';

  if (!code) return code;
  if (!normalizedParent) return code;
  if (code === normalizedParent || code.startsWith(`${normalizedParent}.`)) return code;

  const compoundMatch = code.match(/^(\d+(?:\.\d+)*)(?:\s*\(([a-z])\))$/i);
  if (compoundMatch) {
    return `${normalizedParent}.${compoundMatch[1]}(${compoundMatch[2].toLowerCase()})`;
  }

  const clauseMatch = code.match(/^(\d+)\s*([a-z])$/i);
  if (clauseMatch) {
    return `${normalizedParent}.${clauseMatch[1]}${clauseMatch[2].toLowerCase()}`;
  }

  const dottedNumericMatch = code.match(/^(\d+(?:\.\d+)*)$/);
  if (dottedNumericMatch) {
    return `${normalizedParent}.${dottedNumericMatch[1]}`;
  }

  return code;
}

function buildUserContent(input: SummarizeDocumentInput) {
  const textInstructions = [
    'Extract the document structure for the coherence matrix.',
    'Return only valid JSON in exactly this shape:',
    '{ "requirements": [ { "regulationCode": string, "regulationStatement": string, "technicalStandardLines": string[], "companyReference": string, "parentRegulationCode": string } ] }',
    'Only extract items that belong under the selected parent section.',
    'Use exactly the codes that are printed in the document. Do not invent extra decimal levels such as 2.1, 2.2, or 141.01.18.1.1 unless those codes are explicitly visible in the source.',
    'Create one requirement per visible heading or subheading, not one requirement per clause or paragraph.',
    'Keep each heading together with every clause, subclause, note, bullet, or paragraph that belongs to that heading.',
    'Do not split numbered or lettered clauses into separate requirements.',
    'If the visible heading code is abbreviated to just a local section number like 2 under the selected parent code 141.01.18, reconstruct the full code as 141.01.18.2.',
    'If a heading is followed by clauses such as (1), (2), (a), or (b), return those clauses as technicalStandardLines on the same requirement, in reading order.',
    'If the source has a genuine nested subheading, create a separate requirement for that subheading and link it with parentRegulationCode. Otherwise keep the clauses on the same requirement.',
    'If a heading line contains both a code and title, use the code for regulationCode and the title for regulationStatement.',
    'If a line is only a running page header, footer, page number, or repeated document title, ignore it.',
    'Preserve numbering order and wording as closely as possible. Keep the original paragraph flow, do not condense or paraphrase.',
    'Example: "2. Quality assurance" followed by clauses (1) to (8) should become one requirement with regulationCode "2", regulationStatement "Quality assurance", and all clauses in technicalStandardLines.',
    'Example: "141.01.18.1.1 Quality policy and strategy" followed by clauses (1) to (4) should become one requirement with regulationCode "141.01.18.1.1", regulationStatement "Quality policy and strategy", and those clauses in technicalStandardLines.',
    'Example: if a clause list under a heading contains sub-bullets like (a) through (g), keep them inside technicalStandardLines for that same heading unless the document explicitly prints a deeper heading code.',
    `Selected Parent Code: ${input.targetParentCode || ''}`,
    input.isMultiPage ? 'Treat the supplied images as pages of a single continuous document.' : '',
    input.document.text ? `Document Content:\n${input.document.text}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');

  const content: Array<{ type: string; text?: string; image_url?: { url: string } }> = [
    { type: 'text', text: textInstructions },
  ];

  for (const image of input.document.images || []) {
    content.push({
      type: 'image_url',
      image_url: { url: image },
    });
  }

  return content;
}

async function runOpenAiSummarizeDocument(input: SummarizeDocumentInput) {
  const apiKey = resolveAiApiKey();
  if (!apiKey) {
    throw new Error('Safeviate_AI_KEY or OPENAI_API_KEY is missing.');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL_SUMMARIZE_DOCUMENT || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      temperature: 0.1,
      max_completion_tokens: 6000,
      messages: [
        {
          role: 'system',
          content:
            'You are an expert aviation regulatory compliance analyst. Return only valid JSON. Extract compliance requirements with careful numbering fidelity. Preserve the printed hierarchy exactly. Never invent new section codes. Never split subordinate clauses into separate requirements unless the source shows a real nested heading.',
        },
        {
          role: 'user',
          content: buildUserContent(input),
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.error ||
      'OpenAI request failed while extracting compliance requirements.';
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI returned an empty response for document summarization.');
  }

  const parsed = extractJsonPayload(content);
  return OpenAiSummarizeDocumentOutputSchema.parse(parsed);
}

export async function summarizeDocument(input: SummarizeDocumentInput): Promise<SummarizeDocumentOutput> {
  const output = await runOpenAiSummarizeDocument(input);
  const targetParentCode = input.targetParentCode?.trim() || '';

  const normalized = output.requirements.map((requirement) => ({
    regulationCode: resolveRegulationCode(requirement.regulationCode, targetParentCode),
    regulationStatement: requirement.regulationStatement.trim(),
    technicalStandard: requirement.technicalStandardLines
      .map((line) => line.trim())
      .filter(Boolean)
      .join('\n'),
    companyReference: requirement.companyReference.trim() || 'Ops Manual, Sec TBD',
    parentRegulationCode: requirement.parentRegulationCode?.trim() || targetParentCode || '',
  }));

  return SummarizeDocumentOutputSchema.parse({ requirements: normalized });
}
