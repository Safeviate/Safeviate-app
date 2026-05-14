import { ensureAiEnvironment } from '@/lib/server/ai-env';

ensureAiEnvironment('Genkit bootstrap');

import { genkit } from 'genkit';

export const ai = genkit({
  model: 'openai/gpt-4.1-mini',
});
