# Phase 4 — Living World

**Date:** 2026-06-11 · Sources: `docs/audits/SYNTHESIS.md` Phase 4, `entity-walkers.md` R2/R4/R8, `llm-prompt-transference.md` P8/P9

Goal (unchanged): the world feels alive; every LLM turn builds on the layered thread
(L0 lore → L1 chronicle → L2 local senses → L3 turn). Phase 4 adds the *actors and
rhythms* that generate thread-worthy events: animals, intentions, history-aware
visitors, named places, and a day/night pulse.

## Workstream A — Wire the animal ecosystem (WALK R2, highest payoff)

The entire animal system (`src/sim/animals.js`, `src/ai/animalAI.js`) is written and
debugged (Phase 1-D fixed its call signatures) but `state.animals` never exists.

1. `src/state/store.js` — add `animals: []` to `createWorldState`.
2. `src/events/eventBus.js` — add the events animalAI already emits but that don't
   exist: `ANIMAL_ATTACKED`, `ANIMAL_KILLED`, `ANIMAL_BORN`, plus `ANIMAL_DEATH`.
3. `src/sim/animals.js` — new `spawnAnimalsForBiome(state, options)`: species mix by
   biome climate (cold→wolves/deer, hot-dry→boar/rabbit, wet→frogs near water, etc.),
   herbivores spawn in small herds, predators sparse. Export `MAX_ANIMALS` cap so
   reproduction can't explode. New `updateAnimalFear(animal)` so prey species gain
   fear from perceived predators (their `species.predators` list — includes 'dwarf').
4. `src/sim/perception.js` — `calculateThreatLevel`: an animal treats entities in its
   `species.predators` as threats (today a dwarf rates 0.0 to a deer, so prey never
   flee). Also fix the pre-existing `getTile(nx, ny, map)` arg-order bug at :174 that
   silently kills water/vegetation location memory.
5. `src/sim/world.js` tick — animal sub-loop after the dwarf loop: `decayDrives` +
   `ageAnimal` every tick; `perceiveWorld` + fear update + `decideAnimal` every
   `animal.decisionInterval` (10) ticks; `actAnimal` every tick. Dead animals become
   carcass food sources (`getAnimalNutrition`) and emit `ANIMAL_DEATH`.
6. `src/llm/eventNarrator.js` — tap `ANIMAL_KILLED` (predator kills, once per
   predator-species/day) and `ANIMAL_ATTACKED` when the target is a dwarf.
7. `src/llm/worldContext.js` `buildLocalContext` — animals join the typed nearby scan
   ("a wolf prowling close by", "three deer").
8. `src/main.js` — call `spawnAnimalsForBiome(state)` in `regenerateWorld`.

Rendering: already done — `buildRenderEntities` renders `state.animals`, sprite
templates exist for all six species.

## Workstream B — Intention layer: thoughts become destinations (WALK R4)

Keystone that makes the LLM loop bidirectional. No extra LLM calls — a deterministic
keyword parser over the thought text.

1. New `src/ai/intentions.js` — `parseIntent(thought, dwarf, state)`: scans the
   generated thought for desire verbs (want/should/need/wish/go/find/visit/see) plus
   a target vocabulary (water/river, food/berries, mushrooms, crystals, cave, trees,
   a named dwarf, a named landmark). Resolves coordinates via `memory.locations`,
   `state.landmarks`, live entity positions; returns
   `{ targetType, x, y, reason, expiresTick }` or null.
2. `src/ai/thoughts.js` `recordThought` — try `parseIntent`; store on
   `dwarf.intention` (one at a time, newest wins).
3. `src/ai/dwarfAI.js` `findNewTask` — active intention adds a candidate
   (`TASK_TYPE.SCOUT`, priority ~48: above idle/explore, below work and needs).
   New `workIntention`: walk to the spot; on arrival emit `INTENTION_FULFILLED`,
   clear it, small exploration/tranquility fulfillment. Expire stale intentions.
