import { convertToModelMessages, createUIMessageStream, stepCountIs, streamText } from "ai";
import type { ChatUIMessage } from "@/lib/api/contracts";
import { resolveLanguageModel } from "@/lib/llm/provider";
import { detectConflictsInText, holdConflicts } from "@/lib/profile/conflicts";
import type { ProfileRepository } from "@/lib/profile/repository";
import type { TravelProfile } from "@/lib/profile/schema";
import { buildSystemPrompt } from "./systemPrompt";
import { buildTools } from "./tools";

export type RunTurnInput = {
  messages: ChatUIMessage[];
  profile: TravelProfile;
  repository: ProfileRepository;
  /** Called for stream-level errors; return the text shown to the user. */
  onError: (error: unknown) => string;
};

/**
 * Enough steps for: lookup destination -> update profile -> answer, with
 * one spare. Bounded so a confused model cannot loop on tool calls.
 */
const MAX_STEPS = 5;

/**
 * One conversational turn. Owns everything LLM-shaped: model selection,
 * system prompt, tools, and the multi-step loop. Returns a UI message
 * stream; the route wraps it in a Response.
 *
 * The stream is built with createUIMessageStream (not streamText's own
 * response helper) so tool handlers get a writer and can push custom
 * `data-profile` parts the moment the profile is persisted.
 *
 * Rejects with LlmConfigError before any stream is opened if the env is
 * unusable, so the route can answer with a JSON 401.
 */
export async function runTurn({ messages, profile, repository, onError }: RunTurnInput) {
  const { model } = resolveLanguageModel();
  const modelMessages = await convertToModelMessages(messages);

  const userText = collectUserText(messages);

  // Explicit pre-model step: catch contradictions in the user's latest words
  // against what is already stored, so surfacing them does not depend on
  // the model choosing to call updateProfile with the offending value.
  const latestUserText = collectUserText(messages.slice(-1));
  const { profile: checked, held } = holdConflicts(
    profile,
    detectConflictsInText(profile, latestUserText),
  );
  if (held.length > 0) await repository.save(checked);

  return createUIMessageStream<ChatUIMessage>({
    onError,
    execute: ({ writer }) => {
      if (held.length > 0) writer.write({ type: "data-profile", data: checked });

      const tools = buildTools({ repository, writer, profile: checked, userText });

      const result = streamText({
        model,
        system: buildSystemPrompt(checked),
        messages: modelMessages,
        tools,
        stopWhen: stepCountIs(MAX_STEPS),
      });

      writer.merge(result.toUIMessageStream({ onError }));
    },
  });
}

/** Only the user's own words count as evidence; assistant text is excluded. */
function collectUserText(messages: ChatUIMessage[]): string {
  return messages
    .filter((m) => m.role === "user")
    .flatMap((m) => m.parts)
    .map((p) => (p.type === "text" ? p.text : ""))
    .join("\n");
}
