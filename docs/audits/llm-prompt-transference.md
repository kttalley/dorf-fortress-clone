# LLM Prompt Transference & Biome Awareness Audit — Emergent Potential

**Date:** 2026-06-10
**Scope:** read-only audit of what world information reaches each LLM call, what never does, and an architecture for layered, thread-building system prompts.
**Branch:** `june26-enhancements`
**Siblings:** `docs/audits/entity-walkers.md` (walkers ↔ LLM loop), `docs/audits/weather-systems.md` (weather ↔ LLM coupling). Cross-references are marked **[WALK]** / **[WX]**.

---

## 1. Current State: What World Info Reaches Each LLM Call

### 1.0 Transport layer — no system role, no threading at the API level

Every LLM call funnels through `generate()` in `src/ai/llmClient.js:86-154` (rate-limited via `queueGeneration`, `llmClient.js:162-189`, `MAX_CONCURRENT = 10` at `llmClient.js:21`). Two crucial facts:

1. **Everything is one user message.** `llmClient.js:100` sends `messages: [{ role: 'user', content: prompt }]`. Every caller that has a "system prompt" concatenates it manually: `scenarioGenerator.js:64` (`${system}\n\n${user}`), `entityChat.js:44`, `gameAssistant.js:72`, `nameGenerator.js:217,348`, `eventNarrator.js:89`. The Ollama/OpenAI-compatible endpoint never sees a `system` role, so there is no stable system-prompt prefix at the protocol level.
2. **No conversation threading.** No call site ever sends a multi-message `messages` array. "History" is always re-serialized into the prompt text (`buildEntityUserPrompt`, `src/llm/prompts/entityChat.js:116-130`; `buildUserPrompt`, `src/llm/prompts/gameAssistant.js:199-206`).

The Groq fallback (`llmClient.js:31-78`) mirrors this. The `llm-proxy/server.js` is a *third*, OpenAI-keyed transport with the same single-user-message shape (`server.js:78-81`) — and **nothing in `src/` calls it**; `VITE_VLLM_URL` in `.env` points directly at a hosted Ollama `/v1/chat/completions`. The proxy is a vestigial deployment alternative, not part of the live data flow.

### 1.1 Per-call data-flow map

