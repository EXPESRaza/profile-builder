import type { DestinationRecord } from "./types";

/**
 * Hardcoded stand-in for a real travel data API. Picked to cover a spread of
 * budgets, seasons, and interests so the assistant's follow-ups differ
 * meaningfully per destination (and so conflicts like budget-vs-luxury or
 * vegetarian-vs-BBQ have somewhere to surface).
 *
 * Budgets are rough per-person daily figures in USD, not researched data.
 */
export const DESTINATIONS: DestinationRecord[] = [
  {
    name: "Lisbon",
    aliases: ["lisboa", "portugal"],
    bestSeasons: ["spring", "fall"],
    knownFor: ["food", "architecture", "nightlife", "coastline"],
    averageDailyBudgetUSD: { budget: 70, midRange: 150, luxury: 350 },
    visaNotes: "Schengen area; many nationalities get 90 visa-free days.",
  },
  {
    name: "Tokyo",
    aliases: ["japan"],
    bestSeasons: ["spring", "fall"],
    knownFor: ["food", "technology", "temples", "shopping", "nightlife"],
    averageDailyBudgetUSD: { budget: 90, midRange: 200, luxury: 500 },
    visaNotes: "Visa-free short stays for most Western passports (typically 90 days).",
  },
  {
    name: "Kyoto",
    aliases: [],
    bestSeasons: ["spring", "fall"],
    knownFor: ["temples", "gardens", "history", "tea culture"],
    averageDailyBudgetUSD: { budget: 80, midRange: 180, luxury: 450 },
    visaNotes: "Same entry rules as the rest of Japan.",
  },
  {
    name: "Mexico City",
    aliases: ["cdmx", "ciudad de mexico", "ciudad de méxico"],
    bestSeasons: ["spring", "fall", "winter"],
    knownFor: ["food", "museums", "street life", "architecture"],
    averageDailyBudgetUSD: { budget: 50, midRange: 120, luxury: 300 },
    visaNotes: "Visa-free for most; a tourist card (FMM) is issued on arrival.",
  },
  {
    name: "Reykjavik",
    aliases: ["reykjavík", "iceland"],
    bestSeasons: ["summer", "winter"],
    knownFor: ["nature", "hiking", "northern lights", "hot springs"],
    averageDailyBudgetUSD: { budget: 120, midRange: 280, luxury: 600 },
    visaNotes: "Schengen area; expensive year-round, plan budget accordingly.",
  },
  {
    name: "Bali",
    aliases: ["indonesia", "ubud", "canggu"],
    bestSeasons: ["spring", "summer", "fall"],
    knownFor: ["beaches", "surfing", "yoga", "temples", "nature"],
    averageDailyBudgetUSD: { budget: 40, midRange: 100, luxury: 300 },
    visaNotes: "Visa on arrival for most nationalities (30 days, extendable once).",
  },
  {
    name: "Marrakech",
    aliases: ["marrakesh", "morocco"],
    bestSeasons: ["spring", "fall"],
    knownFor: ["markets", "architecture", "food", "desert excursions"],
    averageDailyBudgetUSD: { budget: 45, midRange: 110, luxury: 320 },
    visaNotes: "Visa-free 90 days for many nationalities.",
  },
  {
    name: "Buenos Aires",
    aliases: ["argentina", "bsas"],
    bestSeasons: ["spring", "fall"],
    knownFor: ["steak", "tango", "nightlife", "architecture", "wine"],
    averageDailyBudgetUSD: { budget: 50, midRange: 120, luxury: 300 },
    visaNotes: "Visa-free 90 days for most Western passports.",
  },
];
