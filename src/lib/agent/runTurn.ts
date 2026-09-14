import { convertToModelMessages, streamText } from "ai";
import type { ChatUIMessage } from "@/lib/api/contracts";
import { resolveLanguageModel } from "@/lib/llm/provider";
import type { TravelProfile } from "@/lib/profile/schema";
import { buildSystemPrompt } from "./systemPrompt";

export type RunTurnInput = {
  messages: ChatUIMessage[];
  profile: TravelProfile;
};

/**
 * One conversational turn. Owns everything LLM-shaped: model selection,
 * system prompt, and (in later commits) tools. Returns the AI SDK stream
 * result; the route decides how to serialise it.
 *
 * Rejects with LlmConfigError if the env is unusable, before any stream is
 * opened, so the route can answer with a JSON 401.
 */
export async function runTurn({ messages, profile }: RunTurnInput) {
  const { model } = resolveLanguageModel();

  return streamText({
    model,
    system: buildSystemPrompt(profile),
    messages: await convertToModelMessages(messages),
  });
}