| Call | Trigger | World info IN | Continuity | World info that exists but is NOT sent |
|---|---|---|---|---|
| **Scenario gen** (`src/llm/scenarioGenerator.js:32-120`) | setup screen (`src/ui/scenarioScreen.js:198`, `src/main.js:92`) | theme + optional custom hint only (`prompts/scenarios.js:101-120`) | none | nothing else exists yet — but its *output* (title/description) never flows forward into biome gen, names, or thoughts |
| **Biome gen** (`src/llm/biomeGenerator.js:115-147,187-230`) | worldgen, `addBiomeToMap` (`src/map/map.js:685-723`, called `main.js:145`) | 3 climate scalars (temp/moisture/elevation) | none | scenario theme/description, palette, terrain composition, river/cave facts |
| **Name & bio gen** (`src/llm/nameGenerator.js`, `prompts/dwarf.js:33-52`) | entity creation (`src/sim/entities.js:491`, `src/main.js:260`) | traits (≤4 adjectives) + aspiration | none | **worldSnapshot is always `null`** — `nameGenerationEvents.js:69` passes `null`, `entities.js:491` passes nothing — so `buildWorldContext` (`nameGenerator.js:269-286`) is dead code. No biome, scenario, or history flavor ever shapes a name. |
| **Dwarf thoughts** (`PROMPT_TEMPLATES`, `src/ai/llmClient.js:258-346`; driven by `src/ai/thoughts.js`) | events: meeting/food/hunger/mood/terrain + 12s background loop (`thoughts.js:103-128,440-469`) | name, top-3 traits, mood, hunger, nearby dwarf names+states, relationship blurb (`llmClient.js:443-461`), last thought + last 2 memory events (`llmClient.js:463-481`), location string | dwarf `memory.recentThoughts` (1 entry quoted) | biome name, weather, season/time, scenario, world history, current task/job, nearby visitors/animals/food/structures, `generatedBio`. **[WALK]** location is broken anyway: `llmClient.js:306` reads `context.tilegeneratedName` but `thoughts.js:194,455` passes `tileName` → every observation says "somewhere"; `getTileDescription` (`thoughts.js:531-556`) never reaches the model. |
| **Conversation speech** (`SPEECH_INITIATE`/`SPEECH_RESPOND`, `llmClient.js:321-345`) | 70% chance after meeting (`thoughts.js:203-205,306-409`) | speaker traits, current thought, relationship + interaction count, last 3 lines of pair `conversationLog` (`llmClient.js:483-492`) | per-pair `conversationLog` capped at 10 (`thoughts.js:595-611`) | everything above, plus *topic grounding* — no shared world nouns (place, event, weather) so dialogue floats free of the sim |
| **Entity chat (player↔dwarf/visitor)** (`src/llm/entityChat.js:27-65`, `prompts/entityChat.js`) | stat panel UI (`src/ui/statPanel.js:210`) | richest per-entity prompt: bio, traits, mood, activity, fulfillment needs, memories, relationships, 6-turn history | per-entity history, 10 messages (`entityChat.js:12-13,108-120`) | biome, weather, scenario, world history/race relations (visitor prompt has *no* knowledge of the dwarf–goblin war computed in `src/sim/history.js:283`). Relationships render as **"Dwarf #3: good friend"** (`prompts/entityChat.js:250-257`) — IDs, not names — so the entity can't actually gossip. |
| **Game assistant** (`src/llm/gameAssistant.js:27-93`, `prompts/gameAssistant.js`) | assistant panel (`src/ui/gameAssistantPanel.js:311`) | the most complete: compressed world ≤1000 tok (`src/utils/gameContextCompressor.js`: overview, per-dwarf stats+thought, resources, relationships, last 5 log lines), biome name/description/resources, history events + race relations, ≤5 visitors, scenario, 6-message chat history | module-level chat history, 10 messages (`gameAssistant.js:11-12`) | weather, narrated log, season. Plus two silent data-loss bugs (§1.2). |
| **Event narrator** (`src/llm/eventNarrator.js`, `prompts/narrative.js`) | **never** — `queueEventForNarration` / `processEndOfDay` / `shouldNarrate` have zero call sites outside the module (only `tests/test-narrator-parser.js` touches the parser) | (designed: day number + ≤10 raw events) | (designed: `worldState.narratedLog`, capped 100) | the entire day-chronicle pipeline is dead code — the one component built to create a rolling narrative thread is unplugged |

### 1.2 Silent data-loss bugs in the paths that *do* exist

These four bugs mean even the intended transference quietly fails:

1. **`tilegeneratedName` typo** — `src/ai/llmClient.js:306` vs `thoughts.js:194,455`. Observation prompts always say "somewhere". (Also flagged by **[WALK]** §1.5.)
2. **Climate read from wrong path** — `src/llm/gameAssistant.js:50-52` reads `world.map.biome.avgTemperature` etc., but `addBiomeToMap` stores climate at `map.biome.climate.avgTemperature` (`src/map/map.js:715`). All three values are `undefined`, and `buildUserPrompt`'s guards (`prompts/gameAssistant.js:130-141`) silently skip the entire climate block. The assistant is told the biome's *name* but never its temperature/moisture/elevation.
3. **Victory-conditions key mismatch** — scenario objects carry `victory_conditions` (snake_case; `scenarioSchema.js:125,218`, `prompts/scenarios.js:37`), but `buildUserPrompt` reads `worldContext.scenario.victoryConditions` (`prompts/gameAssistant.js:105`). The scenario's goals never render in any prompt. (`main.js:519` passes `currentScenario` straight through.)
4. **`history.summary` is never populated** — `gameAssistant.js:57` forwards `world.history.summary`, but `generateWorldHistory` (`src/sim/history.js:274-308`) creates no `summary` field. The well-written `getHistorySummary` (`history.js:333-370`) is imported at `main.js:27` and **never called anywhere**. The `## WORLD HISTORY SUMMARY` section (`prompts/gameAssistant.js:151-153`) never renders.

### 1.3 Continuity inventory (what "threading" exists today)

