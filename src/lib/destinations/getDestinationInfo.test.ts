import { describe, expect, it } from "vitest";
import { DESTINATIONS } from "./data";
import { getDestinationInfo, knownDestinationNames } from "./getDestinationInfo";
import { destinationInfoSchema } from "./types";

describe("getDestinationInfo", () => {
  it("has at least 5 destinations and every record matches the contract", () => {
    expect(DESTINATIONS.length).toBeGreaterThanOrEqual(5);
    for (const d of DESTINATIONS) {
      expect(destinationInfoSchema.safeParse(d).success).toBe(true);
      expect(d.averageDailyBudgetUSD.budget).toBeLessThan(d.averageDailyBudgetUSD.midRange);
      expect(d.averageDailyBudgetUSD.midRange).toBeLessThan(d.averageDailyBudgetUSD.luxury);
    }
  });

  it("returns null for unknown destinations", async () => {
    expect(await getDestinationInfo("Atlantis")).toBeNull();
    expect(await getDestinationInfo("")).toBeNull();
  });

  it("matches case-insensitively and ignores diacritics/punctuation", async () => {
    expect((await getDestinationInfo("lisbon"))?.name).toBe("Lisbon");
    expect((await getDestinationInfo("  MEXICO   CITY "))?.name).toBe("Mexico City");
    expect((await getDestinationInfo("Ciudad de México"))?.name).toBe("Mexico City");
    expect((await getDestinationInfo("Reykjavík"))?.name).toBe("Reykjavik");
  });

  it("resolves aliases (country -> canonical city)", async () => {
    expect((await getDestinationInfo("Iceland"))?.name).toBe("Reykjavik");
    expect((await getDestinationInfo("CDMX"))?.name).toBe("Mexico City");
  });

  it("does not leak internal aliases into the public shape", async () => {
    const info = await getDestinationInfo("Bali");
    expect(info).not.toBeNull();
    expect(info).not.toHaveProperty("aliases");
  });

  it("exposes the canonical name list", () => {
    expect(knownDestinationNames()).toContain("Tokyo");
    expect(knownDestinationNames()).toHaveLength(DESTINATIONS.length);
  });
});
