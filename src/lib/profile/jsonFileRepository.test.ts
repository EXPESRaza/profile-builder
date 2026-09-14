import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { JsonFileProfileRepository } from "./jsonFileRepository";
import { emptyProfile } from "./schema";

let dir: string;
let repo: JsonFileProfileRepository;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "profile-repo-"));
  repo = new JsonFileProfileRepository(path.join(dir, "nested", "profile.json"));
  vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(async () => {
  vi.restoreAllMocks();
  await rm(dir, { recursive: true, force: true });
});

describe("JsonFileProfileRepository", () => {
  it("returns an empty profile when no file exists", async () => {
    const profile = await repo.load();
    expect(profile.interests).toEqual([]);
    expect(profile.pendingConflicts).toEqual([]);
  });

  it("round-trips a saved profile (creating parent dirs)", async () => {
    const saved = { ...emptyProfile(), interests: ["hiking"], homeBase: "Austin" };
    await repo.save(saved);
    expect(await repo.load()).toEqual(saved);
    expect(JSON.parse(await readFile(path.join(dir, "nested", "profile.json"), "utf8"))).toEqual(saved);
  });

  it("degrades to an empty profile on invalid JSON instead of throwing", async () => {
    const file = path.join(dir, "bad.json");
    await writeFile(file, "{ not json", "utf8");
    const profile = await new JsonFileProfileRepository(file).load();
    expect(profile.interests).toEqual([]);
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("degrades to an empty profile on schema mismatch", async () => {
    const file = path.join(dir, "mismatch.json");
    await writeFile(file, JSON.stringify({ travelStyle: "yacht", updatedAt: "nope" }), "utf8");
    const profile = await new JsonFileProfileRepository(file).load();
    expect(profile.travelStyle).toBeUndefined();
    expect(console.warn).toHaveBeenCalledOnce();
  });

  it("clear() resets to empty", async () => {
    await repo.save({ ...emptyProfile(), pace: "packed" });
    const cleared = await repo.clear();
    expect(cleared.pace).toBeUndefined();
    expect((await repo.load()).pace).toBeUndefined();
  });
});
