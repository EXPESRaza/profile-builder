import { describe, expect, it } from "vitest";
import {
  detectConflicts,
  detectConflictsInText,
  holdConflicts,
  partitionPatch,
  resolveConflict,
} from "./conflicts";
import { emptyProfile, type TravelProfile } from "./schema";

const veg = (): TravelProfile => ({
  ...emptyProfile(new Date("2026-01-01T00:00:00Z")),
  dietaryRestrictions: ["vegetarian"],
  interests: ["hiking"],
  pace: "relaxed",
  dailyBudgetUSD: 100,
  travelStyle: "budget",
});

describe("detectConflicts", () => {
  it("is empty when nothing is stored yet", () => {
    expect(detectConflicts(emptyProfile(), { pace: "packed", interests: ["steak"] })).toEqual([]);
  });

  it("flags a changed scalar", () => {
    const [c] = detectConflicts(veg(), { pace: "packed" });
    expect(c).toMatchObject({ field: "pace", proposed: "packed", existingField: "pace", existing: "relaxed" });
  });

  it("ignores the same scalar value", () => {
    expect(detectConflicts(veg(), { pace: "relaxed" })).toEqual([]);
  });

  it("tolerates small budget drift but flags large jumps", () => {
    expect(detectConflicts(veg(), { dailyBudgetUSD: 120 })).toEqual([]);
    expect(detectConflicts(veg(), { dailyBudgetUSD: 300 })).toHaveLength(1);
  });

  it("flags the canonical vegetarian vs steakhouse case", () => {
    const [c] = detectConflicts(veg(), { interests: ["steakhouse dinners", "museums"] });
    expect(c).toMatchObject({
      field: "interests",
      proposed: "steakhouse dinners",
      existingField: "dietaryRestrictions",
      existing: "vegetarian",
    });
  });

  it("flags a new diet against a stored interest (symmetric)", () => {
    const p = { ...veg(), dietaryRestrictions: [], interests: ["bbq"] };
    const [c] = detectConflicts(p, { dietaryRestrictions: ["vegan"] });
    expect(c).toMatchObject({ field: "dietaryRestrictions", proposed: "vegan", existing: "bbq" });
  });

  it("flags budget style vs resort", () => {
    const [c] = detectConflicts(veg(), { accommodation: "resort" });
    expect(c).toMatchObject({ field: "accommodation", existingField: "travelStyle", existing: "budget" });
  });

  it("does not flag plain array additions", () => {
    expect(detectConflicts(veg(), { interests: ["food", "museums"], preferredSeasons: ["fall"] })).toEqual([]);
  });
});

describe("detectConflictsInText", () => {
  it("catches a diet contradiction in raw user text", () => {
    const [c] = detectConflictsInText(veg(), "Can't wait to hit a famous steakhouse there!");
    expect(c).toMatchObject({
      field: "interests",
      proposed: "steakhouse",
      existingField: "dietaryRestrictions",
      existing: "vegetarian",
    });
  });

  it("is quiet when nothing is stored or nothing clashes", () => {
    expect(detectConflictsInText(emptyProfile(), "steakhouse")).toEqual([]);
    expect(detectConflictsInText(veg(), "Thinking about Lisbon in spring")).toEqual([]);
  });
});

describe("partitionPatch", () => {
  it("applies the safe parts and holds only the offending items", () => {
    const { safe, conflicts } = partitionPatch(veg(), {
      interests: ["steakhouse", "museums"],
      pace: "packed",
      companions: "partner",
    });
    expect(safe).toEqual({ interests: ["museums"], companions: "partner" });
    expect(conflicts.map((c) => c.field).sort()).toEqual(["interests", "pace"]);
  });
});

describe("holdConflicts + resolveConflict", () => {
  it("holds with ids and dedupes repeats", () => {
    const cands = detectConflicts(veg(), { interests: ["steakhouse"] });
    const first = holdConflicts(veg(), cands);
    expect(first.held).toHaveLength(1);
    expect(first.profile.pendingConflicts[0]?.id).toBeTruthy();
    const second = holdConflicts(first.profile, cands);
    expect(second.held).toHaveLength(0);
  });

  it("keepExisting drops the proposed value", () => {
    const { profile } = holdConflicts(veg(), detectConflicts(veg(), { interests: ["steakhouse"] }));
    const id = profile.pendingConflicts[0]!.id;
    const out = resolveConflict(profile, id, "keepExisting")!;
    expect(out.pendingConflicts).toEqual([]);
    expect(out.interests).toEqual(["hiking"]);
    expect(out.dietaryRestrictions).toEqual(["vegetarian"]);
  });

  it("useProposed writes the value and removes the contradiction", () => {
    const { profile } = holdConflicts(veg(), detectConflicts(veg(), { interests: ["steakhouse"] }));
    const id = profile.pendingConflicts[0]!.id;
    const out = resolveConflict(profile, id, "useProposed")!;
    expect(out.interests).toEqual(["hiking", "steakhouse"]);
    expect(out.dietaryRestrictions).toEqual([]);
  });

  it("useProposed on a scalar overwrites in place", () => {
    const { profile } = holdConflicts(veg(), detectConflicts(veg(), { pace: "packed" }));
    const out = resolveConflict(profile, profile.pendingConflicts[0]!.id, "useProposed")!;
    expect(out.pace).toBe("packed");
  });

  it("returns null for an unknown id", () => {
    expect(resolveConflict(veg(), "nope", "useProposed")).toBeNull();
  });
});
