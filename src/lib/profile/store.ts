import path from "node:path";
import { JsonFileProfileRepository } from "./jsonFileRepository";
import type { ProfileRepository } from "./repository";

const DEFAULT_STORE_PATH = "./data/profile.json";

let singleton: ProfileRepository | undefined;

/**
 * The one place the app decides *which* repository backs the profile.
 * Route handlers and tools import this; nothing else knows about files.
 */
export function getProfileRepository(): ProfileRepository {
  if (!singleton) {
    const configured = process.env.PROFILE_STORE_PATH ?? DEFAULT_STORE_PATH;
    singleton = new JsonFileProfileRepository(path.resolve(configured));
  }
  return singleton;
}
