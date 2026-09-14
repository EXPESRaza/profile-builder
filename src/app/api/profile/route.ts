import type { ProfileResponse } from "@/lib/api/contracts";
import { getProfileRepository } from "@/lib/profile/store";

export async function GET() {
  const profile = await getProfileRepository().load();
  return Response.json({ profile } satisfies ProfileResponse);
}

export async function DELETE() {
  const profile = await getProfileRepository().clear();
  return Response.json({ profile } satisfies ProfileResponse);
}
