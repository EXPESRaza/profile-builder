# Profile Builder

A single-page chat app that builds a durable **travel profile** through conversation. The assistant interviews you, extracts structured preferences with tool calls, looks up destinations you mention, flags contradictions instead of overwriting, and persists the profile across reloads.

Take-home exercise for Atlas (Full-Stack Engineer). See [`PROCESS.md`](./PROCESS.md) for the annotated build log and reflection.

## Quick start

Requires Node 20+ (built on Node 24) and an OpenAI API key.

```bash
git clone <this repo> && cd vayo-profile-builder
npm install
cp .env.example .env.local        # then set OPENAI_API_KEY=sk-...
npm run dev                       # http://localhost:3000
```

Try: *"I'm vegetarian and I love hiking. Thinking about Lisbon in the spring."* — then *"Can't wait to hit a famous steakhouse there."*

```bash
npm test          # 47 unit tests (conflicts, evidence, destinations, store, config)
npm run typecheck
npm run lint
```

## Provider and configuration

| Variable | Default | Notes |
|---|---|---|
| `LLM_PROVIDER` | `openai` | `openai` \| `anthropic` \| `openrouter` |
| `LLM_MODEL` | per provider | `gpt-4o-mini` / `claude-haiku-4-5-20251001` / `openai/gpt-4o-mini` |
| `OPENAI_API_KEY` | — | required when provider is `openai` |
| `ANTHROPIC_API_KEY` | — | required when provider is `anthropic` |
| `OPENROUTER_API_KEY` | — | required when provider is `openrouter` |
| `PROFILE_STORE_PATH` | `./data/profile.json` | where the profile is persisted |

**What I used:** OpenAI `gpt-4o-mini` as the default (cheap, reliable streaming + tool calls). All three providers were verified live end-to-end (streaming, tool calls, extraction). Claude Haiku 4.5 was noticeably cleaner at extraction; `gpt-4o-mini` needed the evidence guard described below. OpenRouter reuses the OpenAI provider with a `baseURL` and the chat-completions endpoint.

**Failure modes:**

| Situation | Behaviour |
|---|---|
| Key missing / blank, or unknown `LLM_PROVIDER` | `POST /api/chat` returns `401 {error:"llm_not_configured", envVar:"OPENAI_API_KEY"}` **before** any stream opens. UI shows a banner naming the env var and disables the composer. Env is re-read per request, so fixing `.env.local` under `next dev` works without a restart. |
| Key invalid, no credits, rate limit, provider 5xx | The provider is only called once the stream is open, so this arrives as an `error` part mid-stream. The real reason is logged server-side as JSON; the client sees "The assistant hit an error talking to the model" and can retry. |
| Malformed request body | `400 invalid_request` with zod issues. Messages are validated twice: envelope (zod) then structure (AI SDK `safeValidateUIMessages`). |
| Corrupt `profile.json` | Falls back to an empty profile and logs a warning; never a 500. |
| Model sends junk to a tool | Bad enum / shape → rejected with a reason returned to the model, not a crash. |

## How it works

```
Browser ── useChat ──▶ POST /api/chat ──▶ runTurn() ──▶ streamText + tools
   ▲                        │                 │              │
   │   data-profile part    │   validate      │  pre-model   ├─ getDestinationInfo
   └────────────────────────┘   + load        │  conflict    ├─ updateProfile (evidence-checked)
                                              │  scan        └─ resolveConflict
                                              ▼
                                   ProfileRepository (JSON file)
```

**Layers.** `src/app/api/*` is transport only (validate, load, delegate, serialise). `src/lib/agent` is orchestration (prompt, tools, turn loop). `src/lib/profile` is the domain (schema, merge, evidence, conflicts, persistence). `src/lib/llm` is the provider boundary. `src/components` is UI. `lib/` never imports Next or React.

**Typed contract.** `src/lib/api/contracts.ts` is imported by both client and server: request/response schemas, the `ApiError` envelope, and `ChatUIMessage` — an AI SDK `UIMessage` typed over our custom `profile` data part and `InferUITools<typeof tools>`, so tool parts render on the client with typed input/output and no casts.

**Streaming.** AI SDK UI-message stream (SSE). Tokens render as they arrive. When a tool persists the profile it writes a `data-profile` part into the same stream, so the profile panel updates **mid-turn**, before the reply text finishes.

**Extraction: evidence-backed tool calls.** `updateProfile` takes `[{field, value, evidence}]` where `evidence` must be a verbatim quote of the user. The server (`profile/evidence.ts`) checks the quote against the user's actual messages (assistant text excluded), validates the value against that field's zod schema, coerces harmless shape slips (`["partner"]` → `"partner"`, `"$150"` → `150`), requires list items to be word-stem-grounded in the user's words, and drops placeholder strings (`"Unknown"`, `"N/A"`). Rejections go back to the model and show as *ignored N unsupported* in the chat. This exists because both `gpt-4o-mini` and `gpt-4.1-mini` padded every field with plausible guesses no matter how the prompt was phrased — see PROCESS.md.

