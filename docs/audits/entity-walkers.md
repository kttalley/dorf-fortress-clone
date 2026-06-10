# Entity Walkers Audit — Emergent Potential

**Date:** 2026-06-10
**Scope:** Movement/behavior of dwarves, visitors, and animals; their connection to the LLM thought system.
**Branch:** `june26-enhancements`

---

## 1. Current State: How Each Entity Class Walks

### 1.1 Dwarves — two competing movement systems, both run each tick

The tick loop (`src/sim/world.js:42-155`) runs per dwarf: drives decay → hunger → perception (every 30 ticks, `world.js:96-104`) → `decide()` → `act()`.

**Decision layer** (`src/ai/dwarfAI.js:94-157`) is a priority cascade:

1. Combat threat → fight/flee by `personality.bravery` and HP ratio (`dwarfAI.js:708-753`)
2. Continue fleeing until threat > 10 tiles away (`dwarfAI.js:758-778`)
3. Critical hunger (≥85) → beeline to nearest food (`dwarfAI.js:623-635`)
4. Continue current task for up to 20 ticks (`dwarfAI.js:150-152`)
5. Otherwise score candidate tasks — forage / socialize / explore / dig / build / craft / idle — by priority weights plus aspiration bonuses (`dwarfAI.js:198-300`, `findAspirationWork` at `dwarfAI.js:305-372`)

**Movement layer A — "smart movement"** (`src/sim/movement.js:115-172`, `executeSmartMovement` at `movement.js:296-311`): a weighted vector blend of momentum (0.4), target attraction (0.6), food-scent gradient (0.3), social force from relationship affinity (0.25, `movement.js:177-226`), exploration bias, and random noise; `vectorToMovement` (`movement.js:253-291`) picks the best passable 8-neighbor. The scent map is single-channel, food-only (`world.js:59-63`, `movement.js:39-76`).

**Movement layer B — legacy greedy step** (`src/sim/world.js:199-213`): after `decide()` returns, `act()` (`world.js:175-194`) *also* moves the dwarf one cardinal step toward `dwarf.target` with its own private `moveToward`.

> **Finding (bug):** Most `dwarfAI` work functions call `executeSmartMovement` *inside* `decide()` (e.g. `dwarfAI.js:444`, `475`, `506`, `581`) and then return a `target`, which `world.js act()` moves toward *again*. Dwarves can move up to 2 tiles per tick through two different walkability checks. The duplicate `moveToward`/`isPassable` in `world.js:199-261` predates `movement.js` and was never removed.

**A\* exists but is dead:** `findPath` (`movement.js:355-420`) has zero call sites; `dwarfAI.js:26` imports it and never uses it.

**Exploration is goalless jitter:** `decideExplore` (`dwarfAI.js:587-605`) picks a *new* random angle every call, so "exploring" dwarves re-randomize their destination every decision and drift brownianly.

**Perception is built but ignored by movement:** `perceiveWorld` (`src/sim/perception.js:44-119`) populates `memory.locations`, perceived entities, and threat data — yet `findNearestFood` (`dwarfAI.js:639-654`) omnisciently scans the global `state.foodSources` array, and no walker ever reads `memory.locations` or `visitedAreas` (except a fulfillment ping in `workExplore`, `dwarfAI.js:547-564`).

### 1.2 Visitors — role FSMs with greedy stepping

`processVisitors` (`src/ai/visitorAI.js:474-488`) runs a per-role FSM (`decideVisitor`, `visitorAI.js:29-62`): merchants/missionaries/diplomats beeline to the fortress center (the live centroid of all dwarves, `src/sim/edges.js:122-148`); raiders chase the nearest dwarf (`visitorAI.js:142-161`); scouts keep 5 tiles away from dwarves for 100 ticks then leave (`visitorAI.js:165-191`); guards tether to their merchant (`visitorAI.js:119-138`); everyone exits via the nearest map edge (`edges.js:156`).

