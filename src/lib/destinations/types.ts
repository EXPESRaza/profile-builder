import { z } from "zod";
import { seasonSchema } from "@/lib/profile/schema";

/**
 * Contract from the exercise brief. Function name and these fields are fixed;
 * `aliases` is our extension so "Iceland" resolves to Reykjavik without a
 * fuzzy matcher.
 */
export const destinationInfoSchema = z.object({
  name: z.string(),
  bestSeasons: z.array(seasonSchema),
  knownFor: z.array(z.string()),
  averageDailyBudgetUSD: z.object({
    budget: z.number(),
    midRange: z.number(),
    luxury: z.number(),
  }),
  visaNotes: z.string().optional(),
});
export type DestinationInfo = z.infer<typeof destinationInfoSchema>;

/** Internal record: the public shape plus lookup aliases. */
export type DestinationRecord = DestinationInfo & { aliases: string[] };
