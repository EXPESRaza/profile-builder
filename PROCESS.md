# PROCESS.md

Tooling: a single Claude Code session (Opus 5) in the terminal, with the Chrome extension for browser verification. The full transcript is in [`transcripts/`](./transcripts/). No other assistants, no inline completions.

Time: ~20 min planning, ~1h 15m building (first commit 18:51, conflict commit 20:05), ~20 min docs. **Roughly 2h total.** The one detour was ~15 min chasing a vitest "runner not found" error that turned out to be environmental (see prompt 5).

---

## Annotated prompts

### 1. Plan first, no code

**Trying to do:** Get a full architecture, data-flow, schema, contract, conflict placement and provider abstraction on paper before writing anything. I told it explicitly: *do NOT write any code yet.*

**Got back:** It checked the environment first (empty dir, Node 24, **git missing from PATH**, no API keys), then asked me four questions with a recommendation on each: provider, git, AI SDK vs. hand-rolled, JSON vs. SQLite. Then three more: extraction approach, conflict surfacing, persona. Then a written plan with a ten-commit sequence and time boxes.

**Kept / changed:** Kept all the recommendations — they matched what I'd have picked, and the reasoning was stated (e.g. SQLite's native build on Windows/Node 24 risks the 5-minute clone promise). The commit plan became the actual git history almost 1:1. The one thing I overrode later was skipping the logging commit for docs when time got tight.

### 2. Scaffold — "small focused commits"

**Trying to do:** Get a clean first commit that a reviewer can read as the start of a story, not `create-next-app`'s "Initial commit".

**Got back:** It passed `--disable-git` to the scaffolder so the history begins with our own commit, hit a peer-dep conflict installing vitest, and **bumped `@types/node` to 24 to match the runtime instead of reaching for `--legacy-peer-deps`.** It also set repo-local git identity because I had no global config, and told me it had done so.

**Kept:** All of it. The `@types/node` fix is the kind of small correctness call I'd want from a colleague.

### 3. Provider layer — reading the installed types instead of coding from memory

**Trying to do:** Env-configurable provider with a clear missing-key error.

**Got back:** Before writing anything it grepped `@ai-sdk/openai`'s `.d.ts` and found that in AI SDK 7 the default `openai(modelId)` factory targets the **Responses API**. OpenRouter is chat-completions-compatible, so it used `createOpenAI({baseURL}).chat(model)` for that branch explicitly. Later verified live: OpenRouter streams.

**Kept:** Yes. This would have been a confusing 404 otherwise. The pattern — "check `node_modules` types, don't trust training data for a library that has had four major versions" — held up all session (`convertToModelMessages` also turned out to be async in v7; the typechecker caught it).

### 4. Streaming route landed **without** tools on purpose

**Trying to do:** Prove streaming works end-to-end before adding moving parts.

**Got back:** Route + system prompt + typed contract, no tools. Verified with curl: token deltas, 400s on bad input, 401 with the env var name when the key was missing (and env reloaded without restarting `next dev`). It also found `safeValidateUIMessages` in the SDK for validating message structure rather than hand-rolling a schema.

**Kept:** The bisect discipline paid off two commits later when tools misbehaved — I knew streaming wasn't the problem.

### 5. "fix the errors:" — a mid-turn mystery

**Trying to do:** I hit `Vitest failed to find the runner` and pasted it.

**Got back:** It re-ran `npm test` — passing — and said plainly it couldn't reproduce; listed the three usual causes (file run outside the vitest CLI, wrong cwd, stale npx). It did find a real adjacent issue (`vitest.config.ts` loaded as CommonJS because Next's `package.json` has no `"type": "module"`) and fixed that by renaming to `.mts`.

**Kept / threw away:** Kept the `.mts` fix. Threw away the hunt — my error was from an IDE run button, not `npm test`. I'd rather it say "can't reproduce, here's what it usually is" than invent a fix.

### 6. The extraction bug — pushing back on the model, then on my own plan

**Trying to do:** `updateProfile` as a plain patch tool. From *"I'm vegetarian and I love hiking. Thinking about Lisbon in the spring."* the profile came back with `travelStyle: midRange, dailyBudget: $100, pace: relaxed, accommodation: hotel, companions: solo, homeBase: "Unknown"`. All invented.

**Got back:** First hypothesis was OpenAI strict mode forcing every property; it read the provider source and dumped the generated JSON schema — no `required`, so not that. Tried `gpt-4.1-mini` — same pathology (and a `$0.036/day` budget). Tried `.describe()` hints, a worked example, "omit otherwise". Nothing moved. Then it proposed: **require a verbatim user quote per field and verify it server-side against the user's actual messages.** Unsupported fields are rejected and reported back to the model.

**Kept / changed:** Kept the evidence design — it's the most defensible thing in the codebase, and it made `gpt-4o-mini` produce exactly the four stated fields. I'd planned "prompt harder" as the fix; the session convinced me that's not a production answer. Added a placeholder filter (`"Unknown"`, `"N/A"`) as a second cheap layer. This is the prompt where the tool changed my mind.