Movement is a hand-rolled greedy step with collision checks against other visitors only (`moveTowardTarget`/`tryMove`, `visitorAI.js:384-429`). `visitorAI.js:11` imports `executeSmartMovement`/`moveToward` and never uses them — visitors get no scent, no momentum, no pathfinding. Spawning (`src/sim/visitorSpawner.js`) is history-weighted by race relations (`src/sim/history.js:375`), which is a nice emergent hook already.

### 1.3 Animals — a complete behavior system that is never executed

`src/sim/animals.js` (species, diets, predator/prey lists, aging, mating) and `src/ai/animalAI.js` (fleeing, hunting with chase/attack phases, grazing, territory return at `animalAI.js:97-105`, mate seeking) are **dead code**:

- `decideAnimal`/`actAnimal` are never called from `world.js` or anywhere else.
- `createAnimal` (`animals.js:92`) has zero call sites; `createWorldState` (`src/state/store.js:9-31`) has no `animals` array, so `state.animals` is always `undefined`.
- `src/ui/renderer.js:694`, `src/sim/perception.js:137`, and `src/sim/hunting.js:33` all guard on `state.animals` defensively — the rendering and perception plumbing is ready and waiting.

Latent bugs to fix when wiring it up:

- `animalAI.js:164` calls `executeSmartMovement(animal, grassTile, state)` but the signature is `(entity, state, options)` (`movement.js:296`) — the target is passed where state belongs.
- `animalAI.js:152` and `animalAI.js:430` call `getTile(animal.x, animal.y, state.map)`, but `map.js` exports `getTile(map, x, y)` (`src/map/map.js:74`).
- `animalAI.js:247` calls `moveToward(animal, away, state.map)` — passes the map where the full state is expected.
- `isWalkable` (`animalAI.js:447-454`) checks `tileDef?.obstruction`, a property that does not exist in `src/map/tiles.js` (which defines `walkable`/`moveCost`), so every tile including water and walls reads as walkable.

### 1.4 Terrain and weather influence: defined, never consumed

- `src/map/tiles.js:80-110` defines `walkable` **and** `moveCost` per tile — `moveCost` is referenced nowhere in `src/`. Marsh, snow, and sand cost the same as a path.
- There are **four divergent walkability implementations**: `world.js:252-261` (tileDef.walkable), `movement.js:326-350` (its own hardcoded 25-type whitelist), `visitorAI.js:404-429` (tileDef.walkable + visitor collision), `animalAI.js:447-454` (nonexistent `obstruction`). They can disagree about the same tile.
- `getWeatherBehaviorModifier` (`src/sim/weatherCognition.js:186-223`) defines shelter-seeking priority shifts per weather type (rain → `seeking_shelter +5`, miasma → `+10`, etc.). It is imported in `world.js:24` and `dwarfAI.js:61` but **never called**. Weather currently affects mood/fulfillment/health only (`dwarfAI.js:100-131`); no entity ever changes *where it walks* because of rain.

### 1.5 LLM thoughts — strictly one-way, and the location context is broken

`src/ai/thoughts.js` is event-driven (meeting, food found, hunger threshold, mood shift, terrain change, plus a 12s background observation loop). The flow is:

```
sim events → generateEventThought() → dwarf.currentThought / memory / speech bubbles
```

Nothing flows back. `dwarf.currentThought` is read only by UI panels and `gameContextCompressor.js:70`; no decision in `dwarfAI.js` ever consults a thought, intention, or conversation outcome. A dwarf can think "I should go see the river" and then walk to a dig site.

> **Finding (bug):** `THOUGHT_OBSERVATION` reads `context.tilegeneratedName` (`src/ai/llmClient.js:306`) but `thoughts.js` passes `tileName` (`thoughts.js:194,455`), so the location in every observation prompt is the literal string `'somewhere'`. The carefully built `getTileDescription` ("by the river", "near glowing crystals") never reaches the LLM.

The richest behavioral signal the LLM currently receives is a single `state` string and position via `compressDwarves` (`src/utils/gameContextCompressor.js:57-76`) — and that only for the game-assistant panel, not for thought prompts.

### 1.6 Per-entity state inventory (`src/sim/entities.js:122-233`)

