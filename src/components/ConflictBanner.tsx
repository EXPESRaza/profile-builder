import { useState } from "react";
import type { Conflict } from "@/lib/profile/schema";

type Props = {
  conflicts: Conflict[];
  onResolve: (id: string, resolution: "keepExisting" | "useProposed") => Promise<void>;
};

/**
 * Surfaces held contradictions in the profile panel. The user can settle
 * them here or by answering the assistant in chat; both go through the same
 * server-side resolveConflict().
 */
export function ConflictBanner({ conflicts, onResolve }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);
  if (conflicts.length === 0) return null;

  async function handle(id: string, resolution: "keepExisting" | "useProposed") {
    setBusyId(id);
    try {
      await onResolve(id, resolution);
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm dark:border-amber-700 dark:bg-amber-950">
      <p className="mb-2 font-semibold text-amber-900 dark:text-amber-100">
        {conflicts.length === 1 ? "Needs your call" : `${conflicts.length} things need your call`}
      </p>
      <ul className="space-y-3">
        {conflicts.map((c) => (
          <li key={c.id} className="text-amber-900 dark:text-amber-100">
            <p>{c.reason}</p>
            <div className="mt-1.5 flex gap-2">
              <button
                type="button"
                disabled={busyId === c.id}
                onClick={() => handle(c.id, "keepExisting")}
                className="rounded-md border border-amber-400 bg-white px-2 py-1 text-xs hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-900 dark:hover:bg-amber-800"
              >
                Keep &ldquo;{fmt(c.existing)}&rdquo;
              </button>
              <button
                type="button"
                disabled={busyId === c.id}
                onClick={() => handle(c.id, "useProposed")}
                className="rounded-md border border-amber-400 bg-white px-2 py-1 text-xs hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-900 dark:hover:bg-amber-800"
              >
                Use &ldquo;{fmt(c.proposed)}&rdquo;
              </button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function fmt(v: unknown): string {
  if (typeof v === "number") return `$${v}`;
  return String(v);
}
