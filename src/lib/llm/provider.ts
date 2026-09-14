import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";
import { loadLlmConfig, type LlmConfig } from "./config";

const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Turns validated config into an AI SDK LanguageModel. Adding a provider is
 * one case here plus one entry in PROVIDER_META; nothing else in the app
 * knows which vendor is behind the model.
 */
export function createLanguageModel(config: LlmConfig): LanguageModel {
  switch (config.provider) {
    case "openai":
      return createOpenAI({ apiKey: config.apiKey })(config.model);
    case "anthropic":
      return createAnthropic({ apiKey: config.apiKey })(config.model);
    case "openrouter":
      // OpenRouter speaks the OpenAI *chat completions* dialect; the default
      // openai() factory targets the Responses API, so use .chat() explicitly.
      return createOpenAI({
        apiKey: config.apiKey,
        baseURL: OPENROUTER_BASE_URL,
        name: "openrouter",
      }).chat(config.model);
  }
}

/** Convenience for routes: env -> model, throwing LlmConfigError if unusable. */
export function resolveLanguageModel(): { model: LanguageModel; config: LlmConfig } {
  const config = loadLlmConfig();
  return { model: createLanguageModel(config), config };
}