**Destination tool.** `getDestinationInfo(name)` matches the brief's signature. 8 hardcoded destinations; case/diacritic-insensitive lookup with an alias map (Iceland → Reykjavik, CDMX → Mexico City). Unknown → `null` → the model is told to say it has no data and ask what draws the user there. The system prompt deliberately does **not** list the known destinations: when it did, the model skipped the tool for unlisted places and invented facts.

**Conflicts.** All in `profile/conflicts.ts`. Detected at two points: on write (`updateProfile` runs `partitionPatch`) and **before the model runs** (`detectConflictsInText` scans the user's latest message against the stored profile — added after seeing the model reason "the steakhouse is for your partner" in prose and never attempt the write). Rules: changed scalar; budget moves >30%; a small cross-field table (diet vs. interests, budget-style vs. resort, avoid vs. interests). Plain list additions never conflict. Contradicting values are **held** on `profile.pendingConflicts`, not written. Surfaced three ways from one `Conflict` type: the model is told and must ask; a banner in the profile panel with *Keep / Use* buttons; chips in the chat. Resolution is one pure function `resolveConflict()` reached via the chat tool or `POST /api/profile/conflicts/:id`.

**Persistence.** `ProfileRepository` (load/save/clear) with a JSON-file implementation: zod-validated reads, temp+rename atomic writes, serialised write queue. Swapping to SQLite/KV is one class and one line in `store.ts`.

## Decisions and trade-offs

- **Profile fields.** 12 preference fields, each chosen because it changes a recommendation, maps onto a `DestinationInfo` field so tool results are actionable (`travelStyle` ↔ budget tiers, `preferredSeasons` ↔ `bestSeasons`, `interests` ↔ `knownFor`), or is a classic contradiction surface (diet, budget, pace, companions). Small closed enums so conflict detection stays mechanical. `notes` catches anything else.
- **Guided interview over draft-and-correct.** 1–2 focused questions per turn. Demonstrates tool use and conflicts more naturally and never fabricates a profile.
- **Single streamed call with tools over a second extraction call.** One round-trip per turn and live profile updates for free. Cost: extraction quality depends on the model, which is why the evidence guard exists.
- **Vercel AI SDK over hand-rolled adapters.** Provider swap is one switch case; streaming/tool protocol is battle-tested. I read the installed `.d.ts` rather than coding from memory (v7 changed `convertToModelMessages` to async, and the default `openai()` factory targets the Responses API — OpenRouter needs `.chat()`).
- **JSON file over SQLite.** Zero setup, keeps the 5-minute clone-to-run promise; the repository interface makes it a non-decision to change later.
- **Hold-and-ask over overwrite-and-flag.** The brief warns against silent overwrites; holding respects the user and keeps the profile consistent.

## Known gaps

- **Chat history is not persisted** — only the profile. Reloading clears the transcript.
- **Extraction misses.** The model occasionally doesn't extract a stated field at all (not a false positive — a miss). The interview asks again later. A second, non-streamed extraction pass over the last user message would close it.
- **Over-eager lookups.** `gpt-4o-mini` sometimes calls `getDestinationInfo` on non-places ("relaxed pace"). Harmless (returns not-found) and prompt-softened, but not eliminated.
- **Conflict table is small.** Diet/interest, style/resort, avoid/interest. A real product would need a richer taxonomy and probably an LLM judge for the long tail.
- **Evidence grounding is lexical.** Word-stem matching can't credit "I love eating out" as evidence for `interests: ["food"]`. Precision was prioritised over recall.
- **No retries/backoff** on provider errors; no rate limiting; no structured logging (see below).
- **Desktop only.** Doesn't break at narrow widths, but not designed for them.

## With another day

1. **Structured logs**: one JSON line per LLM call (`requestId, provider, model, latencyMs, usage, finishReason, toolCalls[]`) and per tool call via `streamText`'s `onStepFinish`/`onToolCallFinish` hooks. Was next on the list; cut for the docs.
2. **Second extraction pass** (non-streamed, structured output) over each user message to catch misses, reconciled through the same evidence + conflict pipeline.
3. **Eval set**: ~30 scripted conversations with expected profiles and expected conflicts, run in CI against the default model. This is where prompt changes should be proven, not by hand in Chrome.
4. **Persist chat history** alongside the profile so reload restores the conversation.
5. **Retries with backoff** for transient provider errors; surface rate limits distinctly.