4. `src/events/eventBus.js` — add `INTENTION_FULFILLED`.
5. `src/ai/thoughts.js` — on `INTENTION_FULFILLED`, generate a follow-up
   "arrival" thought (context includes what they set out to do) — closing the loop:
   thought → destination → arrival → new thought.

## Workstream C — History-aware visitors + conversations (P8)

1. `src/llm/prompts/entityChat.js` `buildVisitorSystemPrompt(visitor, context)` —
   add a `## SHARED HISTORY` block from `getDwarfRelation(history, race)` (stance
   line) and `getRecentEventsForRace(history, race)` (the named events). Threaded
   through `buildEntitySystemPrompt(entity, type, context)`.
2. `src/ui/statPanel.js` — pass `history: worldState?.history` in the chat context.
3. Dwarf small talk: `thoughts.js startConversation` passes the latest chronicle
   line as `context.topicHint`; `llmClient.generateConversationSpeech` renders it as
   a "Talk of the camp" line in `SPEECH_INITIATE` prompts.

## Workstream D — Scenario → biome → names continuity chain (P9)

Name gen already inherits scenario+biome via the L0 lore (Phase 2). Remaining link:
biome generation knows nothing of the scenario.

1. `src/main.js` — `addBiomeToMap(state.map, { timeout: 8000, scenario: currentScenario })`.
2. `src/map/map.js` `addBiomeToMap` — pass `options.scenario` to `generateBiome`.
3. `src/llm/biomeGenerator.js` — `buildBiomePrompt(climate, scenario)` adds the
   scenario title/description with "name the region to fit this story's tone".

## Workstream E — Landmarks + day/night congregation (WALK R8 remainder)

`src/sim/clock.js` (Phase 2) already provides `phase: dawn/day/dusk/night`.

1. New `src/sim/landmarks.js` — `extractLandmarks(map, seed)`: bucket-scan
   `map.tiles` for notable clusters (crystal, mushroom, berry_bush, river, marsh,
   mountain_peak); pick the densest cluster per type (≤6 landmarks); deterministic
   evocative names ("the Crystal Hollow", "the Old Mushroom Grove"). Stored as
   `state.landmarks` at worldgen; completed structures act as the gathering hall.
2. `src/ai/dwarfAI.js`:
   - **Dusk:** `findNewTask` adds a `TASK_TYPE.GATHER` candidate targeting the
     hall (completed structure center) → else first landmark → else dwarf centroid.
     `workGather` walks there and socializes (mood/social fulfillment trickle).
   - **Night:** `TASK_TYPE.REST` candidate (priority above routine work);
     `workRest` moves to shelter/hall and sleeps (`AI_STATE.SLEEPING`), restoring
     `energy`. Energy now decays slowly while awake (`world.js`), making sleep real.
   - **Dawn:** rest/gather tasks dissolve naturally (phase no longer matches).
3. `src/llm/worldContext.js` `buildLocalContext` — add day-phase line ("It is dusk —
   the camp drifts toward the hall.") and nearest landmark to the nearby scan;
   `state.landmarks` also resolve intention targets (Workstream B).

## Workstream F — Tests

1. Rewrite `tests/test-weather-integration.js` against the current
   rot.js-front weather API (constructor/addSource/tick/getWeatherAt) — it still
   pokes pre-b110889 internals (`weather.layers.RAIN.intensity`) and fails.
2. New `tests/test-phase4-smoke.js`: store has `animals[]`; biome spawn produces a
   plausible mix; 50 ticks with animals run clean; prey gains fear near a wolf;
   carcass food appears on death; `parseIntent` extracts destinations from sample
   thoughts and ignores non-spatial thoughts; intention candidate appears in
   `findNewTask` and fulfillment event fires on arrival; `extractLandmarks` finds
   and names clusters deterministically; dusk adds a GATHER candidate, night RESTs;
   visitor system prompt contains the relation stance + a historical event; biome
   prompt contains the scenario title.
3. All suites + `npx vite build` green; then commit.

## Sequencing

A (animals) → E (landmarks, since B resolves intention targets against them) →
B (intentions) → C, D (independent) → F. Each workstream is independently shippable.
