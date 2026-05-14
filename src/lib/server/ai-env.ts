import 'server-only';

import { assertRequiredEnv } from '@/lib/server/env';

const AI_API_KEY_ENV_NAMES = ['Safeviate_AI_KEY', 'OPENAI_API_KEY'];

function isUsableAiKey(value?: string | null) {
  const trimmed = value?.trim() || '';
  if (!trimmed) return false;
  if (/placeholder/i.test(trimmed)) return false;
  if (/^sk-local/i.test(trimmed)) return false;
  return true;
}

export function resolveAiApiKey() {
  return (
    (isUsableAiKey(process.env.Safeviate_AI_KEY) ? process.env.Safeviate_AI_KEY?.trim() : '') ||
    (isUsableAiKey(process.env.OPENAI_API_KEY) ? process.env.OPENAI_API_KEY?.trim() : '') ||
    (isUsableAiKey(process.env.SAFEVIATE_AI_KEY) ? process.env.SAFEVIATE_AI_KEY?.trim() : '') ||
    ''
  );
}

export function ensureAiEnvironment(scope = 'AI runtime') {
  const resolvedKey = resolveAiApiKey();

  if (resolvedKey) {
    if (!isUsableAiKey(process.env.OPENAI_API_KEY)) {
      process.env.OPENAI_API_KEY = resolvedKey;
    }
    if (!isUsableAiKey(process.env.Safeviate_AI_KEY)) {
      process.env.Safeviate_AI_KEY = resolvedKey;
    }
    if (!isUsableAiKey(process.env.SAFEVIATE_AI_KEY)) {
      process.env.SAFEVIATE_AI_KEY = resolvedKey;
    }
    return;
  }

  assertRequiredEnv([AI_API_KEY_ENV_NAMES], scope);
}
