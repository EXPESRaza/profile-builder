import { isApiError, type ApiError, type ProfileResponse } from "./contracts";

/**
 * Thin typed fetch helpers for the non-stream routes. The chat stream itself
 * goes through the AI SDK's transport (see ChatPanel).
 */

export async function fetchProfile(): Promise<ProfileResponse> {
  const res = await fetch("/api/profile", { cache: "no-store" });
  return parseJson<ProfileResponse>(res);
}

export async function resetProfile(): Promise<ProfileResponse> {
  const res = await fetch("/api/profile", { method: "DELETE" });
  return parseJson<ProfileResponse>(res);
}

async function parseJson<T>(res: Response): Promise<T> {
  const body: unknown = await res.json();
  if (!res.ok) {
    throw new ApiRequestError(
      isApiError(body)
        ? body
        : { error: "internal_error", message: `Request failed (${res.status}).` },
    );
  }
  return body as T;
}

export class ApiRequestError extends Error {
  constructor(readonly apiError: ApiError) {
    super(apiError.message);
    this.name = "ApiRequestError";
  }
}

/**
 * The AI SDK transport throws `new Error(await response.text())` on non-2xx,
 * so a JSON ApiError from /api/chat arrives as the error message. Recover it.
 */
export function apiErrorFromChatError(error: Error): ApiError | null {
  try {
    const parsed: unknown = JSON.parse(error.message);
    return isApiError(parsed) ? parsed : null;
  } catch {
    return null;
  }
}
