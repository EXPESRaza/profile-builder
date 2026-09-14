import type { TravelProfile } from "@/lib/profile/schema";

type Props = {
  profile: TravelProfile | null;
  onReset: () => void;
  resetting: boolean;
};

const LABELS: Record<
  Exclude<keyof TravelProfile, "pendingConflicts" | "updatedAt">,
  string
> = {
  homeBase: "Home base",
  travelStyle: "Travel style",
  dailyBudgetUSD: "Daily budget",
  pace: "Pace",
  accommodation: "Accommodation",
  companions: "Travels with",
  interests: "Interests",
  dietaryRestrictions: "Dietary",
  preferredSeasons: "Preferred seasons",
  destinationsOfInterest: "Destinations",
  avoid: "Avoid",
  notes: "Notes",
};

/** Read-only view of the current profile. Purely presentational. */
export function ProfilePanel({ profile, onReset, resetting }: Props) {
  const rows = profile
    ? (Object.keys(LABELS) as Array<keyof typeof LABELS>)
        .map((key) => ({ key, label: LABELS[key], value: formatValue(profile[key]) }))
        .filter((row) => row.value !== null)
    : [];

  return (
    <aside className="flex h-full flex-col rounded-xl border border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-950">
      <header className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-800">
        <div>
          <h2 className="text-sm font-semibold">Travel profile</h2>
          <p className="text-xs text-neutral-500">
            {profile ? `Updated ${formatTime(profile.updatedAt)}` : "Loading…"}
          </p>
        </div>
        <button
          type="button"
          onClick={onReset}
          disabled={resetting || !profile}
          className="rounded-md border border-neutral-300 px-2 py-1 text-xs text-neutral-600 hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          Reset
        </button>
      </header>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {profile && rows.length === 0 && (
          <p className="text-sm text-neutral-500">
            Nothing yet. Tell the assistant how you like to travel and this will fill in as you go.
          </p>
        )}
        <dl className="space-y-3">
          {rows.map((row) => (
            <div key={row.key}>
              <dt className="text-xs font-medium uppercase tracking-wide text-neutral-500">
                {row.label}
              </dt>
              <dd className="mt-0.5 text-sm">{row.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </aside>
  );
}

function formatValue(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (Array.isArray(value)) return value.length ? value.join(", ") : null;
  if (typeof value === "number") return `$${value.toLocaleString()} / day`;
  if (typeof value === "string") return humanise(value);
  return null;
}

/** "midRange" -> "Mid range" for enum values; leaves free text alone. */
function humanise(value: string): string {
  if (!/^[a-z]+([A-Z][a-z]*)*$/.test(value)) return value;
  const spaced = value.replace(/([A-Z])/g, " $1").toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
