import type { Config } from '../config';
import { createClaudeClient, type ClaudeClient } from './claude';
import { claudeFoodAi, fakeFoodAi, type FoodAi } from './food';
import { claudeToneEngine, fakeToneEngine, type ToneEngine } from './tone';

export interface AiService {
  provider: 'anthropic' | 'fake';
  food: FoodAi;
  tone: ToneEngine;
}

export function fakeAi(): AiService {
  return { provider: 'fake', food: fakeFoodAi, tone: fakeToneEngine };
}

export function anthropicAi(client: ClaudeClient, model: string): AiService {
  return { provider: 'anthropic', food: claudeFoodAi(client, model), tone: claudeToneEngine(client, model) };
}

export function createAi(config: Config): AiService {
  if (config.aiProvider === 'anthropic') {
    if (!config.anthropicApiKey) throw new Error('AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY');
    return anthropicAi(createClaudeClient(config.anthropicApiKey), config.aiModel);
  }
  return fakeAi();
}
