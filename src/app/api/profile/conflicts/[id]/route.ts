import type { ProfileResponse } from "@/lib/api/contracts";
import { resolveConflictRequestSchema } from "@/lib/api/contracts";
import { apiError } from "@/lib/api/http";
import { resolveConflict } from "@/lib/profile/conflicts";
import { getProfileRepository } from "@/lib/profile/store";

/**
 * Resolve a held conflict from the UI banner. Uses the same
 * resolveConflict() as the chat tool, so both paths behave identically.
 */
export async function POST(request: Request, ctx: RouteContext<"/api/profile/conflicts/[id]">) {
  const { id } = await ctx.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return apiError(400, { error: "invalid_request", message: "Body must be JSON." });
  }
  const parsed = resolveConflictRequestSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(400, {
      error: "invalid_request",
      message: "Invalid resolution.",
      issues: parsed.error.issues,
    });
  }

  const repository = getProfileRepository();
  const current = await repository.load();
  const next = resolveConflict(current, id, parsed.data.resolution);
  if (!next) {
    return apiError(404, { error: "not_found", message: `No pending conflict with id ${id}.` });
  }
  await repository.save(next);
  return Response.json({ profile: next } satisfies ProfileResponse);
}
