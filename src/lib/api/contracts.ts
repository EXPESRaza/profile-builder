import type { InferUITools, UIMessage } from "ai";
import { z } from "zod";
import type { ProfileBuilderTools } from "@/lib/agent/tools";
import type { TravelProfile } from "@/lib/profile/schema";

/**
 * The typed contract between client and server. Both sides import from here;
 * nothing is duplicated in components or routes.
 *
 * Transport for POST /api/chat is the AI SDK UI-message stream (SSE). The
 * message shape is generic over custom *data parts*, which is how the server
 * pushes profile updates mid-stream without a second request.
 */

/** Custom data parts the server can emit inside the chat stream. */
export type ChatDataParts = {
  /** Full profile snapshot after any server-side change. */
  profile: TravelProfile;
};

/** Tool parts are typed from the server's tool definitions, so the client
 *  can render `tool-getDestinationInfo` / `tool-updateProfile` parts with
 *  typed input/output and no casting. */
export type ChatTools = InferUITools<ProfileBuilderTools>;

export type ChatUIMessage = UIMessage<never, ChatDataParts, ChatTools>;

/** POST /api/chat request body. Messages are validated by the AI SDK's
 *  safeValidateUIMessages on the server; this schema guards the envelope. */
export const chatRequestSchema = z.object({
  messages: z.array(z.unknown()).min(1).max(200),
});
export type ChatRequest = z.infer<typeof chatRequestSchema>;

/** Non-stream error envelope, returned by any route on failure. */
export type ApiErrorCode =
  | "invalid_request"
  | "llm_not_configured"
  | "provider_error"
  | "internal_error";

export type ApiError = {
  error: ApiErrorCode;
  message: string;
  /** For llm_not_configured: which env var the operator must set. */
  envVar?: string;
  /** For invalid_request: zod issues. */
  issues?: unknown;
};

/** GET /api/profile and DELETE /api/profile response. */
export type ProfileResponse = { profile: TravelProfile };

export function isApiError(value: unknown): value is ApiError {
  return (
    typeof value === "object" &&
    value !== null &&
    "error" in value &&
    typeof (value as { error?: unknown }).error === "string" &&
    "message" in value
  );
}
