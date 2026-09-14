import { z } from "zod";

/**
 * The travel profile: the durable output of the whole app.
 *
 * Field selection rationale (see README "Decisions"):
 *  - Each field either changes what we'd recommend (pace, companions),
 *    maps directly onto a `DestinationInfo` field so tool results are
 *    actionable (travelStyle <-> budget tiers, preferredSeasons <-> bestSeasons,
 *    interests <-> knownFor), or is a classic contradiction surface for
 *    conflict detection (dietaryRestrictions, dailyBudgetUSD).
 *  - Enums are kept small and closed so conflict detection stays mechanical.
 *  - `notes` is a free-text catch-all so nothing the user says is lost just
 *    because it didn't fit a field.
 */

export const seasonSchema = z.enum(["spring", "summer", "fall", "winter"]);
export type Season = z.infer<typeof seasonSchema>;

export const travelStyleSchema = z.enum(["budget", "midRange", "luxury"]);
export const paceSchema = z.enum(["relaxed", "balanced", "packed"]);
export const accommodationSchema = z.enum([
  "hostel",
  "hotel",
  "boutique",
  "rental",
  "resort",
]);
export const companionsSchema = z.enum(["solo", "partner", "family", "friends"]);

/** A single non-empty, trimmed string; used for all free-text list items. */
const tag = z.string().trim().min(1).max(80);

/**
 * The user-facing preference fields. Kept separate from bookkeeping
 * (`pendingConflicts`, `updatedAt`) so the LLM-facing patch schema and the
 * conflict detector can be derived from exactly this shape.
 */
export const profileFieldsSchema = z.object({
  homeBase: z.string().trim().min(1).max(120).optional(),
  travelStyle: travelStyleSchema.optional(),
  dailyBudgetUSD: z.number().positive().max(100_000).optional(),
  pace: paceSchema.optional(),
  accommodation: accommodationSchema.optional(),
  companions: companionsSchema.optional(),
  interests: z.array(tag).default([]),
  dietaryRestrictions: z.array(tag).default([]),
  preferredSeasons: z.array(seasonSchema).default([]),
  destinationsOfInterest: z.array(tag).default([]),
  avoid: z.array(tag).default([]),
  notes: z.string().trim().max(2000).optional(),
});
export type ProfileFields = z.infer<typeof profileFieldsSchema>;
export type ProfileFieldName = keyof ProfileFields;

/** Keys the conflict detector / merge logic treat as sets rather than scalars. */
export const ARRAY_FIELDS = [
  "interests",
  "dietaryRestrictions",
  "preferredSeasons",
  "destinationsOfInterest",
  "avoid",
] as const satisfies readonly ProfileFieldName[];
export type ArrayFieldName = (typeof ARRAY_FIELDS)[number];

/**
 * A contradiction between an already-stored value and a newly proposed one.
 * Held here (not applied) until the user resolves it.
 */
export const conflictSchema = z.object({
  id: z.string().min(1),
  field: profileFieldsSchema.keyof(),
  existing: z.unknown(),
  proposed: z.unknown(),
  reason: z.string().min(1),
  createdAt: z.iso.datetime(),
});
export type Conflict = z.infer<typeof conflictSchema>;

export const travelProfileSchema = profileFieldsSchema.extend({
  pendingConflicts: z.array(conflictSchema).default([]),
  updatedAt: z.iso.datetime(),
});
export type TravelProfile = z.infer<typeof travelProfileSchema>;

/**
 * What the LLM is allowed to send via `updateProfile`: every preference field
 * optional, and array fields are *additions* (union-merged), never replacements.
 * Bookkeeping fields are intentionally not patchable.
 *
 * The descriptions are part of the tool schema the model sees. They exist
 * because small models will otherwise fill every field with a guess.
 */
const ONLY_IF_STATED = "Include ONLY if the user explicitly said so in the conversation. Omit otherwise.";

export const profilePatchSchema = z.object({
  homeBase: profileFieldsSchema.shape.homeBase.describe(
    `City/region the user travels from. ${ONLY_IF_STATED}`,
  ),
  travelStyle: profileFieldsSchema.shape.travelStyle.describe(
    `Overall spend level. ${ONLY_IF_STATED}`,
  ),
  dailyBudgetUSD: profileFieldsSchema.shape.dailyBudgetUSD.describe(
    `Per-person daily budget in USD. ${ONLY_IF_STATED} Never estimate.`,
  ),
  pace: profileFieldsSchema.shape.pace.describe(`How packed their days are. ${ONLY_IF_STATED}`),
  accommodation: profileFieldsSchema.shape.accommodation.describe(
    `Preferred lodging type. ${ONLY_IF_STATED}`,
  ),
  companions: profileFieldsSchema.shape.companions.describe(
    `Who they usually travel with. ${ONLY_IF_STATED}`,
  ),
  interests: profileFieldsSchema.shape.interests.unwrap().optional().describe(
    `Activities/themes to ADD (e.g. "hiking", "food"). ${ONLY_IF_STATED}`,
  ),
  dietaryRestrictions: profileFieldsSchema.shape.dietaryRestrictions.unwrap().optional().describe(
    `Diets/allergies to ADD (e.g. "vegetarian"). ${ONLY_IF_STATED}`,
  ),
  preferredSeasons: profileFieldsSchema.shape.preferredSeasons.unwrap().optional().describe(
    `Seasons to ADD. ${ONLY_IF_STATED}`,
  ),
  destinationsOfInterest: profileFieldsSchema.shape.destinationsOfInterest.unwrap().optional().describe(
    `Places the user said they are considering, to ADD. ${ONLY_IF_STATED}`,
  ),
  avoid: profileFieldsSchema.shape.avoid.unwrap().optional().describe(
    `Dealbreakers to ADD (e.g. "crowds", "long flights"). ${ONLY_IF_STATED}`,
  ),
  notes: profileFieldsSchema.shape.notes.describe(
    `Free text for anything stated that fits no other field. ${ONLY_IF_STATED}`,
  ),
});
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export function emptyProfile(now: Date = new Date()): TravelProfile {
  return travelProfileSchema.parse({ updatedAt: now.toISOString() });
}
