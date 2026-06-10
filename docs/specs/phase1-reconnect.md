# Phase 1 Spec — "Reconnect Everything"

**Goal:** make every existing-but-severed system honest before building the world-context thread (Phase 2). No new features — only bug fixes, unification, and unplugging dead weight. Everything here is sourced from `docs/audits/` with file:line evidence.

**Status legend:** each workstream is independently shippable and sized for one sub-agent. A and B touch disjoint files and can run in parallel. C must be *verified* first — the weather implementation agent (in flight as of 2026-06-10) was instructed to cover most of it.

---

## Workstream A — LLM prompt data-loss bugs (audit: llm-prompt-transference §1.2, P1)

| # | Fix | Where |
|---|---|---|
| A1 | `context.tilegeneratedName` → `context.tileName` so observations stop saying "somewhere" | `src/ai/llmClient.js:306` |
| A2 | Climate path: read `world.map.biome.climate.avgTemperature/avgMoisture/avgElevation` (stored at `src/map/map.js:715`), not `biome.avgTemperature` | `src/llm/gameAssistant.js:50-52` |
| A3 | Victory conditions: read `victory_conditions` (snake_case, per `scenarioSchema.js:125`) or normalize at ingestion | `src/llm/prompts/gameAssistant.js:105` |
| A4 | Relationships render as "Dwarf #3" — resolve IDs to `generatedName`/`name` via the dwarf list; requires passing `state.dwarves` (or a resolver) into `buildEntitySystemPrompt` | `src/llm/prompts/entityChat.js:236-260`, `src/llm/entityChat.js:42` |

**Acceptance:** a thought prompt contains a real tile description; assistant prompt renders the climate block and victory conditions; entity-chat system prompt names actual dwarves.
**Verify:** `node --check` touched files; add/extend a small parser test if cheap; manual prompt dump via existing debug paths is acceptable.

## Workstream B — Movement unification (audit: entity-walkers §1.1, R1)

| # | Fix | Where |
|---|---|---|
| B1 | Delete the legacy double-move: remove private `moveToward`/`isPassable`/`eat` path from `act()`; `decide()`'s `executeSmartMovement` becomes the single mover (or `act()` delegates to `movement.js` — pick one, not both) | `src/sim/world.js:175-261` |
| B2 | One walkability source: export `isPassable(state, x, y)` from `movement.js` backed by `getTileDef(...).walkable`; replace the hardcoded 25-type whitelist (`movement.js:326-350`) and visitor check (`visitorAI.js:404-429`) with it | `src/sim/movement.js`, `src/ai/visitorAI.js` |
| B3 | Honor `moveCost` (`src/map/tiles.js:82+`, currently read nowhere): cost N → move every Nth tick (simple per-entity accumulator) | `src/sim/movement.js` |
| B4 | Remove dead imports: `findPath` at `dwarfAI.js:26` stays (Phase 4 uses it) but unused `executeSmartMovement`/`moveToward` imports at `visitorAI.js:11` go unless B2 starts using them | `src/ai/visitorAI.js` |

**Acceptance:** a dwarf moves at most 1 tile per tick; all entity classes consult the same walkability function; marsh/snow visibly slow walkers.
**Verify:** `node --check`; run the sim headless if feasible or `npx vite build`; watch for dwarves stuck on previously-double-stepped paths.

## Workstream C — Weather wiring (audit: weather-systems recs 1, 2, 10) — VERIFY FIRST

The in-flight weather agent was told to apply these. Before assigning, diff `src/sim/weather*.js`, `src/events/eventBus.js`, `src/ai/dwarfAI.js` and confirm:

| # | Fix | Where |
|---|---|---|
| C1 | `EVENTS.WEATHER_CHANGE` and `EVENTS.THOUGHT` defined in the enum (currently emitted as `undefined`) | `src/events/eventBus.js:11-52`, `src/sim/weather.js:186,195,204`, `src/sim/weatherCognition.js:119` |
| C2 | Clouds-only gate removed/configurable so rain/snow/fog/seasonal triggers actually spawn | `src/sim/weather.js:80-84` |
| C3 | Case unification: `dwarfAI.js:104-117` UPPERCASE keys vs lowercase `WEATHER_MOOD_MAP`; `'RAIN'`→`'rain'` in `src/sim/fishing.js:68` | `src/ai/dwarfAI.js`, `src/sim/fishing.js` |
| C4 | `getWeatherHealthEffects` call matches signature `(dwarf, weather, chronicity)`; kill the `NaN` at `dwarf._weatherStress` | `src/ai/dwarfAI.js:123-126`, `src/sim/weatherCognition.js:279` |
| C5 | Hygiene: hot-path `console.log`s removed (`weather.js:118-123`, `weatherRenderer.js:43-46`, `main.js:587-593`, `renderer.js:225-228`); unused 4-function import at `world.js:24`; `disorientsLocally` typo (`weatherScenarios.js:275`) | as listed |

Anything the agent didn't cover becomes a small follow-up agent task.

## Workstream D — Dead-code groundwork (audits: walkers §1.3 appendix; llm appendix A) — optional, low priority

Cheap correctness fixes that unblock Phase 4 without activating anything:
- Four animalAI call-signature bugs: `animalAI.js:164` (arg order), `:152`/`:430` (`getTile(map,x,y)` arg order), `:247` (state vs map), `isWalkable` checking nonexistent `obstruction` (`animalAI.js:447-454`) → use Workstream B's `isPassable`.
- Do NOT wire animals into the tick loop yet (that's Phase 4 / WALK R2).

---

## Sequencing & verification gate

1. Verify Workstream C against the weather agent's delivered diff; file gaps as C-followup.
2. Launch A and B in parallel (disjoint files). D rides along with B (same agent) since both touch movement/walkability.
3. Gate: `node --check` on all touched files, `node tests/test-sprites.js`, `node tests/test-narrator-parser.js` (if present), `npx vite build` — all green before commit.
4. Commit Phase 1 as its own commit; then Phase 2 (the `worldContext.js` thread) starts from a clean, honest baseline.