### 7. Removing the destination list from the prompt

**Trying to do:** Test the `null` case with "Atlantis".

**Got back:** The model skipped `getDestinationInfo` entirely and wrote about "the Atlantis resort in the Bahamas". The session's diagnosis: the prompt listed which destinations had data, so the model reasoned "not on the list, no need to look up." It removed the list so the model *has* to call the tool to find out. Re-test: "No data for Atlantis" chip, honest reply.

**Kept:** Yes. Counter-intuitive — I'd added that list thinking it was helpful context. It was actively harmful.

### 8. Conflicts — write-time detection wasn't enough

**Trying to do:** The canonical case: say vegetarian, then mention a steakhouse.

**Got back:** First run worked (banner, held value, assistant asked). Second clean run: the model wrote *"even though you're vegetarian, the steakhouse could be for your partner"* in prose and **never called `updateProfile` with steakhouse** — so the detector never saw it. The session flagged this as "conflict detection at the model's mercy" and added a deterministic pre-model scan of the user's latest message against the stored profile, using the same contradiction table.

**Kept:** Yes. This is the "explicit orchestration step" the brief says is acceptable, and it's why the demo is reliable. Same commit also caught the evidence check letting `tango/wine/nightlife` in via a real quote ("Buenos Aires") — fixed by requiring list items themselves to be grounded in the user's words.

### 9. An accidental test

**Trying to do:** Resolve the conflict by typing "keep vegetarian".

**Got back:** The profile flipped the *wrong* way — vegetarian gone, steakhouse in. The session checked the server log before theorising and found `POST /api/profile/conflicts/<id>` fired *before* the chat message: the browser automation's stale element ref had clicked the banner's **Use "steakhouse"** button. So it wasn't a model bug; it was an unplanned test of the button path, which behaved correctly.

**Kept:** The lesson — look at the log before blaming the model. Re-ran cleanly; chat resolution produced "Kept the original".

### 10. Cutting logging for docs

**Trying to do:** With ~20 min left, decide between the structured-logs nice-to-have and README/PROCESS.

**Got back:** A time table from git timestamps and a recommendation: skip logging, docs are non-negotiable, put logging under "another day" with a concrete sketch.

**Kept:** Yes.

---

## Reflection

**Approach.** Planned first, in plan mode, with no code allowed. That 20 minutes produced the commit sequence, the layering rule (`lib/` never imports Next/React), and the decision to land streaming before tools. I stayed in tight control of *what* each commit was for and reviewed every commit message before it went in; I let the agent drive *how* within a commit. When it reached a real judgment call it asked — provider, storage, extraction approach — and I answered rather than letting it guess.

**Reviewed by hand vs. trusted.**
- *Read every line:* `schema.ts`, `conflicts.ts`, `evidence.ts`, `tools.ts`, `runTurn.ts`, both route handlers, the contract. These are where the judgment lives.
- *Skimmed:* the React components and Tailwind classes. I checked behaviour in the browser rather than reading JSX closely.
- *Shipped without fully verifying:* the `resolveConflict` "useProposed" path for the budget-style-vs-resort rule — it has a unit test but I never drove it through the UI. The word-stem grounding (`STEM_PREFIX = 3`) is a heuristic I accepted on the strength of one targeted test plus the Buenos Aires repro; I haven't measured its false-positive rate. The Anthropic provider was verified for streaming and extraction but not for the conflict tool path.

**What I'd do differently.** Write the evidence-backed tool from the start — the plain-patch version was a predictable failure with a small model, and I lost a cycle proving it. And build a tiny scripted eval (five conversations, expected profiles) before touching prompts; I was tuning prompts by re-running the same message in Chrome, which is slow and non-deterministic.

**At 10k requests/hour.**
- *Model:* the evidence guard makes cheap models viable, but I'd split the roles: a small fast model for the conversational turn, a separate structured-output extraction call over each user message (Claude Haiku was noticeably cleaner at this), both reconciled through the same `evidence → sanitize → conflicts → apply` pipeline. That pipeline is already pure and model-agnostic.
- *Prompting:* freeze the system prompt behind an eval suite (~50 conversations with expected profiles and expected conflicts) run in CI on every prompt change. Prompt caching for the static prefix; the profile JSON is the only per-user part.
- *Schema:* keep the closed enums — they're what make conflict detection mechanical and cheap. Move the diet/interest contradiction table to data, not code, and add an LLM-judge fallback only for the long tail the table misses.
- *Infra:* the JSON file becomes Postgres behind the same three-method interface; the per-turn pre-model conflict scan is O(stored fields) and stays cheap; add request IDs, structured logs and token accounting per turn (the logging I cut); retries with backoff; rate limits per user.
- *Eval strategy:* precision on extraction (no invented fields) matters more than recall — a missed field gets asked again, an invented one silently corrupts the profile. Measure both, optimise precision first.
