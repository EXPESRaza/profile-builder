import { isArrayField } from "./apply";
import {
  type Conflict,
  type ProfileFieldName,
  type ProfilePatch,
  type TravelProfile,
} from "./schema";

/**
 * Conflict detection lives here and only here. The updateProfile tool calls
 * detectConflicts() before merging; resolveConflict() is the single way a
 * held value gets applied or discarded. Nothing else in the app decides
 * what counts as a contradiction.
 *
 * Rules, deliberately mechanical so they are explainable:
 *  1. A scalar field with a stored value and a different proposed value.
 *  2. dailyBudgetUSD that moves by more than BUDGET_TOLERANCE.
 *  3. Cross-field contradictions from a small table (diet vs. interests,
 *     budget style vs. resort, avoid vs. interests).
 * Arrays otherwise merge freely: liking food AND hiking is not a conflict.
 */

const BUDGET_TOLERANCE = 0.3;

/** Interests/notes that contradict a dietary restriction. Lower-case substrings. */
const DIET_CONTRADICTIONS: Record<string, string[]> = {
  vegetarian: ["steak", "steakhouse", "bbq", "barbecue", "churrasco", "meat", "asado"],
  vegan: ["steak", "steakhouse", "bbq", "barbecue", "churrasco", "meat", "asado", "cheese", "dairy"],
  pescatarian: ["steak", "steakhouse", "bbq", "barbecue", "churrasco", "asado"],
  halal: ["pork", "bacon"],
  kosher: ["pork", "bacon", "shellfish"],
};

export type ConflictCandidate = Omit<Conflict, "id" | "createdAt">;

export function detectConflicts(current: TravelProfile, patch: ProfilePatch): ConflictCandidate[] {
  const found: ConflictCandidate[] = [];

  for (const key of Object.keys(patch) as ProfileFieldName[]) {
    const proposed = patch[key];
    if (proposed === undefined) continue;

    if (!isArrayField(key)) {
      const existing = current[key];
      if (existing === undefined) continue;
      if (key === "dailyBudgetUSD") {
        const a = existing as number;
        const b = proposed as number;
        if (Math.abs(a - b) / a > BUDGET_TOLERANCE) {
          found.push({
            field: key,
            proposed,
            existingField: key,
            existing,
            reason: `Daily budget was $${a}, now $${b} (more than ${BUDGET_TOLERANCE * 100}% different).`,
          });
        }
        continue;
      }
      if (existing !== proposed) {
        found.push({
          field: key,
          proposed,
          existingField: key,
          existing,
          reason: `${label(key)} was "${String(existing)}", now "${String(proposed)}".`,
        });
      }
      continue;
    }

    // Array fields: only the contradiction table can flag them.
    for (const item of proposed as string[]) {
      const hit = crossFieldConflict(current, key, item);
      if (hit) found.push(hit);
    }
  }

  // Scalar-vs-scalar cross-field rule (checked against the merged view).
  const style = patch.travelStyle ?? current.travelStyle;
  const stay = patch.accommodation ?? current.accommodation;
  if (style === "budget" && stay === "resort") {
    const proposedField: ProfileFieldName = patch.accommodation ? "accommodation" : "travelStyle";
    const existingField: ProfileFieldName = proposedField === "accommodation" ? "travelStyle" : "accommodation";
    if (patch[proposedField] !== undefined && current[existingField] !== undefined) {
      found.push({
        field: proposedField,
        proposed: patch[proposedField],
        existingField,
        existing: current[existingField],
        reason: "A budget travel style and resort accommodation usually don't go together.",
      });
    }
  }

  return dedupe(found);
}

function crossFieldConflict(
  current: TravelProfile,
  field: ProfileFieldName,
  item: string,
): ConflictCandidate | null {
  const needle = item.toLowerCase();

  // New interest/note contradicts a stored diet.
  if (field === "interests" || field === "avoid") {
    for (const diet of current.dietaryRestrictions) {
      const banned = DIET_CONTRADICTIONS[diet.toLowerCase()] ?? [];
      if (field === "interests" && banned.some((b) => needle.includes(b))) {
        return {
          field,
          proposed: item,
          existingField: "dietaryRestrictions",
          existing: diet,
          reason: `"${item}" doesn't fit a ${diet} diet.`,
        };
      }
    }
  }

  // New diet contradicts a stored interest.
  if (field === "dietaryRestrictions") {
    const banned = DIET_CONTRADICTIONS[needle] ?? [];
    const clash = current.interests.find((i) => banned.some((b) => i.toLowerCase().includes(b)));
    if (clash) {
      return {
        field,
        proposed: item,
        existingField: "interests",
        existing: clash,
        reason: `A ${item} diet doesn't fit the stored interest "${clash}".`,
      };
    }
  }

  // Same thing in avoid and interests.
  if (field === "interests") {
    const clash = current.avoid.find((a) => a.toLowerCase() === needle);
    if (clash) {
      return {
        field,
        proposed: item,
        existingField: "avoid",
        existing: clash,
        reason: `"${item}" is currently listed under things to avoid.`,
      };
    }
  }
  if (field === "avoid") {
    const clash = current.interests.find((i) => i.toLowerCase() === needle);
    if (clash) {
      return {
        field,
        proposed: item,
        existingField: "interests",
        existing: clash,
        reason: `"${item}" is currently listed as an interest.`,
      };
    }
  }

  return null;
}

