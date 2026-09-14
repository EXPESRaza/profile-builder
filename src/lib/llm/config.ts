import { z } from "zod";

/**
 * Everything the LLM layer reads from the environment, in one place.
 * Route handlers never touch process.env for LLM concerns.
 */

export const providerIdSchema = z.enum(["openai", "anthropic", "openrouter"]);
export type ProviderId = z.infer<typeof providerIdSchema>;

const PROVIDER_META: Record<
  ProviderId,
  { apiKeyEnv: string; defaultModel: string; label: string }
> = {
  openai: {
    apiKeyEnv: "OPENAI_API_KEY",
    defaultModel: "gpt-4o-mini",
    label: "OpenAI",
  },
  anthropic: {
    apiKeyEnv: "ANTHROPIC_API_KEY",
    defaultModel: "claude-haiku-4-5-20251001",
    label: "Anthropic",
  },
  openrouter: {
    apiKeyEnv: "OPENROUTER_API_KEY",
    defaultModel: "openai/gpt-4o-mini",
    label: "OpenRouter",
  },
};

export type LlmConfig = {
  provider: ProviderId;
  model: string;
  apiKey: string;
  label: string;
};

/** Thrown when the environment is not usable; mapped to a 401 by the route. */
export class LlmConfigError extends Error {
  readonly name = "LlmConfigError";
  constructor(
    message: string,
    /** Which env var the operator needs to fix. */
    readonly envVar: string,
  ) {
    super(message);
  }
}

/**
 * Validates the env and returns a usable config, or throws LlmConfigError
 * with an operator-friendly message naming the exact env var to set.
 * Read on every call (cheap) so a fixed .env.local takes effect on the next
 * request under `next dev` without a restart.
 */
export function loadLlmConfig(
  env: Record<string, string | undefined> = process.env,
): LlmConfig {
  const rawProvider = env.LLM_PROVIDER?.trim() || "openai";
  const providerResult = providerIdSchema.safeParse(rawProvider);
  if (!providerResult.success) {
    throw new LlmConfigError(
      `LLM_PROVIDER="${rawProvider}" is not supported. Use one of: ${providerIdSchema.options.join(", ")}.`,
      "LLM_PROVIDER",
    );
  }
  const provider = providerResult.data;
  const meta = PROVIDER_META[provider];

  const apiKey = env[meta.apiKeyEnv]?.trim();
  if (!apiKey) {
    throw new LlmConfigError(
      `${meta.apiKeyEnv} is not set. Add it to .env.local (see .env.example) to use ${meta.label}.`,
      meta.apiKeyEnv,
    );
  }

  return {
    provider,
    model: env.LLM_MODEL?.trim() || meta.defaultModel,
    apiKey,
    label: meta.label,
  };
}
