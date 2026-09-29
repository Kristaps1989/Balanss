import type { Config } from '../config';
import { createClaudeClient, type ClaudeClient } from './claude';
import { claudeFoodAi, fakeFoodAi, type FoodAi } from './food';
import { claudeSummaryEngine, fakeSummaryEngine, type SummaryEngine } from './insights';
import { claudeRecipeEngine, fakeRecipeEngine, type RecipeEngine } from './recipes';
import { claudeToneEngine, fakeToneEngine, type ToneEngine } from './tone';

export interface AiService {
  provider: 'anthropic' | 'fake';
  /** Photo analysis and text parsing: always allowed, the user explicitly asks for them. */
  food: FoodAi;
  /** Personalised copy: only used when the user keeps AI personalisation on (see copyAiFor). */
  tone: ToneEngine;
  summary: SummaryEngine;
  recipes: RecipeEngine;
}

/** Templates and curated data only; also what users with AI personalisation off get. */
export const templateAi: Pick<AiService, 'tone' | 'summary' | 'recipes'> = {
  tone: fakeToneEngine,
  summary: fakeSummaryEngine,
  recipes: fakeRecipeEngine,
};

export function fakeAi(): AiService {
  return { provider: 'fake', food: fakeFoodAi, ...templateAi };
}

export function anthropicAi(client: ClaudeClient, model: string): AiService {
  return {
    provider: 'anthropic',
    food: claudeFoodAi(client, model),
    tone: claudeToneEngine(client, model),
    summary: claudeSummaryEngine(client, model),
    recipes: claudeRecipeEngine(client, model),
  };
}

export function createAi(config: Config): AiService {
  if (config.aiProvider === 'anthropic') {
    if (!config.anthropicApiKey) throw new Error('AI_PROVIDER=anthropic requires ANTHROPIC_API_KEY');
    return anthropicAi(createClaudeClient(config.anthropicApiKey), config.aiModel);
  }
  return fakeAi();
}

/** The copy engines for one user: Claude only while they keep AI personalisation on. */
export function copyAiFor(ai: AiService, user: { aiPersonalization: boolean }): Pick<AiService, 'tone' | 'summary' | 'recipes'> {
  return user.aiPersonalization ? ai : templateAi;
}
