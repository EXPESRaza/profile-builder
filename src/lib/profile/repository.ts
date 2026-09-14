import type { TravelProfile } from "./schema";

/**
 * Persistence boundary for the single-user profile.
 *
 * Deliberately tiny: the app only ever needs "give me the profile" and
 * "here is the new profile". Swapping the JSON file for SQLite/Postgres/KV
 * means implementing these two methods and changing one factory call.
 */
export interface ProfileRepository {
  load(): Promise<TravelProfile>;
  save(profile: TravelProfile): Promise<void>;
  /** Reset to an empty profile; returns the new state. */
  clear(): Promise<TravelProfile>;
}
