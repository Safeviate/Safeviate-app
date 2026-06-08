/**
 * @fileOverview OpenAI-backed document parsing flow for the coherence matrix.
 */

import { z } from 'genkit';
import { ensureAiEnvironment, resolveAiApiKey } from '@/lib/server/ai-env';

ensureAiEnvironment('document summarization');

const RegulationSchema = z.object({
  regulationCode: z.string().describe('The full code for the extracted item.'),
  documentHeading: z.string().optional().describe('A printed heading shown immediately above the regulation block, if present.'),
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
  documentHeading: z.string().optional(),
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
  return value.trim().replace(/\s+/g, ' ').replace(/[;:]+$/g, '').replace(/\.$/g, '');
}

function resolveRegulationCode(rawCode: string, parentCode?: string | null) {
  const code = normalizeCodeFragment(rawCode);
  const normalizedParent = parentCode?.trim() || '';

  if (!code) return code;
  if (!normalizedParent) return code;
  if (code === normalizedParent || code.startsWith(`${normalizedParent}.`)) return code;
  if (/^(?:Part|Subpart)\s+\d+[A-Z]?/i.test(code)) return code;
  if (/^\d{2,3}\.\d{2}\.\d+(?:[A-Z]|\-[A-Z][A-Z\s-]*)?$/i.test(code)) return code;
  if (/^\d{2,3}\.\d{2}\.\d+\.\d+(?:\.\d+)*$/i.test(code)) return code;
  if (/^(?:SA-)?CATS\s+\d+/i.test(code)) return code;
  if (/^(?:SA-)?CARS\s+\d+/i.test(code)) return code;

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
    '{ "requirements": [ { "regulationCode": string, "documentHeading": string, "regulationStatement": string, "technicalStandardLines": string[], "companyReference": string, "parentRegulationCode": string } ] }',
    'Only extract items that belong under the selected parent section.',
    'Use exactly the codes that are printed in the document. Do not invent extra decimal levels such as 2.1, 2.2, or 141.01.18.1.1 unless those codes are explicitly visible in the source.',
    'Create one requirement per visible Part, Subpart, regulation heading, or technical-standard heading, not one requirement per clause or paragraph.',
    'Keep each heading together with every clause, subclause, note, bullet, or paragraph that belongs to that heading.',
    'Do not split numbered or lettered clauses into separate requirements.',
    'Recognize SACAA CAR/CATS layout patterns:',
    '- A contents page line like "Part 43  General Maintenance Rules" is a top-level heading row only. Use regulationCode "Part 43", regulationStatement "General Maintenance Rules", empty technicalStandardLines, and parentRegulationCode from the selected parent if supplied.',
    '- A part title page line like "Part 43" followed by "General Maintenance Rules" is the same top-level heading row. Ignore amendment notes such as "[As substituted by ...]" unless the user explicitly asks to extract amendment history.',
    '- A "LIST OF REGULATIONS" or index page has subpart rows and regulation rows. A line like "SUBPART 1: GENERAL" is a subheader row with regulationCode "SUBPART 1" and regulationStatement "GENERAL".',
    '- In an index/list page, a line like "43.01.3  Logbooks" is a regulation heading row with regulationCode "43.01.3", regulationStatement "Logbooks", empty technicalStandardLines, and parentRegulationCode set to the visible subpart code when available.',
    '- A detailed regulation page normally starts with a title line like "Logbooks" and then a printed regulation number like "43.01.3". Use "43.01.3" as regulationCode and "Logbooks" as regulationStatement.',
    '- On a detailed regulation page, paragraphs marked (1), (2), (3), (a), (b), (c), (i), (ii), (aa), or similar are body text only. Preserve them as technicalStandardLines under the same regulationCode.',
    '- Do not generate rows with regulationCode "(1)", "(a)", "(b)", "(i)", "(aa)", or similar subordinate markers.',
    '- If a detailed page contains "Document SA-CATS 43" inside a paragraph, treat it as a cross-reference in technicalStandardLines, not as a new matrix row.',
    'Recognize SACAA CATS / Technical Standards layout patterns:',
    '- A technical standards contents page line like "SA-CATS 43 General Maintenance Rules" is a top-level technical-standard document row. Use regulationCode "SA-CATS 43", regulationStatement "General Maintenance Rules", and empty technicalStandardLines.',
    '- A CATS list page headed "SA-CATS 43 General Maintenance Rules" and "LIST OF TECHNICAL STANDARDS" contains technical-standard section rows such as "43.02.3 CARRYING OUT OF MAINTENANCE". Use regulationCode "43.02.3" and regulationStatement "CARRYING OUT OF MAINTENANCE".',
    '- Under a CATS section row, numbered lines like "1. Maintenance control manual" and "2. Maintenance programme" are genuine child headings. Create separate requirements for them under parentRegulationCode "43.02.3".',
    '- For these numbered CATS child headings, if the selected parent is "43.02.3", reconstruct the child code as "43.02.3.1" for "1. Maintenance control manual" and "43.02.3.2" for "2. Maintenance programme".',
    '- A CATS detailed page often repeats the parent section heading, e.g. "43.02.3 CARRYING OUT OF MAINTENANCE", then shows numbered child headings like "1. Maintenance control manual". The parent section heading should be one row and each numbered child heading should be its own row.',
    '- If a pasted CATS detailed page only shows a numbered child heading like "1. Emergency and survival list" beneath a selected parent code, reconstruct it as the first child requirement under that parent (for example, "91.01.5.1"). Keep any printed parent heading line as documentHeading and the numbered heading text as regulationStatement.',
    '- Body paragraphs under a numbered CATS child heading marked (1), (2), (a), (b), (i), (ii), etc. are technicalStandardLines for that numbered child heading, not separate rows.',
    '- Editorial notes and substitution/amendment notes, e.g. "[Section 2 substituted by ...]" or "(Editorial Note: ...)", should be preserved in technicalStandardLines for the relevant child heading, not turned into rows.',
    'For SACAA CARS and similar regulations, treat a printed regulation number like 91.03.1 as the requirement heading unless the document shows a new printed regulation number.',
    'If the source then continues with subordinate levels like (a), (b), (i), (ii), (iii), or double-letter markers such as (aa) and (bb), keep those as subordinate text lines under the same parent requirement unless a new regulation heading is visibly printed.',
    'Do not promote subordinate markers such as (a), (i), or (aa) into standalone regulationCode values unless the document explicitly presents them as a true headed item with its own heading role.',
    'When a printed heading like "Documents to be carried on board" sits above regulation 91.03.1, store that printed heading in documentHeading.',
    'Use regulationStatement for the regulation item title or lead statement itself, not for the higher printed heading when both are present.',
    'If the visible heading code is abbreviated to just a local section number like 2 under the selected parent code 141.01.18, reconstruct the full code as 141.01.18.2.',
    'If a heading is followed by clauses such as (1), (2), (a), or (b), return those clauses as technicalStandardLines on the same requirement, in reading order.',
    'If the source has a genuine nested subheading, create a separate requirement for that subheading and link it with parentRegulationCode. Otherwise keep the clauses on the same requirement.',
    'If a heading line contains both a code and title, use the code for regulationCode and the title for regulationStatement.',
    'If a line is only a running page header, footer, page number, or repeated document title, ignore it.',
    'Preserve numbering order and wording as closely as possible. Keep the original paragraph flow, do not condense or paraphrase.',
    'When the source text includes separate paragraphs, list items, or copied rich-text formatting, keep those visible breaks as separate technicalStandardLines instead of merging them into one line.',
    'If a requirement contains nested paragraph or bullet levels, preserve each visible subparagraph or bullet on its own line in technicalStandardLines, even if the whole block still belongs to the same extracted requirement.',
    'Example: "2. Quality assurance" followed by clauses (1) to (8) should become one requirement with regulationCode "2", regulationStatement "Quality assurance", and all clauses in technicalStandardLines.',
    'Example: "141.01.18.1.1 Quality policy and strategy" followed by clauses (1) to (4) should become one requirement with regulationCode "141.01.18.1.1", regulationStatement "Quality policy and strategy", and those clauses in technicalStandardLines.',
    'Example: if a clause list under a heading contains sub-bullets like (a) through (g), keep them inside technicalStandardLines for that same heading unless the document explicitly prints a deeper heading code.',
    'Example: a contents page row "Part 43  General Maintenance Rules" should become { "regulationCode": "Part 43", "regulationStatement": "General Maintenance Rules", "technicalStandardLines": [] }.',
    'Example: a list page under "Part 43 General Maintenance Rules" with "SUBPART 1: GENERAL" and "43.01.3 Logbooks" should produce a subpart row plus a regulation row. The regulation row parentRegulationCode should be "SUBPART 1" unless the selected parent code should override it.',
    'Example: a detail page headed "Logbooks" with "43.01.3 (1) The following logbooks shall be kept..." should produce one requirement: regulationCode "43.01.3", regulationStatement "Logbooks", and technicalStandardLines containing "(1) The following logbooks shall be kept...", "(a) an approved aircraft logbook for each aircraft;", "(b) an approved engine logbook for each aircraft engine; and", "(c) an approved propeller logbook for each propeller.", and the remaining paragraphs in order.',
    'Example: a CATS contents row "SA-CATS 43 General Maintenance Rules" should become { "regulationCode": "SA-CATS 43", "regulationStatement": "General Maintenance Rules", "technicalStandardLines": [] }.',
    'Example: a CATS list page row "43.02.3 CARRYING OUT OF MAINTENANCE" followed by "1. Maintenance control manual" and "2. Maintenance programme" should produce a parent row "43.02.3" plus child rows "43.02.3.1" and "43.02.3.2".',
    'Example: a CATS detail page with "43.02.3 CARRYING OUT OF MAINTENANCE" then "1. Maintenance control manual" and clauses "(1)", "(a)", "(i)" should produce child requirement "43.02.3.1" with regulationStatement "Maintenance control manual" and all those clauses in technicalStandardLines.',
    'Example: under "43.02.5 OVERHAUL, REPAIR AND SUBSTITUTION OF MAJOR COMPONENTS", "1. Overhauls: General" and "2. Overhaul of components and installed equipment" are separate child headings, not merely body paragraphs.',
    'Example: "Documents to be carried on board" followed by regulation "91.03.1" and subordinate text "(a) If an aircraft is engaged...", "(i) a certificate of registration;", and "(xvi) if a flight in RVSM airspace is contemplated..." should remain one extracted requirement with regulationCode "91.03.1", documentHeading "Documents to be carried on board", the regulation lead sentence as regulationStatement, and every subordinate marker preserved in technicalStandardLines in reading order.',
    'Example: subordinate lines "(aa) a valid RVSM licence endorsement..." and "(bb) if applicable, a valid RVSM operational approval..." are still part of the same parent requirement unless a new printed regulation heading appears.',
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

function isStandaloneSubordinateMarker(code: string) {
  return /^\((?:\d+|[a-z]{1,2}|[ivxlcdm]+)\)$/i.test(code.trim());
}

function parseFallbackTextRequirements(input: SummarizeDocumentInput) {
  const parentCode = input.targetParentCode?.trim() || '';
  const rawText = input.document.text?.trim() || '';
  if (!parentCode || !rawText) return [];

  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (!lines.length) return [];

  const documentHeading = lines[0].match(/^(\d+(?:\.\d+)+)\s+(.+)$/)?.[2]?.trim() || '';
  const sectionPattern = /^(\d+)\.\s+(.+)$/;
  const requirements: Array<{
    regulationCode: string;
    documentHeading: string;
    regulationStatement: string;
    technicalStandard: string;
    companyReference: string;
    parentRegulationCode: string;
  }> = [];

  let currentSection: { number: string; title: string; body: string[] } | null = null;

  for (const line of lines) {
    const sectionMatch = line.match(sectionPattern);
    if (sectionMatch) {
      if (currentSection) {
        requirements.push({
          regulationCode: `${parentCode}.${currentSection.number}`,
          documentHeading,
          regulationStatement: currentSection.title,
          technicalStandard: currentSection.body.join('\n'),
          companyReference: 'Ops Manual, Sec TBD',
          parentRegulationCode: parentCode,
        });
      }

      currentSection = {
        number: sectionMatch[1],
        title: sectionMatch[2].trim(),
        body: [],
      };
      continue;
    }

    if (currentSection) {
      currentSection.body.push(line);
    }
  }

  if (currentSection) {
    requirements.push({
      regulationCode: `${parentCode}.${currentSection.number}`,
      documentHeading,
      regulationStatement: currentSection.title,
      technicalStandard: currentSection.body.join('\n'),
      companyReference: 'Ops Manual, Sec TBD',
      parentRegulationCode: parentCode,
    });
  }

  return requirements;
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
            'You are an expert aviation regulatory compliance analyst. Return only valid JSON. Extract compliance requirements with careful numbering fidelity. Preserve the printed hierarchy exactly. Never invent new section codes. Never split subordinate clauses into separate requirements unless the source shows a real nested heading. Treat CARS-style subordinate markers like (a), (i), and (aa) as nested text under the printed regulation heading unless a new regulation heading is visibly printed.',
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

  let normalized = output.requirements
    .map((requirement) => {
      const parentRegulationCode = requirement.parentRegulationCode?.trim() || targetParentCode || '';

      return {
        regulationCode: resolveRegulationCode(requirement.regulationCode, parentRegulationCode),
        documentHeading: requirement.documentHeading?.trim() || '',
        regulationStatement: requirement.regulationStatement.trim(),
        technicalStandard: requirement.technicalStandardLines
          .map((line) => line.trim())
          .filter(Boolean)
          .join('\n'),
        companyReference: requirement.companyReference.trim() || 'Ops Manual, Sec TBD',
        parentRegulationCode,
      };
    })
    .filter((requirement) => !isStandaloneSubordinateMarker(requirement.regulationCode));

  if (input.document.text?.trim() && targetParentCode) {
    const parentPrefix = `${targetParentCode.toLowerCase()}.`;
    const hasChildRequirement = normalized.some((requirement) => resolveRegulationCode(requirement.regulationCode, targetParentCode).toLowerCase().startsWith(parentPrefix));

    if (!hasChildRequirement) {
      const fallbackRequirements = parseFallbackTextRequirements(input);
      if (fallbackRequirements.length > 0) {
        normalized = fallbackRequirements;
      }
    }
  }

  return SummarizeDocumentOutputSchema.parse({ requirements: normalized });
}