Dwarves carry: personality (10 traits), skills, aspiration, fulfillment (4 needs), unified drives (`src/sim/drives.js`), hp/combat stats, relationships with affinity + per-pair conversation logs (`thoughts.js:558-611`), momentum, perception maps, a goal stack (`currentGoal`/`goalStack` — initialized at `entities.js:186-189`, **never used by any code**), and layered memory (thoughts, conversations, events, visited areas, known locations). This is an unusually rich substrate; the walkers just don't use most of it.

---

## 2. Gaps: What Would Make Movement Feel Intentional

| Gap | Current behavior | Evidence |
| --- | --- | --- |
| **No home / territory for dwarves** | Dwarves drift anywhere; no bed, no claimed room, nothing pulls them "home" | only animals have `territoryMarker` (`animalAI.js:98`), and animals don't run |
| **No daily rhythm** | No day/night clock; `energy: 100` is declared "for future use" (`entities.js:136`) and never decays; seasons exist only inside weather (`weatherScenarios.js:175-190`) | dwarves behave identically at tick 10 and tick 10,000 |
| **No congregation / landmarks** | Meetings are accidental proximity events; there is no plaza, hall, or favorite spot that draws idle dwarves together | `thoughts.js:137-178` detects meetings but nothing *causes* them |
| **No flocking/herding** | Animal system dead; even if live, animals have no cohesion force with their own kind | `animalAI.js:318-337` is a pure random walk |
| **No predator/prey on screen** | Hunting/chase logic exists (`animalAI.js:176-225`) but never executes | dead code |
| **No path memory** | `memory.locations` and `visitedAreas` are written but never read for navigation; A* unused | `perception.js:100-115`, `movement.js:355` |
| **No terrain preference** | `moveCost` ignored; frogs would walk through deserts, deer through camps | `tiles.js:82` |
| **No weather-reactive movement** | Shelter-seeking modifiers fully specced but uncalled | `weatherCognition.js:186` |
| **Visitors beeline** | Merchants teleport-walk to the dwarf centroid; no market spot, no wandering to look at structures | `visitorAI.js:90-115` |
| **Thoughts don't steer feet** | LLM output is decorative; intentions never become destinations | `thoughts.js:475-494` |
| **Exploration has no persistence** | Random angle re-rolled every decision | `dwarfAI.js:587-605` |

---

## 3. Emergent Potential: Behavior ↔ LLM Compounding Loop

The owner's goal — each LLM turn receiving richer world info as thread-building context — needs a **bidirectional loop**:

```
        ┌──────────────────────────────────────────────┐
        │  sim walkers (destinations, paths, lingering) │
        └────────────┬─────────────────────────────────┘
                     │ behavior trace ("Urist has paced near
                     │  the river for 200 ticks")
                     ▼
        ┌──────────────────────────────────────────────┐
        │  prompt context (thoughts.js / llmClient.js)  │
        └────────────┬─────────────────────────────────┘
                     │ thought → parsed intention
                     │  ("I want to see the crystals again")
                     ▼
        ┌──────────────────────────────────────────────┐
        │  intent layer → task candidate in findNewTask │
        └──────────────────────────────────────────────┘
```

### 3.1 Behavior trace (sim → LLM)

Add a tiny per-dwarf ring buffer (e.g. position sampled every 10 ticks, last 20 samples) plus a cheap classifier that summarizes it into one phrase:

- low displacement, high path length → *"has been pacing near {landmark}"*
- monotonic direction → *"is trekking east toward the mountains"*
- stationary on a tile type → *"has lingered by the river all morning"*
- repeated visits to same tile → *"keeps returning to the berry bushes"*

Feed that phrase into `THOUGHT_OBSERVATION` / `SPEECH_INITIATE` (`llmClient.js:303-330`) and `compressDwarves` (`gameContextCompressor.js:57`). Cost: ~1 line of prompt per dwarf; payoff: the LLM narrates behavior players can actually see, which is the core of perceived aliveness.

### 3.2 Intentions (LLM → sim)

After `recordThought` (`thoughts.js:475-494`), run a lightweight parser (regex/keyword first; LLM-structured later) mapping thoughts to soft intents:

```js
{ verb: 'visit', targetType: 'river' | 'crystal' | 'dwarf:<id>' | 'landmark:<key>',
  strength: 0.6, expiresTick: tick + 600 }
```