- Per-entity chat history: 10 messages (`entityChat.js:13`).
- Assistant chat history: 10 messages (`gameAssistant.js:12`).
- Per-dwarf memory: `recentThoughts` / `significantEvents` / `recentConversations` (`src/sim/entities.js`, written by `thoughts.js:489` via `addMemory`), surfaced as 1 thought + 2 events (`llmClient.js:463-481`) or 3 events + 2 convos (`prompts/entityChat.js:207-234`).
- Per-pair conversation logs: 10 entries (`thoughts.js:595-611`).
- World log: 50 entries (`src/state/store.js:36-41`), surfaced only to the assistant as last 5 truncated lines (`gameContextCompressor.js:162-171`).

There is **no world-level thread**: no accumulating chronicle, no cross-call shared context, no stable system prefix. Each thought/speech call is an island that re-derives everything from entity state.

---

## 2. Gaps: World State That Never Reaches Any Prompt

| World state | Where it lives | Prompt reach | Notes |
|---|---|---|---|
| **Weather** | `WeatherSimulator` (`src/sim/weather.js`), per-tile query `getWeatherAt` | **zero** | `buildWeatherContext` / `getWeatherDecisionGuidance` (`src/sim/weatherCognition.js:314-342`) were written *exactly for this* and have no call sites. **[WX]** §1.8 confirms: no weather in any prompt; also note **[WX]** §1.5 — only clouds ever exist until the clouds-only gate (`weather.js:80-84`) is lifted. |
| **Season / day / time** | computed inside `updateSeasonalWeather` (`src/sim/weatherScenarios.js:175-190`: 1200-tick days, 30-day seasons) then thrown away | zero | no `state.clock`; narrator's `getDay` (`eventNarrator.js:55-57`) is dead with the module. Dwarves think identically at dawn of spring and dead of winter. |
| **World history / race relations** | `state.history` (`main.js:187`, `src/sim/history.js`) | assistant only | dwarf thoughts, conversations, entity chat, visitor chat, and name gen never learn that "dwarves are at war with goblins (−40)". A visitor goblin chats with no knowledge of `getDwarfRelation` (`history.js:313-317`). |
| **Biome identity** | `state.map.biome` (name, description, colorMod, climate, resources — `map.js:710-718`) | assistant only (climate broken, §1.2.2) | dwarves living in "Frozen Volcanic Highlands" never hear the phrase. `inferBiomeResources` (`map.js:647-676`) computes native resources used nowhere else. |
| **Scenario premise** | `currentScenario` (`main.js:92`) | assistant only (victory conditions dropped, §1.2.3) | a "brutal survival" scenario produces the same thoughts as a "lush valley commune". |
| **Recent events / log** | `state.log` (50 entries), `narratedLog` (designed) | assistant only, last 5 lines | thoughts never reference fortress events ("Sigrun died yesterday" is invisible to every other dwarf's prompts unless it landed in their personal `memory`). |
| **Spatial context** | tile types (`getTileDescription`, `thoughts.js:531-556`), `memory.locations` + `visitedAreas` (`src/sim/perception.js:100-115`), food sources, construction (`src/sim/construction.js`), production sites | effectively zero | typo kills location (§1.2.1); nearby *food/structures/water/visitors* never described; perception memory never serialized into prompts. **[WALK]** §1.1 notes perception is ignored by movement too — it's ignored by prompts as well. |
| **Visitors near a dwarf** | `state.visitors` | assistant only (race/purpose/state of ≤5) | a dwarf standing next to a goblin raider generates an observation about being "alone" — `findNearbyDwarves` (`thoughts.js:518-523`) filters to dwarves only. |
| **Current task / drives / skills** | `dwarf.state`, `currentTask`, `drives` (`src/sim/drives.js`), skills | entity chat gets `state` only | thought prompts omit what the dwarf is *doing*; `describeState` vocabulary (`prompts/entityChat.js:164-177`) exists and isn't reused. |
| **Generated bio** | `dwarf.generatedBio` (`nameGenerator.js:152`) | entity chat only | the thought voice and the chat voice are different characters: thoughts never see the bio that defines the persona. |
| **Animals / hunting** | dead system (**[WALK]** §1.3) | zero | once wired, prompts will need a channel for them too. |
| **Relationship names** | `relationships` keyed by id; names resolvable via `state.dwarves` | partially | `prompts/entityChat.js:250-257` prints "Dwarf #id". |

**Summary:** the project has an unusually rich world substrate (history, biome+climate+resources, weather, perception memory, drives) and a single consumer of most of it (the game-assistant panel). The ambient, high-frequency calls — thoughts and conversations, the ones that create the *feeling* of a living world — receive the least world information of all call types.

---

## 3. Emergent Potential: A Layered World-Context Assembler

### 3.1 Goal restated as architecture

"Each LLM turn gets more of the world as a system prompt, building on a thread" decomposes into four context layers with different change rates, plus a transport change so layers map onto real `system`/`user` roles:

```
┌────────────────────────────────────────────────────────────────────┐
│ L0  WORLD LORE        built once at worldgen; byte-stable string   │
│     scenario title/description/victory · biome name+climate+      │
│     resources · history summary + race relations                  │
├────────────────────────────────────────────────────────────────────┤
│ L1  CHRONICLE THREAD  rebuilt at day boundaries / major events     │
│     season+day+weather headline · "the saga so far" rolling       │
│     summary · last N narrated day-events · fortress status digest │
├────────────────────────────────────────────────────────────────────┤
│ L2  LOCAL CONTEXT     per entity, computed at call time            │
│     tile description · weather at (x,y) · nearby dwarves/visitors/ │
│     food/structures · behavior trace [WALK §3.1] · task · bio     │
├────────────────────────────────────────────────────────────────────┤
│ L3  TURN              event specifics / question / dialogue turn   │
└────────────────────────────────────────────────────────────────────┘
        L0+L1 → system message      L2+L3 → user message
```

### 3.2 New module: `src/llm/worldContext.js`

A single assembler all call sites import:

```js
// sketch — integration points are real
import { getHistorySummary } from '../sim/history.js';          // exists, uncalled (history.js:333)
import { buildWeatherContext } from '../sim/weatherCognition.js'; // exists, uncalled (:314)
import { estimateTokens } from '../utils/gameContextCompressor.js'; // exists (:186)

let loreCache = null;                       // L0: build once, cache the string
export function buildWorldLore(state, scenario) { /* scenario + state.map.biome + getHistorySummary(state.history) */ }

let chronicle = { saga: '', recent: [], headline: '' };   // L1: module state
export function updateChronicle(state) { /* on day boundary: narrated events in, oldest folded into saga */ }

export function buildLocalContext(entity, state) { /* tile, weather.getWeatherAt, nearby scan incl. visitors/food, task, bio */ }

export function assembleContext({ entity, state, scenario, turn, budget = 900 }) {
  // returns { system, user } — trims L2 details first, then L1.recent; never trims L0
}
```

**Integration points (all real):**

- **Transport:** extend `generate(prompt, options)` (`llmClient.js:86`) to accept `options.system` and emit `messages: [{role:'system',...},{role:'user',...}]` at `llmClient.js:100` (and the Groq path at `:51`). Backwards-compatible: absent `system`, behave as today.
- **Thoughts:** `generateEventThought` (`llmClient.js:359-389`) and the templates (`:258-346`) take an extra `worldCtx` arg supplied by `thoughts.js` handlers (which already hold `state.worldState` — `thoughts.js:57`).
- **Conversations:** `generateConversationSpeech` (`llmClient.js:399-420`) gets the same `system`; shared L0/L1 nouns ("the Misty Vale treaty", "the autumn fog") give dialogue grounded topics — the missing ingredient identified in §1.1.
- **Entity chat:** prepend L0+L1 inside `buildEntitySystemPrompt` (`prompts/entityChat.js:13`); visitors additionally get `getDwarfRelation(state.history, visitor.race)` + `getRecentEventsForRace` (`history.js:313-328`).
- **Assistant:** `askGame` (`gameAssistant.js:27`) replaces its bespoke `worldContext` assembly (`:45-68`) with the assembler (fixing §1.2.2-4 in passing).
- **Name gen:** `entities.js:491` / `main.js:260` pass `{ lore: buildWorldLore(...) }` so `buildWorldContext` (`nameGenerator.js:269`) finally runs — names start echoing biome and history.
- **Chronicle source:** wire the dead narrator — call `queueEventForNarration` from `addLog` consumers or an event-bus tap, and `processEndOfDay(state)` (`eventNarrator.js:119-166`) from the day-boundary check in `main.js`'s loop (the same place `updateSeasonalWeather` runs every 100 ticks, `main.js:612-615`). Its `narratedLog` output is exactly L1's `recent` feed.

### 3.3 The thread: accumulation with compression

L1 is what makes turns "build upon a thread":

1. Every day boundary: `processEndOfDay` narrates the day's key events (already selects/prioritizes, `eventNarrator.js:174-209`).
2. `updateChronicle` appends them to `chronicle.recent` (cap ~8 lines).
3. When `recent` overflows, fold the oldest 4 into `chronicle.saga` via one cheap LLM summarization call ("compress these chronicle lines into 2 sentences, keep names") — an *accumulating but bounded* memory. Store `saga` on `state` so it persists with saves.
4. Cross-entity propagation comes free: any dwarf's thought prompt now contains "Day 12: Sigrun perished in the western marsh" without needing per-dwarf memory plumbing.

This mirrors the per-dwarf `memory` design but at world scope, and it is the structure the owner asked for: stable lore → slowly accreting thread → fresh local detail.

### 3.4 Token budgets and Ollama-stack realities

- **Budget per layer** (at ~4 chars/token via `estimateTokens`): L0 ≤ 350, L1 ≤ 250, L2 ≤ 200, L3 ≤ 150 → ≤ 950 prompt tokens + ≤ 80-200 completion. Set Ollama `options.num_ctx` explicitly (request body at `llmClient.js:98-107`) — Ollama defaults can be as low as 2048; layered prompts plus chat history must fit, and silent context truncation would eat L0 *first* (it's the prefix), which is the worst possible loss. Budget enforcement in `assembleContext` is therefore not optional.
- **Prefix caching:** Ollama reuses the KV cache when a request's prompt prefix is byte-identical to the previous request on the warm model. Today every prompt *starts* with volatile content (dwarf name/mood), guaranteeing zero reuse. With L0+L1 as a byte-stable system message, all thought/speech/chat calls share a cached prefix that only changes at day boundaries. Two caveats: (a) interleaving different call types with different L0 variants thrashes the cache — keep ONE canonical L0 string for all call types; (b) `MAX_CONCURRENT = 10` (`llmClient.js:21`) means parallel requests with different prefixes compete; consider dropping ambient-thought concurrency to 2-3 (it was 2 before, per the comment) now that prompts are larger.
- **Latency tiers:** thoughts are fire-and-forget (cooldowns at `thoughts.js:17-22` absorb seconds of latency); entity chat and assistant are interactive. If needed, give thoughts a trimmed L1 (headline only) and the interactive calls the full thread.
- **Fallback symmetry:** Groq path and `llm-proxy/server.js` should accept the same `{system, user}` shape so behavior is provider-invariant (`server.js:78-81` currently hardcodes a single user message too).

---

## 4. Prioritized Recommendations

Ranked by impact/effort. P1-P3 are prerequisites that cost hours, not days.

### P1. Fix the four silent data-loss bugs — **high impact, trivial effort**
(a) `context.tilegeneratedName` → `context.tileName` at `src/ai/llmClient.js:306` (**[WALK]** R3); (b) climate path `world.map.biome.climate.*` at `src/llm/gameAssistant.js:50-52`; (c) read `victory_conditions` (or map it) at `src/llm/prompts/gameAssistant.js:105`; (d) resolve relationship IDs to `generatedName` in `src/llm/prompts/entityChat.js:236-260` (needs the dwarf list passed into `buildEntitySystemPrompt`, `src/llm/entityChat.js:42`). Every other recommendation builds on prompts that actually contain what they claim to.

### P2. Real system/user roles in the transport — **high impact, low effort**
Add `options.system` to `generate`/`queueGeneration` (`src/ai/llmClient.js:86,100` and Groq at `:51`); migrate the five manual `${system}\n\n${user}` concatenations (`scenarioGenerator.js:64`, `entityChat.js:44`, `gameAssistant.js:72`, `nameGenerator.js:217,348`, `eventNarrator.js:89`). Unlocks prefix caching and is the foundation for layered prompts. *Files:* `src/ai/llmClient.js`, the five callers, optionally `llm-proxy/server.js`.

### P3. Build `src/llm/worldContext.js` with L0 (lore) and wire it everywhere — **highest impact, medium effort**
Implement `buildWorldLore` from `currentScenario` (`src/main.js:92,519`), `state.map.biome` (`src/map/map.js:710-718`), and `getHistorySummary(state.history)` (`src/sim/history.js:333` — first-ever call site). Inject as the system prefix in thoughts (`llmClient.js:258-346`), entity chat (`prompts/entityChat.js:35`), assistant (`gameAssistant.js:45-72`), and name gen (`entities.js:491`, fixing the `null` worldSnapshot at `nameGenerationEvents.js:69`). One module, every call type becomes world-aware. *Files:* new `src/llm/worldContext.js`, `src/ai/llmClient.js`, `src/ai/thoughts.js`, `src/llm/entityChat.js`, `src/llm/gameAssistant.js`, `src/llm/nameGenerator.js`, `src/sim/entities.js`, `src/main.js`.

### P4. Wire the dead event narrator and make it the L1 chronicle — **high impact, medium effort**
Call `queueEventForNarration` wherever `addLog` records notable events (or tap the event bus), and `processEndOfDay(state)` (`src/llm/eventNarrator.js:119`) at the existing 100-tick maintenance point (`src/main.js:612-615`). Feed `state.narratedLog` into `updateChronicle` (P3 module) with saga-folding compression (§3.3). This is the literal "thread that each turn builds upon." *Files:* `src/main.js`, `src/llm/eventNarrator.js`, `src/llm/worldContext.js`, `src/state/store.js` (persist `saga`).

### P5. Season/day clock surfaced into L1 — **medium-high impact, low effort**
Extract the day/season math from `updateSeasonalWeather` (`src/sim/weatherScenarios.js:175-190`) into a shared `getCalendar(tick)` (or **[WALK]** R8's `src/sim/clock.js`), store on `state`, and render one headline line in L1 ("Day 14, mid-autumn, fog on the marsh"). Cheapest possible temporal texture for every prompt. *Files:* `src/sim/weatherScenarios.js` (+ new `src/sim/clock.js`), `src/llm/worldContext.js`.

### P6. Weather into L2 via the builders that already exist — **medium impact, low effort *after* [WX] fixes**
Call `buildWeatherContext(dwarf, state.weather.getWeatherAt(dwarf.x, dwarf.y))` (`src/sim/weatherCognition.js:314`) inside `buildLocalContext`. Note dependency: until the clouds-only gate (`src/sim/weather.js:80-84`) and the case-mismatch bugs (**[WX]** §1.6) are fixed, the only honest weather line is "clouds drift overhead" — ship it anyway; it validates the pipe. *Files:* `src/llm/worldContext.js`, `src/sim/weatherCognition.js`.

### P7. Spatial "what's near" builder for L2 — **medium-high impact, medium effort**
Extend the nearby scan in `thoughts.js` (`findNearbyDwarves`, `:518-523`) to a typed scan: visitors (`state.visitors` with race/role — a dwarf should *notice* a goblin), food sources, water/landmark tiles via `getTileDescription` (`thoughts.js:531`), and constructed structures. Reuse `memory.locations` (`src/sim/perception.js:100-115`) so dwarves reference *remembered* places ("the berry bushes east of camp"). Combines with **[WALK]** R3's behavior trace for one ~3-line local block. *Files:* `src/llm/worldContext.js`, `src/ai/thoughts.js`, `src/sim/perception.js` (read-only reuse).

### P8. History-aware visitors and conversations — **medium impact, low effort**
In `buildVisitorSystemPrompt` (`src/llm/prompts/entityChat.js:68-100`), add `getDwarfRelation`/`getRecentEventsForRace` (`src/sim/history.js:313-328`) so a goblin merchant knows about the Betrayal at Frostgate. Add one "shared history" line to `SPEECH_INITIATE` (`llmClient.js:321`) so dwarf small talk can reference world events. *Files:* `src/llm/prompts/entityChat.js`, `src/llm/entityChat.js`, `src/ai/llmClient.js`.

### P9. Scenario → biome → names continuity chain — **medium impact, low effort**
Pass the scenario's title/description into `buildBiomePrompt` (`src/llm/biomeGenerator.js:115`; threaded through `addBiomeToMap` options at `src/map/map.js:685` from `main.js:145`), and biome+scenario into name gen (covered by P3). Generation steps stop being independent dice rolls and start composing one coherent world. *Files:* `src/llm/biomeGenerator.js`, `src/map/map.js`, `src/main.js`.

### P10. Budget guardrails + concurrency tuning — **low impact alone, protects everything else**
Enforce per-layer budgets in `assembleContext` using `estimateTokens` (`src/utils/gameContextCompressor.js:186`); set explicit `num_ctx` in the request body (`src/ai/llmClient.js:98-107`); drop `MAX_CONCURRENT` (`llmClient.js:21`) for ambient thoughts to preserve prefix-cache hits and local-rig throughput. *Files:* `src/ai/llmClient.js`, `src/llm/worldContext.js`.

---

## Appendix A: Dead/disconnected prompt-context inventory

| Item | Location | Status |
|---|---|---|
| Event narrator pipeline | `src/llm/eventNarrator.js` | zero live call sites; only the parser is tested |
| `getHistorySummary` | `src/sim/history.js:333` | imported at `main.js:27`, never called |
| `buildWeatherContext` / `getWeatherDecisionGuidance` | `src/sim/weatherCognition.js:314-342` | never called (**[WX]** §1.8) |
| `buildWorldContext` (name gen) | `src/llm/nameGenerator.js:269` | unreachable — worldSnapshot always `null` (`nameGenerationEvents.js:69`, `entities.js:491`) |
| `world.history.summary` | read at `gameAssistant.js:57` | field never exists on the history object |
| Biome climate in assistant prompt | `gameAssistant.js:50-52` | wrong path (`biome.climate.*`), silently skipped |
| Scenario victory conditions in prompt | `prompts/gameAssistant.js:105` | key mismatch (`victoryConditions` vs `victory_conditions`) |
| `context.tilegeneratedName` | `src/ai/llmClient.js:306` | typo; observations say "somewhere" (**[WALK]** appendix) |
| `compressWorldForAnalysis` + `prompts/analysis.js` | `src/utils/worldCompressor.js` | post-run analysis pipeline, zero call sites |
| `llm-proxy/` server | `llm-proxy/server.js` | not referenced by client code; client hits Ollama URL directly |
| Legacy `generateThought`/`generateSpeech` | `src/ai/llmClient.js:573-606` | superseded by event templates; kept "for backwards compatibility", no live callers found |

## Appendix B: Prompt-reach matrix (world fact × call type)

| Fact | Thoughts | Speech | Entity chat | Assistant | Name gen | Biome gen | Narrator* |
|---|---|---|---|---|---|---|---|
| Biome name/climate | — | — | — | partial (bugged) | — | n/a | — |
| Weather | — | — | — | — | — | — | — |
| Season/day | — | — | — | — | — | — | designed |
| World history | — | — | — | ✓ | — | — | — |
| Scenario | — | — | — | partial (bugged) | — | — | — |
| Recent world events | — | — | — | last 5 log lines | — | — | designed |
| Tile/location | bugged ("somewhere") | — | — | positions only | — | — | — |
| Nearby dwarves | ✓ names+states | implicit | — | ✓ | — | — | — |
| Nearby visitors/threats | — | — | — | ✓ (global list) | — | — | — |
| Personal memory | 1 thought + 2 events | thought only | ✓ rich | truncated thought | — | — | — |
| Relationships | ✓ described | ✓ + 3-line log | ✓ (by ID, bugged) | ✓ pairs | — | — | — |
| Personality/bio | traits only | traits only | ✓ full | traits | traits+aspiration | — | — |

\* narrator column reflects its design; the module is currently unwired.
