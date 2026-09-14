import { tool, type UIMessageStreamWriter } from "ai";
import { z } from "zod";
import type { ChatUIMessage } from "@/lib/api/contracts";
import { getDestinationInfo } from "@/lib/destinations/getDestinationInfo";
import type { DestinationInfo } from "@/lib/destinations/types";
import { applyPatch, sanitizePatch } from "@/lib/profile/apply";
import {
  holdConflicts,
  partitionPatch,
  resolveConflict,
  type Resolution,
} from "@/lib/profile/conflicts";
import { profileUpdateSchema, verifyUpdates, type RejectedUpdate } from "@/lib/profile/evidence";
import type { ProfileRepository } from "@/lib/profile/repository";
import type { Conflict, ProfileFieldName, TravelProfile } from "@/lib/profile/schema";

/**
 * Per-turn context the tools need. The writer lets a tool push a fresh
 * profile snapshot to the client the moment it is persisted, which is what
 * makes the profile panel update mid-stream.
 */
export type TurnContext = {
  repository: ProfileRepository;
  writer: UIMessageStreamWriter<ChatUIMessage>;
  /** Everything the user has typed this conversation; evidence is checked against it. */
  userText: string;
  /** Mutable: the latest persisted profile for this turn. */
  profile: TravelProfile;
};

export type GetDestinationInfoOutput =
  | { found: true; info: DestinationInfo }
  | { found: false; name: string; hint: string };

export type UpdateProfileOutput = {
  applied: ProfileFieldName[];
  unchanged: ProfileFieldName[];
  rejected: RejectedUpdate[];
  /** Newly held contradictions. The model should ask the user about these. */
  conflicts: Conflict[];
  profile: TravelProfile;
};

export type ResolveConflictOutput =
  | { ok: true; resolution: Resolution; profile: TravelProfile }
  | { ok: false; reason: string };

export function buildTools(ctx: TurnContext) {
  return {
    getDestinationInfo: tool({
      description:
        "Look up a destination the user mentions (city, country or region). Call this whenever a specific place comes up, before commenting on it. Returns seasons, what it is known for, daily budget tiers and visa notes; or found=false if we have no data.",
      inputSchema: z.object({
        name: z.string().min(1).describe("Destination name as the user said it, e.g. 'Lisbon' or 'Iceland'."),
      }),
      execute: async ({ name }): Promise<GetDestinationInfoOutput> => {
        const info = await getDestinationInfo(name);
        if (!info) {
          return {
            found: false,
            name,
            hint: "No data for this destination. Tell the user you don't have details on it and ask what draws them there; do not invent seasons, budgets or visa rules.",
          };
        }
        return { found: true, info };
      },
    }),

    updateProfile: tool({
      description:
        "Record preferences the user has explicitly stated. Each update must quote the user's own words as evidence; updates whose evidence is not found in the conversation are rejected. Only include fields the user actually talked about.",
      inputSchema: z.object({
        updates: z.array(profileUpdateSchema).min(1).max(12),
      }),
      execute: async ({ updates }): Promise<UpdateProfileOutput> => {
        const { patch: verified, rejected } = verifyUpdates(updates, ctx.userText);
        const patch = sanitizePatch(verified);

        // Contradictions are held, not written. Everything else merges.
        const { safe, conflicts: candidates } = partitionPatch(ctx.profile, patch);
        const { profile: merged, changed } = applyPatch(ctx.profile, safe);
        const { profile, held } = holdConflicts(merged, candidates);
        const unchanged = (Object.keys(safe) as ProfileFieldName[]).filter(
          (k) => !changed.includes(k),
        );

        if (changed.length > 0 || held.length > 0) {
          await ctx.repository.save(profile);
          ctx.profile = profile;
          ctx.writer.write({ type: "data-profile", data: profile });
        }

        return {
          applied: changed,
          unchanged,
          rejected,
          conflicts: held,
          profile: ctx.profile,
        };
      },
    }),

    resolveConflict: tool({
      description:
        "Apply the user's decision on a pending conflict once they have said which value is right. keepExisting discards the new value; useProposed writes it and removes the contradicting stored value.",
      inputSchema: z.object({
        conflictId: z.string().min(1).describe("The id from the pending conflicts list."),
        resolution: z.enum(["keepExisting", "useProposed"]),
      }),
      execute: async ({ conflictId, resolution }): Promise<ResolveConflictOutput> => {
        const next = resolveConflict(ctx.profile, conflictId, resolution);
        if (!next) return { ok: false, reason: `No pending conflict with id ${conflictId}.` };

        await ctx.repository.save(next);
        ctx.profile = next;
        ctx.writer.write({ type: "data-profile", data: next });
        return { ok: true, resolution, profile: next };
      },
    }),
  };
}

export type ProfileBuilderTools = ReturnType<typeof buildTools>;