`findNewTask` (`dwarfAI.js:198`) adds the intent as one more scored candidate (priority ~45–55) resolving `targetType` against `memory.locations` — which `perceiveWorld` already populates with typed coordinates (`perception.js:100-115`). The dwarf *may* follow the thought, weather and hunger permitting. Crucially this also fills the never-used `currentGoal`/`goalStack` slots (`entities.js:186-189`).

Then close the thread: when the dwarf arrives, emit an `INTENTION_FULFILLED` event that triggers a follow-up thought ("The crystals are just as I remembered") with the original thought in context. That is a *narrative thread* the system prompt can carry across turns.

### 3.3 Multi-channel scent as a shared emergent medium

The scent map (`movement.js:20-76`) is the cheapest emergence engine in the codebase but carries only food. Make it 3–4 channels:

- `food` (existing), `danger` (combat events / predators emit negative), `dwarf-presence` (each dwarf emits a trickle — animals avoid it, raiders follow it, lonely dwarves seek it), `water` (static, from river tiles).

Then frogs stay near water, deer avoid camps, goblin scouts skulk along low-presence corridors — all from one mechanism, no per-species code. And every channel gradient is a free prompt fact ("the forest has gone quiet around the camp").

### 3.4 Landmarks as social gravity + prompt vocabulary

Derive a named landmark list at worldgen (river bend, crystal cave, big mushroom patch, fortress hall once built via `construction.js`). Use them as (a) idle/social destinations so dwarves visibly congregate, (b) `targetType` resolution for intents, (c) stable names in prompts so conversations across turns reference shared places — threads need shared nouns.

---

## 4. Prioritized Recommendations

Ranked by (impact on aliveness) / (effort). Each is independently shippable.

### R1. Unify movement: delete the double-move, single walkability source — **high impact, low effort**
Remove the legacy `moveToward`/`isPassable` from `src/sim/world.js:199-261` and make `act()` delegate to `movement.js`; collapse the four walkability checks into one exported `isPassable(state, x, y)` in `src/sim/movement.js` backed by `getTileDef(...).walkable`. Apply `moveCost` from `src/map/tiles.js` as a per-tick move-probability (cost 2 → move every other tick). Until this lands, every other behavior tweak is fighting a system that moves dwarves twice with inconsistent rules.
*Files:* `src/sim/world.js`, `src/sim/movement.js`, `src/ai/visitorAI.js`.

### R2. Wire the animal ecosystem into the tick loop — **highest impact, medium effort**
Add `animals: []` to `createWorldState` (`src/state/store.js:10`), spawn species by biome at world init (`src/main.js`), and call `decideAnimal`/`actAnimal` from `world.js tick()` (decisions every ~10 ticks, actions every tick). Fix the four call-signature bugs listed in §1.3. This instantly delivers grazing herds, predator chases, fleeing-from-dwarves, mating, and territories — all already written — and feeds `perception.js:137` and `hunting.js` which already expect animals.
*Files:* `src/state/store.js`, `src/sim/world.js`, `src/main.js`, `src/ai/animalAI.js`, `src/sim/animals.js`.

### R3. Fix the `tilegeneratedName` bug and add the behavior trace to prompts — **high impact, low effort**
One-line fix at `src/ai/llmClient.js:306` (`context.tileName`). Then add the §3.1 position ring buffer + movement summarizer (new ~60-line module, e.g. `src/sim/behaviorTrace.js`, sampled in `world.js`) and include the phrase in thought/speech prompts and `compressDwarves`.
*Files:* `src/ai/llmClient.js`, `src/ai/thoughts.js`, `src/sim/world.js` (+ new `src/sim/behaviorTrace.js`), `src/utils/gameContextCompressor.js`.

### R4. Intention layer: thoughts become destinations — **high impact, medium effort**
Implement §3.2: parse thoughts to intents in `thoughts.js`, score them as candidates in `findNewTask` (`dwarfAI.js:198`), resolve targets via `memory.locations`, emit `INTENTION_FULFILLED` for follow-up thoughts. This is the keystone that makes the LLM loop bidirectional.
*Files:* `src/ai/thoughts.js`, `src/ai/dwarfAI.js`, `src/events/eventBus.js`, `src/ai/llmClient.js`.

