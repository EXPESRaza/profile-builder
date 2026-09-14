import {
  ARRAY_FIELDS,
  type ArrayFieldName,
  type ProfileFieldName,
  type ProfilePatch,
  type TravelProfile,
} from "./schema";

/**
 * Merge a patch into a profile. Pure; returns a new object.
 *
 * Semantics:
 *  - Scalars: set when the patch provides a value; untouched otherwise.
 *  - Arrays: union (case-insensitive, order-preserving). The model can only
 *    *add* to a list through a patch; removals go through an explicit
 *    correction flow so nothing disappears silently.
 *  - Returns the list of fields that actually changed so callers can tell
 *    the model (and the UI) what happened.
 */
export function applyPatch(
  profile: TravelProfile,
  patch: ProfilePatch,
  now: Date = new Date(),
): { profile: TravelProfile; changed: ProfileFieldName[] } {
  const next: TravelProfile = { ...profile };
  const changed: ProfileFieldName[] = [];

  for (const key of Object.keys(patch) as ProfileFieldName[]) {
    const incoming = patch[key];
    if (incoming === undefined) continue;

    if (isArrayField(key)) {
      const merged = unionCaseInsensitive(profile[key], incoming as string[]);
      if (merged.length !== profile[key].length) {
        (next[key] as string[]) = merged;
        changed.push(key);
      }
      continue;
    }

    if (profile[key] !== incoming) {
      (next as Record<string, unknown>)[key] = incoming;
      changed.push(key);
    }
  }

  if (changed.length > 0) next.updatedAt = now.toISOString();
  return { profile: next, changed };
}

/**
 * Strings a model emits when it wants to fill a field it has no value for.
 * Anything matching is treated as "not provided".
 */
const PLACEHOLDER = /^(unknown|n\/?a|none|null|undefined|not (specified|provided|stated|mentioned)|tbd|-|\?)$/i;

/**
 * Drop values that carry no information before merging. This is the guard
 * against a model padding every field; it runs on every patch regardless of
 * what the prompt asked for.
 */
export function sanitizePatch(patch: ProfilePatch): ProfilePatch {
  const out: ProfilePatch = {};
  for (const key of Object.keys(patch) as ProfileFieldName[]) {
    const value = patch[key];
    if (value === undefined || value === null) continue;

    if (Array.isArray(value)) {
      const kept = value.filter((v) => typeof v === "string" && v.trim() && !PLACEHOLDER.test(v.trim()));
      if (kept.length > 0) (out as Record<string, unknown>)[key] = kept;
      continue;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed || PLACEHOLDER.test(trimmed)) continue;
      (out as Record<string, unknown>)[key] = trimmed;
      continue;
    }

    (out as Record<string, unknown>)[key] = value;
  }
  return out;
}

export function isArrayField(key: ProfileFieldName): key is ArrayFieldName {
  return (ARRAY_FIELDS as readonly string[]).includes(key);
}

function unionCaseInsensitive(existing: string[], incoming: string[]): string[] {
  const seen = new Set(existing.map((s) => s.toLowerCase()));
  const out = [...existing];
  for (const item of incoming) {
    const k = item.toLowerCase();
    if (!seen.has(k)) {
      seen.add(k);
      out.push(item);
    }
  }
  return out;
}
