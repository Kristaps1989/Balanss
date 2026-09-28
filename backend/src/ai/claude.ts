import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { FastifyBaseLogger } from 'fastify';
import type { z } from 'zod';

/**
 * One structured-output call to Claude.
 *
 * - `output_config.format` carries a JSON schema derived from Zod, so the reply is
 *   always JSON; we still re-validate it with Zod before using it.
 * - Adaptive thinking is left at the API default (always on for claude-opus-5-5);
 *   depth is controlled per route with `output_config.effort`.
 * - Server-side refusal fallback (`fallbacks: "default"`) lets the API re-run a
 *   classifier-declined request on the recommended fallback model.
 * - The stable system prompt is marked for prompt caching.
 * - Only token usage is logged, never prompt or response content.
 */

export type Effort = 'low' | 'medium' | 'high';

export type AiFailureReason = 'refusal' | 'max_tokens' | 'invalid_output' | 'api_error';

export class AiCallError extends Error {
  constructor(
    public readonly reason: AiFailureReason,
    message: string,
  ) {
    super(message);
    this.name = 'AiCallError';
  }
}

/** The subset of the SDK client the app uses; tests inject a stub with the same shape. */
export type ClaudeClient = Pick<Anthropic, 'beta'>;

export interface StructuredCall<S extends z.ZodType> {
  /** Route label for usage logs, e.g. "meals.analyze". */
  route: string;
  system: string;
  content: string | Anthropic.Beta.BetaContentBlockParam[];
  /** Schema sent to the API as the output format (keep it free of refinements). */
  schema: S;
  effort: Effort;
  maxTokens?: number;
}

export const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export function createClaudeClient(apiKey: string): ClaudeClient {
  return new Anthropic({ apiKey, timeout: 90_000, maxRetries: 2 });
}

export async function callStructured<S extends z.ZodType>(
  client: ClaudeClient,
  model: string,
  log: FastifyBaseLogger,
  call: StructuredCall<S>,
): Promise<z.infer<S>> {
  const response = await client.beta.messages.create({
    model,
    max_tokens: call.maxTokens ?? 16_000,
    betas: [FALLBACK_BETA],
    fallbacks: 'default',
    system: [{ type: 'text', text: call.system, cache_control: { type: 'ephemeral' } }],
    output_config: { effort: call.effort, format: betaZodOutputFormat(call.schema) },
    messages: [{ role: 'user', content: call.content }],
  });

  const usage = response.usage;
  log.info(
    {
      ai: {
        route: call.route,
        model: response.model,
        stopReason: response.stop_reason,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens,
        cacheReadTokens: usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: usage.cache_creation_input_tokens ?? 0,
        fallbackRan: (usage.iterations ?? []).some((i) => i.type === 'fallback_message'),
      },
    },
    'ai usage',
  );

  // Check stop_reason before reading content: a refusal may carry empty or partial content.
  if (response.stop_reason === 'refusal') {
    throw new AiCallError('refusal', `refused (${response.stop_details?.category ?? 'unknown'})`);
  }
  if (response.stop_reason === 'max_tokens') {
    throw new AiCallError('max_tokens', 'output truncated at max_tokens');
  }

  // After a server-side fallback, only content after the last `fallback` block is the served answer.
  let start = 0;
  response.content.forEach((b, i) => {
    if (b.type === 'fallback') start = i + 1;
  });
  const text = response.content
    .slice(start)
    .map((b) => (b.type === 'text' ? b.text : ''))
    .join('');

  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new AiCallError('invalid_output', 'response was not JSON');
  }
  const parsed = call.schema.safeParse(json);
  if (!parsed.success) throw new AiCallError('invalid_output', 'response did not match schema');
  return parsed.data;
}

/** Log a failed AI call without leaking content; returns a short reason for callers. */
export function logAiFailure(log: FastifyBaseLogger, route: string, err: unknown): void {
  let reason: string;
  if (err instanceof AiCallError) reason = err.reason;
  else if (err instanceof Anthropic.RateLimitError) reason = 'rate_limited';
  else if (err instanceof Anthropic.AuthenticationError) reason = 'auth';
  else if (err instanceof Anthropic.APIConnectionError) reason = 'connection';
  else if (err instanceof Anthropic.APIError) reason = `api_${err.status ?? 'unknown'}`;
  else reason = err instanceof Error ? err.name : 'unknown';
  log.warn({ ai: { route, reason } }, 'ai call failed, using fallback copy');
}
