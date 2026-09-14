import { describe, expect, it } from "vitest";
import { verifyUpdates } from "./evidence";

const USER = "Hi! I'm vegetarian and I love hiking. Thinking about Lisbon in the spring.";

describe("verifyUpdates", () => {
  it("keeps fields whose evidence is in the user's words", () => {
    const { patch, rejected } = verifyUpdates(
      [
        { field: "dietaryRestrictions", value: ["vegetarian"], evidence: "I'm vegetarian" },
        { field: "interests", value: ["hiking"], evidence: "love hiking" },
        { field: "preferredSeasons", value: ["spring"], evidence: "in the spring" },
      ],
      USER,
    );
    expect(patch).toEqual({
      dietaryRestrictions: ["vegetarian"],
      interests: ["hiking"],
      preferredSeasons: ["spring"],
    });
    expect(rejected).toEqual([]);
  });

  it("rejects fields the model invented evidence for", () => {
    const { patch, rejected } = verifyUpdates(
      [
        { field: "companions", value: "solo", evidence: "traveling solo" },
        { field: "dailyBudgetUSD", value: 100, evidence: "budget around $100" },
      ],
      USER,
    );
    expect(patch).toEqual({});
    expect(rejected.map((r) => r.field)).toEqual(["companions", "dailyBudgetUSD"]);
  });

  it("tolerates punctuation and light drift in the quote", () => {
    const { patch } = verifyUpdates(
      [{ field: "interests", value: ["hiking"], evidence: "I love hiking!" }],
      USER,
    );
    expect(patch.interests).toEqual(["hiking"]);
  });

  it("coerces array/scalar shape slips instead of rejecting them", () => {
    const { patch, rejected } = verifyUpdates(
      [
        { field: "companions", value: ["partner"], evidence: "My partner and I" },
        { field: "interests", value: "surfing", evidence: "I love surfing" },
        { field: "dailyBudgetUSD", value: "$150", evidence: "about $150 a day" },
      ],
      "My partner and I love surfing, about $150 a day is fine.",
    );
    expect(rejected).toEqual([]);
    expect(patch).toEqual({ companions: "partner", interests: ["surfing"], dailyBudgetUSD: 150 });
  });

  it("drops list items lifted from tool results even when the quote is real", () => {
    const { patch, rejected } = verifyUpdates(
      [
        {
          field: "interests",
          value: ["tango", "nightlife", "steakhouse", "wine"],
          evidence: "Buenos Aires",
        },
        { field: "destinationsOfInterest", value: ["Buenos Aires"], evidence: "Buenos Aires" },
      ],
      "We're thinking Buenos Aires - can't wait to hit a famous steakhouse there!",
    );
    expect(patch).toEqual({ interests: ["steakhouse"], destinationsOfInterest: ["Buenos Aires"] });
    expect(rejected[0]?.reason).toMatch(/"tango", "nightlife", "wine" not mentioned/);
  });

  it("grounds list items by word stem so hike/hiking agree", () => {
    const { patch } = verifyUpdates(
      [{ field: "interests", value: ["hiking", "surfing"], evidence: "we hike and surf" }],
      "On trips we hike and surf a lot.",
    );
    expect(patch.interests).toEqual(["hiking", "surfing"]);
  });

  it("rejects values that do not fit the field schema", () => {
    const { patch, rejected } = verifyUpdates(
      [{ field: "pace", value: "slow", evidence: "I'm vegetarian" }],
      USER,
    );
    expect(patch).toEqual({});
    expect(rejected[0]?.reason).toMatch(/not valid for pace/);
  });
});
