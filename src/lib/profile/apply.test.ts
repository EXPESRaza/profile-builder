import { describe, expect, it } from "vitest";
import { applyPatch, sanitizePatch } from "./apply";
import { emptyProfile } from "./schema";

const base = () => ({ ...emptyProfile(new Date("2026-01-01T00:00:00Z")), interests: ["hiking"] });

describe("applyPatch", () => {
  it("sets scalars and reports them as changed", () => {
    const { profile, changed } = applyPatch(base(), { pace: "relaxed", homeBase: "Austin" });
    expect(profile.pace).toBe("relaxed");
    expect(profile.homeBase).toBe("Austin");
    expect(changed.sort()).toEqual(["homeBase", "pace"]);
  });

  it("union-merges arrays case-insensitively and preserves order", () => {
    const { profile, changed } = applyPatch(base(), { interests: ["Hiking", "food"] });
    expect(profile.interests).toEqual(["hiking", "food"]);
    expect(changed).toEqual(["interests"]);
  });

  it("reports no change when nothing differs", () => {
    const start = base();
    const { profile, changed } = applyPatch(start, { interests: ["HIKING"], pace: undefined });
    expect(changed).toEqual([]);
    expect(profile.updatedAt).toBe(start.updatedAt);
  });

  it("bumps updatedAt only when something changed", () => {
    const now = new Date("2026-02-02T00:00:00Z");
    const { profile } = applyPatch(base(), { pace: "packed" }, now);
    expect(profile.updatedAt).toBe(now.toISOString());
  });

  it("does not mutate the input", () => {
    const start = base();
    applyPatch(start, { interests: ["surfing"], pace: "packed" });
    expect(start.interests).toEqual(["hiking"]);
    expect(start.pace).toBeUndefined();
  });
});

describe("sanitizePatch", () => {
  it("drops placeholder strings a model uses to pad fields", () => {
    expect(
      sanitizePatch({ homeBase: "Unknown", notes: "N/A", interests: ["hiking", "none", " "] }),
    ).toEqual({ interests: ["hiking"] });
  });

  it("drops empty strings/arrays and trims what remains", () => {
    expect(sanitizePatch({ homeBase: "  Austin ", avoid: [], notes: "" })).toEqual({
      homeBase: "Austin",
    });
  });

  it("keeps real enums and numbers untouched", () => {
    expect(sanitizePatch({ pace: "relaxed", dailyBudgetUSD: 120 })).toEqual({
      pace: "relaxed",
      dailyBudgetUSD: 120,
    });
  });
});
