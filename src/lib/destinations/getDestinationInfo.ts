import { DESTINATIONS } from "./data";
import type { DestinationInfo, DestinationRecord } from "./types";

// Unicode combining marks (accents), removed after NFD decomposition.
const COMBINING_MARKS = /\p{M}/gu;

/**
 * Normalise for lookup: lowercase, strip diacritics, collapse punctuation
 * and whitespace. "Ciudad de México" and "ciudad de mexico" both hit.
 */
function normalise(input: string): string {
  return input
    .normalize("NFD")
    .replace(COMBINING_MARKS, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const INDEX: ReadonlyMap<string, DestinationRecord> = (() => {
  const map = new Map<string, DestinationRecord>();
  for (const record of DESTINATIONS) {
    for (const key of [record.name, ...record.aliases]) {
      map.set(normalise(key), record);
    }
  }
  return map;
})();

/**
 * The destination tool from the brief. Exact/alias match only; returns null
 * for anything unknown so the agent is forced to say "I don't have data on
 * that" rather than improvise. Fuzzy matching is a deliberate non-goal (see
 * README "Known gaps").
 */
export async function getDestinationInfo(
  name: string,
): Promise<DestinationInfo | null> {
  const record = INDEX.get(normalise(name));
  if (!record) return null;
  // Strip internal-only `aliases` so the public contract matches the brief.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { aliases, ...info } = record;
  return info;
}

/** Names the assistant can be told about, so it knows what's lookup-able. */
export function knownDestinationNames(): string[] {
  return DESTINATIONS.map((d) => d.name);
}