/**
 * Scan raw user text against the stored profile. This runs before the model
 * does, so a contradiction is caught even when the model decides not to
 * record the new value (it often reasons "that's for your partner" and moves
 * on). Only the diet table is applied to free text; scalar fields need the
 * model's interpretation and go through detectConflicts on write.
 */
export function detectConflictsInText(current: TravelProfile, text: string): ConflictCandidate[] {
  const haystack = text.toLowerCase();
  const found: ConflictCandidate[] = [];
  for (const diet of current.dietaryRestrictions) {
    const banned = DIET_CONTRADICTIONS[diet.toLowerCase()] ?? [];
    let hit: string | undefined;
    for (const b of banned) {
      // Capture the whole word so "steakhouse" is reported, not "steak".
      const m = haystack.match(new RegExp(`\\b(${b}\\w*)`, "i"));
      if (m) {
        hit = m[1];
        break;
      }
    }
    if (hit) {
      found.push({
        field: "interests",
        proposed: hit,
        existingField: "dietaryRestrictions",
        existing: diet,
        reason: `You mentioned "${hit}", which doesn't fit a ${diet} diet.`,
      });
    }
  }
  return dedupe(found);
}

/**
 * Split a patch into the part that can be applied now and the values that
 * must be held. Held values are removed from the patch entirely (for arrays,
 * only the offending items).
 */
export function partitionPatch(
  current: TravelProfile,
  patch: ProfilePatch,
): { safe: ProfilePatch; conflicts: ConflictCandidate[] } {
  const conflicts = detectConflicts(current, patch);
  if (conflicts.length === 0) return { safe: patch, conflicts };

  const safe: ProfilePatch = { ...patch };
  for (const c of conflicts) {
    if (isArrayField(c.field)) {
      const remaining = ((safe[c.field] as string[] | undefined) ?? []).filter(
        (v) => v !== c.proposed,
      );
      if (remaining.length > 0) (safe as Record<string, unknown>)[c.field] = remaining;
      else delete safe[c.field];
    } else {
      delete safe[c.field];
    }
  }
  return { safe, conflicts };
}

export type Resolution = "keepExisting" | "useProposed";

/**
 * Apply the user's decision. keepExisting simply drops the held value.
 * useProposed writes it and removes the contradicting stored value so the
 * profile is consistent again. Unknown ids are a no-op (returns null).
 */
export function resolveConflict(
  profile: TravelProfile,
  conflictId: string,
  resolution: Resolution,
  now: Date = new Date(),
): TravelProfile | null {
  const conflict = profile.pendingConflicts.find((c) => c.id === conflictId);
  if (!conflict) return null;

  const next: TravelProfile = {
    ...profile,
    pendingConflicts: profile.pendingConflicts.filter((c) => c.id !== conflictId),
    updatedAt: now.toISOString(),
  };
  if (resolution === "keepExisting") return next;

  // Remove the contradicting stored value.
  if (isArrayField(conflict.existingField)) {
    (next[conflict.existingField] as string[]) = (profile[conflict.existingField] as string[]).filter(
      (v) => v !== conflict.existing,
    );
  } else if (conflict.existingField !== conflict.field) {
    delete (next as Record<string, unknown>)[conflict.existingField];
  }

  // Write the proposed one.
  if (isArrayField(conflict.field)) {
    const list = next[conflict.field] as string[];
    if (!list.includes(conflict.proposed as string)) list.push(conflict.proposed as string);
  } else {
    (next as Record<string, unknown>)[conflict.field] = conflict.proposed;
  }
  return next;
}

/** Attach ids/timestamps and merge into the profile, skipping duplicates. */
export function holdConflicts(
  profile: TravelProfile,
  candidates: ConflictCandidate[],
  now: Date = new Date(),
): { profile: TravelProfile; held: Conflict[] } {
  const held: Conflict[] = [];
  const pending = [...profile.pendingConflicts];
  for (const c of candidates) {
    const dup = pending.some(
      (p) => p.field === c.field && String(p.proposed) === String(c.proposed),
    );
    if (dup) continue;
    const full: Conflict = { ...c, id: crypto.randomUUID(), createdAt: now.toISOString() };
    pending.push(full);
    held.push(full);
  }
  if (held.length === 0) return { profile, held };
  return { profile: { ...profile, pendingConflicts: pending, updatedAt: now.toISOString() }, held };
}

function dedupe(list: ConflictCandidate[]): ConflictCandidate[] {
  const seen = new Set<string>();
  return list.filter((c) => {
    const k = `${c.field}:${String(c.proposed)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function label(field: ProfileFieldName): string {
  return field.replace(/([A-Z])/g, " $1").toLowerCase().replace(/^./, (s) => s.toUpperCase());
}
