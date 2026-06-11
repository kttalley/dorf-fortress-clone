# Phase 2 Spec — "The Thread"

**Goal:** every LLM turn receives layered world context as a real system prompt that accumulates over time — stable lore → rolling chronicle → local detail. Sourced from `docs/audits/llm-prompt-transference.md` (P2–P5, P10, §3) and `SYNTHESIS.md` Phase 2. Builds on the Phase 1 commit (`ffcc51a`).

**Split: two sequential agents** (both own `src/llm/` + `src/ai/llmClient.js`, so they must not run concurrently).

---

## Agent 2a — Transport + World Lore (audit P2, P3, P10)

### 2a.1 Real system/user roles (P2)
- Extend `generate(prompt, options)` (`src/ai/llmClient.js:86-154`) to accept `options.system`; emit `messages: [{role:'system'},{role:'user'}]` at the Ollama call (`llmClient.js:100`) and the Groq fallback (`:51`). Absent `system` → behave exactly as today (backward compatible).
- Migrate the five manual `${system}\n\n${user}` concatenations: `scenarioGenerator.js:64`, `entityChat.js:44`, `gameAssistant.js:72`, `nameGenerator.js:217,348`, `eventNarrator.js:89`.

### 2a.2 `src/llm/worldContext.js` with L0 lore (P3)
- `buildWorldLore(state, scenario)` → byte-stable cached string: scenario title/description/victory conditions + biome name/description/climate/resources (`state.map.biome`, `src/map/map.js:710-718`) + `getHistorySummary(state.history)` (`src/sim/history.js:333` — first-ever call site) + race relations.
- ONE canonical L0 string shared by every call type (prefix-cache friendly); invalidate only on world regen.
- `assembleContext({entity, state, scenario, turn, budget})` skeleton returning `{system, user}` — L1/L2 slots may be stubs for Agent 2b, but the budget-trim order (trim L2 → L1, never L0) goes in now.
- Wire L0 as the system message into: dwarf thoughts + conversation templates (`llmClient.js:258-346`, via `generateEventThought`/`generateConversationSpeech` taking a `worldCtx`/system arg from `thoughts.js`), entity chat (`prompts/entityChat.js` system prompt prefix), game assistant (`gameAssistant.js:45-72`, replacing bespoke assembly where it overlaps), and name gen (fix the always-`null` worldSnapshot: `nameGenerationEvents.js:69`, `entities.js:491` → `buildWorldContext` at `nameGenerator.js:269` finally runs).

### 2a.3 Guardrails (P10)
- `estimateTokens` (`src/utils/gameContextCompressor.js:186`) budget enforcement in `assembleContext` (L0 ≤350 tok); explicit `options.num_ctx` in the Ollama request body; drop ambient-thought concurrency (`MAX_CONCURRENT`, `llmClient.js:21`) to 3 — interactive calls keep 10 via an options override if simple.

**Verify:** node --check; inline smoke test proving (a) messages array carries a system role, (b) same world ⇒ byte-identical L0 across two assembles, (c) thought prompt now contains biome+scenario lore; `tests/test-narrator-parser.js`; `npx vite build`.

## Agent 2b — Chronicle + Clock (audit P4, P5; launches after 2a lands)

### 2b.1 Day/season clock (P5)
- Extract the calendar math from `updateSeasonalWeather` (`src/sim/weatherScenarios.js`, 1200-tick days / 30-day seasons) into `src/sim/clock.js`: `getCalendar(tick)` → `{day, season, phase}` (phase: dawn/day/dusk/night). Store/refresh `state.clock` in the tick path; make `weatherScenarios.js` consume it (single source of truth).

### 2b.2 Wire the dead narrator as the L1 chronicle (P4)
- Tap notable events into `queueEventForNarration` (`src/llm/eventNarrator.js`) — either at `addLog` call sites that matter (deaths, arrivals, fights, construction, weather events) or via an event-bus listener; avoid spamming every log line.
- Call `processEndOfDay(state)` at day boundaries detected via `state.clock` (the existing 100-tick maintenance block in `main.js` is the natural hook).
- `updateChronicle(state)` in `worldContext.js`: append narrated day-events to `chronicle.recent` (cap ~8 lines); on overflow fold oldest 4 into `chronicle.saga` via one LLM summarization call ("compress to 2 sentences, keep names"); persist `saga`/`recent` on `state` so saves survive.
- L1 = season/day/weather headline (from `state.clock` + `state.weather`) + saga + recent. Renders into the system message after L0. L1 changes only at day boundaries — still prefix-cache-friendly within a day.

**Verify:** node --check; smoke test simulating ~3 day boundaries with mock events ⇒ chronicle accumulates, folds, and appears in assembled system prompts; narrator parser tests; `npx vite build`.

---

## Shared rules
- Read `docs/audits/llm-prompt-transference.md` §3 (architecture + Ollama caching notes) before coding.
- Degrade gracefully: LLM offline ⇒ lore builds from local data, chronicle folding skips (keep raw lines), nothing throws.
- Don't touch `src/ui/` beyond what P3 wiring strictly requires; no git operations.
- Gate: tests + build green; combined verification by the orchestrator before commit.
