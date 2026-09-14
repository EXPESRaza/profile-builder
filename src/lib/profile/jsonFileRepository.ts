import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ProfileRepository } from "./repository";
import { emptyProfile, travelProfileSchema, type TravelProfile } from "./schema";

/**
 * JSON-file persistence. Chosen for the 2h scope because it needs zero setup
 * and survives reloads, which is the actual requirement.
 *
 * Production-awareness within that budget:
 *  - Reads are validated with zod; a corrupt or hand-edited file degrades to
 *    an empty profile (and warns) rather than crashing the chat route.
 *  - Writes go to a temp file then rename, so a crash mid-write can't leave
 *    a half-written profile behind.
 *  - Writes are serialised through a promise chain so two tool calls in the
 *    same turn can't interleave.
 */
export class JsonFileProfileRepository implements ProfileRepository {
  private writeQueue: Promise<unknown> = Promise.resolve();

  constructor(private readonly filePath: string) {}

  async load(): Promise<TravelProfile> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch (err) {
      if (isNotFound(err)) return emptyProfile();
      throw err;
    }

    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "profile_store_corrupt",
          path: this.filePath,
          reason: "invalid_json",
        }),
      );
      return emptyProfile();
    }

    const parsed = travelProfileSchema.safeParse(json);
    if (!parsed.success) {
      console.warn(
        JSON.stringify({
          level: "warn",
          event: "profile_store_corrupt",
          path: this.filePath,
          reason: "schema_mismatch",
          issues: parsed.error.issues,
        }),
      );
      return emptyProfile();
    }
    return parsed.data;
  }

  save(profile: TravelProfile): Promise<void> {
    const run = this.writeQueue.then(() => this.writeAtomic(profile));
    // Keep the chain alive even if this write fails.
    this.writeQueue = run.catch(() => undefined);
    return run;
  }

  async clear(): Promise<TravelProfile> {
    const fresh = emptyProfile();
    await this.save(fresh);
    return fresh;
  }

  private async writeAtomic(profile: TravelProfile): Promise<void> {
    await mkdir(path.dirname(this.filePath), { recursive: true });
    const tmp = `${this.filePath}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(profile, null, 2), "utf8");
    await rename(tmp, this.filePath);
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    (err as { code?: string }).code === "ENOENT"
  );
}
