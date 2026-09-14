import { safeValidateUIMessages } from "ai";
import {
  chatRequestSchema,
  type ApiError,
  type ChatUIMessage,
} from "@/lib/api/contracts";
import { runTurn } from "@/lib/agent/runTurn";
import { LlmConfigError } from "@/lib/llm/config";
import { getProfileRepository } from "@/lib/profile/store";

/**
 * Transport only: validate, load state, delegate to the orchestrator,
 * serialise the stream. No LLM or persistence logic lives here.
 */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, { error: "invalid_request", message: "Body must be JSON." });
  }

  const envelope = chatRequestSchema.safeParse(body);
  if (!envelope.success) {
    return apiError(400, {
      error: "invalid_request",
      message: "Invalid request body.",
      issues: envelope.error.issues,
    });
  }

  const validated = await safeValidateUIMessages<ChatUIMessage>({
    messages: envelope.data.messages,
  });
  if (!validated.success) {
    return apiError(400, {
      error: "invalid_request",
      message: "Messages are malformed.",
      issues: validated.error.message,
    });
  }

  const profile = await getProfileRepository().load();

  try {
    const result = await runTurn({ messages: validated.data, profile });
    return result.toUIMessageStreamResponse({
      // Surface a readable message in the stream instead of the default
      // "An error occurred." Provider details are logged server-side only.
      onError: (error) => {
        console.error(JSON.stringify({ level: "error", event: "chat_stream_error", error: String(error) }));
        return "The assistant hit an error talking to the model. Please try again.";
      },
    });
  } catch (error) {
    if (error instanceof LlmConfigError) {
      return apiError(401, {
        error: "llm_not_configured",
        message: error.message,
        envVar: error.envVar,
      });
    }
    console.error(JSON.stringify({ level: "error", event: "chat_route_error", error: String(error) }));
    return apiError(500, { error: "internal_error", message: "Unexpected server error." });
  }
}

function apiError(status: number, body: ApiError): Response {
  return Response.json(body, { status });
}
