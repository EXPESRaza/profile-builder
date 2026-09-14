import type { ToolUIPart } from "ai";
import type { ChatTools } from "@/lib/api/contracts";

type Props = { part: ToolUIPart<ChatTools> };

/**
 * A small inline marker so the user can see the assistant looked something
 * up or saved a preference. Typed from the server's tool definitions.
 */
export function ToolCallChip({ part }: Props) {
  const label = describe(part);
  if (!label) return null;
  const pending = part.state === "input-streaming" || part.state === "input-available";
  return (
    <span
      className={
        "mb-1 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] " +
        (pending
          ? "border-neutral-300 text-neutral-500 dark:border-neutral-700"
          : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200")
      }
    >
      {label}
    </span>
  );
}

function describe(part: ToolUIPart<ChatTools>): string | null {
  switch (part.type) {
    case "tool-getDestinationInfo": {
      const name = part.input?.name ?? "destination";
      if (part.state !== "output-available") return `Looking up ${name}…`;
      return part.output.found ? `Looked up ${part.output.info.name}` : `No data for ${name}`;
    }
    case "tool-updateProfile": {
      if (part.state !== "output-available") return "Updating profile…";
      const { applied, rejected, conflicts } = part.output;
      const bits: string[] = [];
      if (applied.length) bits.push(`Saved ${applied.map(humanise).join(", ")}`);
      if (conflicts.length) bits.push(`${conflicts.length} conflict${conflicts.length > 1 ? "s" : ""} held`);
      if (rejected.length) bits.push(`ignored ${rejected.length} unsupported`);
      return bits.length ? bits.join(" · ") : null;
    }
    case "tool-resolveConflict": {
      if (part.state !== "output-available") return "Resolving…";
      return part.output.ok
        ? part.output.resolution === "useProposed"
          ? "Updated with your new answer"
          : "Kept the original"
        : null;
    }
    default:
      return null;
  }
}

/** "dietaryRestrictions" -> "dietary restrictions" */
function humanise(field: string): string {
  return field.replace(/([A-Z])/g, " $1").toLowerCase();
}
