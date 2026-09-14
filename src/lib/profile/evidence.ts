import { z } from "zod";
import { isArrayField } from "./apply";
import { profilePatchSchema, type ProfileFieldName, type ProfilePatch } from "./schema";

/**
 * Evidence-backed extraction.
 *
 * Both gpt-4o-mini and gpt-4.1-mini pad `updateProfile` with plausible
 * guesses for every field no matter how the prompt or schema descriptions
 * are phrased. So instead of asking nicely, the tool requires a verbatim
 * user quote per field, and this module checks that quote against what the
 * user actually typed. A field without supporting evidence is dropped and
 * reported back to the model. No prompt wording can bypass it.
 */

export const fieldNameSchema = profilePatchSchema.keyof();

export const profileUpdateSchema = z.object({
  field: fieldNameSchema.describe("Which profile field this sets."),
  value: z
    .union([z.string(), z.number(), z.array(z.string())])
    .describe("The value. Arrays for list fields (they are added to, not replaced)."),
  evidence: z
    .string()
    .min(3)
    .describe("Short verbatim quote from the USER's own words that states this preference."),
});
export type ProfileUpdate = z.infer<typeof profileUpdateSchema>;

export type RejectedUpdate = { field: ProfileFieldName; reason: string };

export type VerifiedUpdates = { patch: ProfilePatch; rejected: RejectedUpdate[] };

/** Minimum share of evidence words that must appear in the user's text. */
const MIN_WORD_OVERLAP = 0.6;

/**
 * Turn a list of evidenced updates into a patch, keeping only those whose
 * evidence is actually present in `userText` and whose value fits the field.
 */
export function verifyUpdates(updates: ProfileUpdate[], userText: string): VerifiedUpdates {
  const haystack = normalise(userText);
  const patch: ProfilePatch = {};
  const rejected: RejectedUpdate[] = [];

  for (const update of updates) {
    if (!evidenceSupported(update.evidence, haystack)) {
      rejected.push({
        field: update.field,
        reason: `evidence "${update.evidence}" does not appear in the user's messages`,
      });
      continue;
    }

    const fieldSchema = profilePatchSchema.shape[update.field];
    const parsed = fieldSchema.safeParse(coerceShape(update.field, update.value));
    if (!parsed.success) {
      rejected.push({
        field: update.field,
        reason: `value ${JSON.stringify(update.value)} is not valid for ${update.field}: ${parsed.error.issues[0]?.message ?? "invalid"}`,
      });
      continue;
    }

    (patch as Record<string, unknown>)[update.field] = parsed.data;
  }

  return { patch, rejected };
}

/**
 * Models sometimes wrap a scalar in an array or send a bare string for a
 * list field. That is a formatting slip, not a hallucination, so fix the
 * shape before validating rather than rejecting the update.
 */
function coerceShape(field: ProfileFieldName, value: ProfileUpdate["value"]): unknown {
  const wantsArray = isArrayField(field);
  if (wantsArray && typeof value === "string") return [value];
  if (!wantsArray && Array.isArray(value) && value.length === 1) return value[0];
  if (field === "dailyBudgetUSD" && typeof value === "string") {
    const n = Number(value.replace(/[$,]/g, ""));
    return Number.isFinite(n) ? n : value;
  }
  return value;
}

function evidenceSupported(evidence: string, haystack: string): boolean {
  const needle = normalise(evidence);
  if (!needle) return false;
  if (haystack.includes(needle)) return true;

  // Tolerate light paraphrase/punctuation drift: most content words must be present.
  const words = needle.split(" ").filter((w) => w.length > 2);
  if (words.length === 0) return false;
  const hits = words.filter((w) => haystack.includes(w)).length;
  return hits / words.length >= MIN_WORD_OVERLAP;
}

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9$ ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