### R5. Call the weather behavior modifiers that already exist — **medium impact, low effort**
In `findNewTask`, apply `getWeatherBehaviorModifier` priority shifts (`weatherCognition.js:186`) to candidate scores and add a `SEEK_SHELTER` task targeting the nearest constructed floor/dwelling tile or cave (`construction.js` knows structures). Dwarves visibly running indoors when rain starts is one of the cheapest "world is alive" wins, and it generates weather-coherent prompt context for free.
*Files:* `src/ai/dwarfAI.js`, `src/sim/weatherCognition.js`, `src/sim/construction.js`.

### R6. Persistent exploration targets + memory-driven foraging — **medium impact, low effort**
In `decideExplore` (`dwarfAI.js:587`), pick a destination once (biased away from `memory.visitedAreas` / toward unvisited landmark) and keep it until reached or timed out. Replace omniscient `findNearestFood` (`dwarfAI.js:639`) with `memory.locations` lookup, falling back to scent gradient when no food is remembered — dwarves will visibly *search*, get it wrong, and remember, which reads as intelligence.
*Files:* `src/ai/dwarfAI.js`, `src/sim/perception.js`.

### R7. Multi-channel scent map — **medium-high impact, medium effort**
Implement §3.3 (`danger`, `presence`, `water` channels) in `movement.js`; emit presence in the dwarf loop in `world.js`, danger from `combat.js` events, water at map init. Animals (R2) read presence/water; raider and scout AI read presence instead of omniscient `findNearestDwarf`.
*Files:* `src/sim/movement.js`, `src/sim/world.js`, `src/sim/combat.js`, `src/ai/animalAI.js`, `src/ai/visitorAI.js`.

### R8. Landmarks, gathering spots, and a day/night rhythm — **high impact, higher effort**
Worldgen landmark extraction (scan `map.tiles` for notable clusters), a `state.clock` (day phase derived from tick, reusing `weatherScenarios.js:180` day math), idle-time gravitation toward the hall/landmark at dusk, sleep at night (finally using `energy`). Surfacing "evening, the dwarves drift toward the hall" in prompts gives every LLM turn temporal texture.
*Files:* `src/map/map.js`, `src/sim/world.js` (+ new `src/sim/clock.js`), `src/ai/dwarfAI.js`, `src/utils/gameContextCompressor.js`, `src/ai/llmClient.js`.

### R9. Visitor itineraries and real pathing — **lower impact, low-medium effort**
Give merchants a market waypoint (landmark from R8 or fortress center offset), make scouts orbit the perimeter visiting 2–3 observation points, and route arriving caravans with the unused `findPath` (`movement.js:355`). Visitor sightseeing ("the elf lingered at the crystal cave") is excellent prompt material via the R3 trace.
*Files:* `src/ai/visitorAI.js`, `src/sim/movement.js`, `src/sim/edges.js`.

---

## Appendix: Dead/disconnected code inventory

| Item | Location | Status |
| --- | --- | --- |
| Entire animal system | `src/sim/animals.js`, `src/ai/animalAI.js` | Never invoked; `state.animals` never exists |
| `findPath` (A*) | `src/sim/movement.js:355` | Zero callers; imported unused at `dwarfAI.js:26` |
| `getWeatherBehaviorModifier` | `src/sim/weatherCognition.js:186` | Imported in 2 files, never called |
| `moveCost` tile property | `src/map/tiles.js:82+` | Never read |
| `currentGoal` / `goalStack` | `src/sim/entities.js:186-189` | Initialized, never used |
| `executeSmartMovement`/`moveToward` imports | `src/ai/visitorAI.js:11` | Unused; visitors use private greedy stepper |
| Legacy `moveToward`/`isPassable`/`eat` path | `src/sim/world.js:175-261` | Conflicts with `movement.js` (double movement) |
| `context.tilegeneratedName` | `src/ai/llmClient.js:306` | Typo — observation prompts always say "somewhere" |
