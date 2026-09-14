import type { ApiError } from "./contracts";

/** The one way routes emit a non-stream error, so the shape can't drift. */
export function apiError(status: number, body: ApiError): Response {
  return Response.json(body, { status });
}
