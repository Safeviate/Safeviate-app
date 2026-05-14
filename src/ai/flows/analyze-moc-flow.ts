/**
 * @fileOverview OpenAI-backed implementation for analyzing a Management of Change proposal.
 */

import { z } from 'genkit';
import { v4 as uuidv4 } from 'uuid';
import { ensureAiEnvironment, resolveAiApiKey } from '@/lib/server/ai-env';

ensureAiEnvironment('MOC analysis');

export const AnalyzeMocInputSchema = z.object({
  title: z.string().describe('The title of the proposed change.'),
  description: z.string().describe('A detailed description of what is changing.'),
  reason: z.string().describe('The reason why the change is being made.'),
  scope: z.string().describe('Who and what will be affected by the change.'),
});
export type AnalyzeMocInput = z.infer<typeof AnalyzeMocInputSchema>;

const riskSchema = z.object({
  id: z.string().describe('A unique UUID for this risk.'),
  description: z.string().describe('A detailed description of the specific risk.'),
});

const hazardSchema = z.object({
  id: z.string().describe('A unique UUID for this hazard.'),
  description: z.string().describe('A concise description of the hazard.'),
  risks: z.array(riskSchema).describe('A list of risks associated with this hazard.'),
});

const stepSchema = z.object({
  id: z.string().describe('A unique UUID for this step.'),
  description: z.string().describe('A description of the specific, actionable implementation step.'),
  hazards: z.array(hazardSchema).describe('A list of potential hazards that could arise during this step.'),
});

const phaseSchema = z.object({
  id: z.string().describe('A unique UUID for this phase.'),
  title: z.string().describe('The title of the implementation phase.'),
  steps: z.array(stepSchema).describe('A list of steps within this phase.'),
});

export const AnalyzeMocOutputSchema = z.object({
  phases: z.array(phaseSchema).describe('An array of logical implementation phases for the proposed change.'),
});
export type AnalyzeMocOutput = z.infer<typeof AnalyzeMocOutputSchema>;

const OpenAiAnalyzeMocOutputSchema = z.object({
  phases: z.array(
    z.object({
      title: z.string(),
      steps: z.array(
        z.object({
          description: z.string(),
          hazards: z.array(
            z.object({
              description: z.string(),
              risks: z.array(
                z.object({
                  description: z.string(),
                })
              ).default([]),
            })
          ).default([]),
        })
      ).default([]),
    })
  ).default([]),
});

function extractJsonPayload(content: string) {
  const fencedMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const fencedCandidate = fencedMatch?.[1]?.trim();
  if (fencedCandidate) {
    return JSON.parse(fencedCandidate);
  }

  const trimmed = content.trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return JSON.parse(trimmed.slice(firstBrace, lastBrace + 1));
  }

  return JSON.parse(trimmed);
}

async function runOpenAiAnalyzeMoc(input: AnalyzeMocInput) {
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
      model: process.env.OPENAI_MODEL_ANALYZE_MOC || process.env.OPENAI_MODEL || 'gpt-4.1-mini',
      temperature: 0.2,
      max_completion_tokens: 6000,
      response_format: {
        type: 'json_schema',
        json_schema: {
          name: 'analyze_moc_output',
          strict: true,
          schema: {
            type: 'object',
            additionalProperties: false,
            required: ['phases'],
            properties: {
              phases: {
                type: 'array',
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['title', 'steps'],
                  properties: {
                    title: { type: 'string' },
                    steps: {
                      type: 'array',
                      items: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['description', 'hazards'],
                        properties: {
                          description: { type: 'string' },
                          hazards: {
                            type: 'array',
                            items: {
                              type: 'object',
                              additionalProperties: false,
                              required: ['description', 'risks'],
                              properties: {
                                description: { type: 'string' },
                                risks: {
                                  type: 'array',
                                  items: {
                                    type: 'object',
                                    additionalProperties: false,
                                    required: ['description'],
                                    properties: {
                                      description: { type: 'string' },
                                    },
                                  },
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
      messages: [
        {
          role: 'system',
          content:
            'You are an expert aviation Safety Management System consultant. Return only valid JSON. Build a practical implementation strategy broken into phases, steps, hazards, and risks. Keep the writing concise, concrete, and operational.',
        },
        {
          role: 'user',
          content: [
            'Analyze this Management of Change proposal and produce JSON in exactly this shape:',
            '{ "phases": [ { "title": string, "steps": [ { "description": string, "hazards": [ { "description": string, "risks": [ { "description": string } ] } ] } ] } ] }',
            'Generate 3 to 5 logical phases where possible.',
            'Each phase should contain actionable steps.',
            'Each step should include realistic hazards and risks.',
            'Do not include markdown, comments, or explanations outside the JSON.',
            '',
            `Title: ${input.title}`,
            `Description: ${input.description}`,
            `Reason: ${input.reason}`,
            `Scope: ${input.scope}`,
          ].join('\n'),
        },
      ],
    }),
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message =
      payload?.error?.message ||
      payload?.error ||
      'OpenAI request failed while analyzing the MOC.';
    throw new Error(message);
  }

  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content !== 'string' || !content.trim()) {
    throw new Error('OpenAI returned an empty response for the MOC analysis.');
  }

  try {
    const parsed = extractJsonPayload(content);
    return OpenAiAnalyzeMocOutputSchema.parse(parsed);
  } catch (error) {
    const excerpt = content.trim().slice(0, 500);
    const reason = error instanceof Error ? error.message : 'Unknown JSON parsing error.';
    throw new Error(`Failed to parse MOC analysis JSON: ${reason}. Response excerpt: ${excerpt}`);
  }
}

export async function analyzeMoc(input: AnalyzeMocInput): Promise<AnalyzeMocOutput> {
  const output = await runOpenAiAnalyzeMoc(input);

  const phasesWithFullStructure = output.phases.map((phase) => ({
    id: uuidv4(),
    title: phase.title || '',
    steps: (phase.steps || []).map((step) => ({
      id: uuidv4(),
      description: step.description || '',
      hazards: (step.hazards || []).map((hazard) => ({
        id: uuidv4(),
        description: hazard.description || '',
        risks: (hazard.risks || []).map((risk) => ({
          id: uuidv4(),
          description: risk.description || '',
          initialRiskAssessment: { likelihood: 1, severity: 1, riskScore: 1, riskLevel: 'Low' as const },
          mitigations: [],
        })),
      })),
    })),
  }));

  return AnalyzeMocOutputSchema.parse({ phases: phasesWithFullStructure });
}
