# Weather Systems Audit — Emergent Potential

**Date:** 2026-06-10
**Scope:** read-only audit of weather simulation, rendering, biome coupling, entity behavior coupling, and LLM prompt coupling.
**Branch:** `june26-enhancements`

---

## 1. Current State

### 1.1 Architecture overview

Weather is a **point-source particle system**, not a field/front system:

| Layer | File | Role |
|---|---|---|
| Simulator | `src/sim/weather.js` | `WeatherSimulator` — owns one `ParticleField` per weather type, a global wind scalar, and a list of point `sources` |
| Particles | `src/sim/weatherParticles.js` | `Particle` / `ParticleField` physics, density grid, diffusion; `PARTICLE_WEATHER_TYPES` (8 types: RAIN, SNOW, FOG, CLOUDS, MIST, MIASMA, SMOKE, SPORES) |
| Triggers | `src/sim/weatherScenarios.js` | scenario/event/seasonal trigger helpers |
| Cognition | `src/sim/weatherCognition.js` | mood/fulfillment/health/behavior modifiers + LLM context builders |
| Rendering | `src/ui/weatherRenderer.js` + `src/ui/renderer.js:222-235` | per-tile overlay compose |

### 1.2 Lifecycle

- **Init:** `src/main.js:195` creates `new WeatherSimulator(MAP_WIDTH, MAP_HEIGHT, mapSeed)`; `src/main.js:199` spawns one cloud formation (`triggerCloudFormations(state, 0.8, 600)`).
- **Tick:** `src/sim/world.js:50-52` calls `state.weather.tick(state)` every sim tick. `tick()` (`src/sim/weather.js:99-127`) updates wind, applies sources (spawns particles), updates each particle field, expires sources, and emits weather events.
- **Seasonal:** `src/main.js:612-615` calls `updateSeasonalWeather(state)` every 100 ticks. `src/sim/weatherScenarios.js:175-206` computes a 4-season calendar (1200-tick days, 30-day seasons) and rolls a 1% chance for a season-appropriate event (spring rain, autumn fog, winter snow).
- **Wind:** `src/sim/weather.js:153-158` — a single global `windAngle`/`windStrength` driven by `sin`-based pseudo-noise. `windTarget`/`windStrengthTarget` (`weather.js:49-50`) are declared but never used.

### 1.3 Particle physics

`ParticleField.update()` (`src/sim/weatherParticles.js:103-171`): particles get wind force + per-type gravity + a flow-field force (`getFlowForce`, lines 176-219: sin/cos pseudo-Perlin with per-type `driftPattern` — `vertical` for rain, `swirl` for snow). Particles age out (60-120 ticks), wrap at map edges, and deposit into a `Float32Array` density grid that is diffused (2 passes; 4 passes + 0.50 rate for clouds, lines 160-170, 229) and decayed.

### 1.4 Rendering

- `src/ui/renderer.js:222-235`: every visible tile calls `composeWeatherTile(x, y, {char, fg, bg}, tick, weatherSimulator)`.
- `src/ui/weatherRenderer.js:35-87`: queries `sim.getRenderingAt(x,y)`; below intensity 0.3 nothing renders; above it the tile is **fully replaced** — animated glyph cycle (`tick/4 % chars.length`), hardcoded `#FFFFFF` fg, solid `bgColor` (`#444`/`#E1E1E1`). The `blendColors`/`brightenHexColor` helpers (lines 92-136) are dead code — no alpha/intensity blending happens.
- Because the compose runs after the entity glyph is chosen (`renderer.js:212-220` then `:229-234`), **weather visually erases dwarves/creatures underneath it**.
- `getRenderingAt` (`src/sim/weather.js:245-272`) returns the dominant field's glyph set at the tile.

### 1.5 The "clouds-only" gate (most important fact in the file)

`src/sim/weather.js:80-84`:

```js
// Only surface weather (CLOUDS) allowed - no rain, snow, fog, miasma, mist, smoke, spores
if (type.id !== 'clouds') {
  console.warn('[Weather] Only cloud formations are currently enabled on surface');
  return;
}
```

`addSource` rejects **every weather type except clouds**. Consequences:

- All of `weatherScenarios.js` — `triggerRainStorm`, `triggerSnowStorm`, `triggerFogInCavern`, `triggerMiasmaFromDeath`, `triggerSmokeFromFire`, `applyScenarioWeather`, `triggerComplexWeather`, all `WEATHER_SCENARIO_PRESETS` — are no-ops that log a warning.
- `updateSeasonalWeather` runs every 100 ticks but its rain/snow/fog triggers are all blocked. **The only weather that ever exists in the live game is the single cloud formation spawned at world-gen.**
- `emitWeatherEvents` (`weather.js:180-212`) checks `rain`, `miasma`, `fog` densities — which are always 0 — so weather events never fire even before reaching the event-bus problem below.

### 1.6 Dead/broken couplings (the cognition layer exists but is disconnected)

`src/sim/weatherCognition.js` is a fairly rich design (mood map, behavior modifiers, fulfillment, chronic health effects, LLM context builders) but nearly all of it is unreachable:

1. **Undefined event constants.** `EVENTS.WEATHER_CHANGE` (emitted at `weather.js:186,195,204`) and `EVENTS.THOUGHT` (emitted at `weatherCognition.js:119`) **do not exist** in the `EVENTS` enum (`src/events/eventBus.js:11-52`). Both emit `undefined` as the event name; nothing subscribes to either. The weather→thought pipeline is severed at the bus.
2. **Case-mismatch no-op.** `src/ai/dwarfAI.js:104-120` computes `dominantType` from the UPPERCASE list `['RAIN','SNOW',...]` and passes it to `applyWeatherMood` / `updateWeatherFulfillment`, but `WEATHER_MOOD_MAP` (`weatherCognition.js:18-61`) and the fulfillment table (`:255-263`) are keyed lowercase (`rain`, `snow`, ...). Both functions return/no-op silently. **Weather never affects mood or fulfillment.**
3. **Signature mismatch → NaN.** `dwarfAI.js:123` calls `getWeatherHealthEffects(dwarf, dominantType, maxIntensity, state)` but the function is `(dwarf, weather, chronicity)` (`weatherCognition.js:279`) and returns `{sickness, stress, ...}` — the caller reads `.stressIncrease` and `.sicknessProbability` (`dwarfAI.js:125-126`), so `dwarf._weatherStress = 0 + undefined = NaN` on first exposure (the uppercase key makes the result `{}`, which is truthy).
4. **Shelter-seeking never wired.** `getWeatherBehaviorModifier` (`weatherCognition.js:186-223`) defines `seeking_shelter` priority shifts — it is imported (`dwarfAI.js:61`) but never called, `AI_STATE` (`dwarfAI.js:67-82`) has no shelter state, and nothing implements "shelter" as a concept.
5. **Unused imports/exports.** `src/sim/world.js:24` imports all four cognition functions and uses none. `checkWeatherAlerts`, `getWeatherGameplayTips`, `buildWeatherContext`, `getWeatherDecisionGuidance`, `registerWeatherListeners` (an empty stub) have zero call sites.
6. **The one live gameplay coupling** is fishing: `src/sim/fishing.js:66-70` gives a rain catch bonus — but `weather?.dominant === 'RAIN'` compares against uppercase while field ids are lowercase (`'rain'`), and `weather?.rain` is a numeric density so the bonus does work when rain density > 0... which it never is (clouds-only gate).

### 1.7 Biome coupling: none

`src/map/biomes.js` produces elevation/moisture maps (`:17-56`), 5 biomes (`getBiome`, `:64-78`: MOUNTAIN, MARSH, FOREST, DESERT, PLAINS), and `calculateMapClimate` (`:361-388`) with `avgTemperature`. This climate reaches the **LLM** (biome naming in `src/llm/biomeGenerator.js`; `worldContext.biome.climate` in `src/llm/gameAssistant.js:46-55`) but **never reaches the WeatherSimulator** — `weather.js` reads no map, biome, elevation, or temperature data. Weather spawn positions are uniform random, with a "top 20% of map = surface" heuristic (`weatherScenarios.js:120,134`) that is wrong for the surface biome map (the whole map is surface).

### 1.8 LLM coupling: none

- Dwarf thought prompts (`PROMPT_TEMPLATES.THOUGHT_OBSERVATION`, `src/ai/llmClient.js:303-318`) include traits, mood, location, nearby dwarves, memory — **no weather**.
- Game assistant context (`src/llm/gameAssistant.js:45-69`) includes biome, history, visitors, scenario — **no weather**.
- `buildWeatherContext` / `getWeatherDecisionGuidance` (`weatherCognition.js:314-342`) were written for exactly this and are never called.
- The only "weather" in any prompt is flavor text coincidence (`src/llm/prompts/scenarios.js:63`, a fallback chat line at `llmClient.js:553`).

### 1.9 Persistence: none

Weather leaves no trace: no wetness, puddles, mud conversion, or snow accumulation. The tile vocabulary already exists to support it (`TileType.SNOW`, `MUD`, `MARSH`, `WATER_SHALLOW` in `src/map/tiles.js` are used by biome gen at `biomes.js:91-120`).

### 1.10 Hygiene issues

- Debug `console.log` in hot paths: `weather.js:118-123` (every 60 ticks), `weatherRenderer.js:43-46` (per-tile), `main.js:587-593` (per frame), `renderer.js:225-228`.
- `checkPerformance()` (`weather.js:59-62`) always returns true; `enableFullDiffusion` unused.
- `WEATHER_ANIMATIONS`, `generateWeatherArt`, `injectWeatherStyles`, `visualizeWeatherField`, `exportWeatherFieldAsText` (`weatherRenderer.js:207-461`) are unused; the last two call a nonexistent `simulator.getFieldData()`.
- Typo in preset copy: `"obscures vision and disorientsLocally"` (`weatherScenarios.js:275`).

---

## 2. Gap Analysis

### 2.1 Variability
- **No fronts.** Sources are stationary points; particles drift but weather never *arrives from somewhere*, crosses the map, and leaves. A sweeping cold front — the most legible weather narrative — is impossible in the current model.
- **No intensity curves.** Source intensity decays linearly (`weather.js:168`: `1 - age/duration`). No build-up → peak → tail; storms can't "gather."
- **No biome-specific weather.** Deserts can't get sandstorms (no SANDSTORM type, and no biome lookup); tundra/mountain snow isn't biased by `avgTemperature`; marsh fog isn't a thing. The data needed (per-tile elevation/moisture, map-level temperature) already exists in `map.elevationData` (`src/map/map.js:621-625`) and `map.biome`.
- **Seasonal logic is vestigial.** One d100 roll per 100 ticks, no per-season intensity/duration profiles, and all of it gated off anyway (§1.5).

### 2.2 Persistence
- No ground-state memory of weather (puddles, mud, snow depth, frozen water). Weather is purely an overlay; the world is identical after a storm.
- Particle `maxAge` of 60-120 ticks means even visible formations are ephemeral relative to a 1200-tick day.

### 2.3 Coupling
- Entity behavior: mood/fulfillment/health/shelter pipeline fully broken (§1.6 items 1-4). Nothing in `movement.js` or task selection responds to weather.
- LLM: zero weather in any prompt (§1.8), despite ready-made builders.
- Rendering: binary replace-the-tile compositing; no intensity-proportional blending; entities vanish under weather (§1.4).
- Events: weather can't create narrative chains (lightning→fire→smoke exists as `triggerSmokeFromFire` but no lightning, and smoke is gated off).

---

## 3. Emergent Potential — Design Directions

### 3.1 Macro-field weather (fronts that sweep the map)

Replace point-sources as the *primary* driver with two map-scale scalar fields, **humidity** and **temperature**, sampled from the project's existing noise (`src/map/noise.js` — `fbm`, `warped` are already there and seeded):

```
humidity(x, y, t) = fbm((x + windX·t)·s, (y + windY·t)·s)   // domain-scrolled by prevailing wind
temp(x, y, t)     = seasonBase(t) − elevation(x,y)·k + diurnal(t)
```

Per tile, derive the condition: `humidity > h₁ → clouds`, `> h₂ → rain` (or **snow** when `temp < 0`), `humidity high + temp low + flat → fog at dawn`, `DESERT biome + high wind + low humidity → sandstorm`. Because the field scrolls with wind, fronts **sweep across the map for free** — a player watches the rain edge advance tile-by-tile. Keep the particle system as the *visual texture* inside the macro-field mask (spawn particles only where the field says weather exists). Touch points: `WeatherSimulator.tick` (`weather.js:99`), `map.elevationData` (`map.js:621`), `map.biome.avgTemperature`.

### 3.2 Where rot.js fits (owner wants it)

rot.js is **not yet a dependency** (`package.json` has only vite). Honest fit assessment:

| rot.js module | Fit | Use |
|---|---|---|
| `ROT.RNG` (`setSeed`/`getState`/`setState`) | **Strong** | Deterministic, serializable weather streams — replaces the weak `seededNoise` in `weather.js:293-297` and the bare `Math.random()` calls throughout `weatherScenarios.js`. Enables replay/save of weather. |
| `ROT.Map.Cellular` | **Strong** | Generate organic storm-cell / cloud-mass *shapes* (blobby masks) for fronts and storm footprints; far better silhouettes than diffused point sources. Run a few automaton generations on a small grid, scroll the mask across the map with the wind vector. |
| `ROT.Noise.Simplex` | **Weak** | Redundant — `src/map/noise.js` already has seeded simplex + fbm + ridged + domain-warp. Prefer the in-house noise for the macro-field (§3.1) and avoid two noise implementations. |
| `ROT.FOV` (e.g. `PreciseShadowcasting`) | **Moderate** | Cheap "sheltered tile" computation: cast from a sky direction against constructed roofs/overhangs to mark tiles dry/exposed — gives shelter-seeking (§3.4) a real target set. Also fog-of-visibility during heavy fog. |
| `ROT.Scheduler`/`ROT.Engine` | Weak | The sim already has its own tick loop; don't adopt. |

Recommendation: add rot.js for **RNG + Map.Cellular (+ optionally FOV)**; keep `noise.js` for the continuous fields.

### 3.3 Persistence layer (weather leaves scars)

Add two `Float32Array(width·height)` ground-state grids to `WeatherSimulator` (or to `map`): `wetness` and `snowDepth`. Rain raises wetness → above thresholds the renderer tints tiles / swaps `GRASS→MUD`, `DIRT→puddle glyph`; sun/time decays it. Snow accumulates → tiles render as `TileType.SNOW`, melts when `temp > 0` (creating wetness → spring mud season **emerges**). Mud slows movement (`src/sim/movement.js`) and dirties moods. This gives weather memory: "the courtyard is still muddy from yesterday's storm" is exactly the kind of accumulated world fact the owner wants in prompts.

### 3.4 Entity coupling (after fixing §1.6)

- Fix case/signature bugs, define the events, then wire `getWeatherBehaviorModifier` into `findNewTask` (`dwarfAI.js:156` and below) with a new `AI_STATE.SEEKING_SHELTER`; shelter = underground tiles, constructed walls/roofs (FOV-derived dry tiles, §3.2).
- Animals (`src/sim/animals.js`, `src/ai/animalAI.js`): birds ground during storms, fish bite more in rain (fishing bonus finally activates), predators hunt in fog.
- Visitors (`src/sim/visitorSpawner.js`): caravans delay in storms; goblins prefer fog/night — fog becomes *strategically meaningful*.

### 3.5 Weather in the accumulating LLM system prompt (owner's stated goal)

The infrastructure is 80% written; it just isn't connected:

1. **Per-dwarf thought context:** in `src/ai/thoughts.js` observation handlers (~lines 265, 443), add `weather: describeWeather(state.weather.getWeatherAt(dwarf.x, dwarf.y))` to `context`, and render it in `THOUGHT_OBSERVATION` (`llmClient.js:303-318`) — one line each.
2. **Game assistant:** add a `weather` key to `worldContext` (`gameAssistant.js:45-69`) using `describeWeather` + active front/season; `getWeatherGameplayTips` (`weatherScenarios.js:433`) can feed the tips section.
3. **Weather chronicle (the accumulating part):** detect *transitions* in `WeatherSimulator.tick` (clear→rain, rain→clear, first snow of the season, storm peak) and append dated entries to a `state.weatherLog` (mirroring `state.history.events`): *"Day 12, dusk: a cold front swept in from the west; the first snow of winter began."* Feed the last N entries into every LLM call's world context (`gameAssistant.js`, `src/llm/entityChat.js`, `eventNarrator.js`). The world then *remembers* its weather, and each turn's system prompt grows richer — exactly the accumulating-system-prompt pattern the owner wants.
4. **Narrative event hooks:** lightning strike (rare during peak storm intensity) → `triggerSmokeFromFire` → fire spreads → `eventNarrator` narrates the chain. First-snow, heatwave, week-long rain ("everyone is miserable and the food stores are molding") become emergent story beats from the intensity curves + persistence layers.

---

## 4. Prioritized Recommendations

Ranked by impact-per-effort. Items 1-3 are prerequisites for everything else.

| # | Change | Impact | Effort | Files |
|---|---|---|---|---|
| 1 | **Fix the broken wiring**: define `WEATHER_CHANGE` + `THOUGHT` in the `EVENTS` enum; lowercase the type keys in `dwarfAI.js:104-117`; align `getWeatherHealthEffects` call/signature (kills the NaN at `dwarfAI.js:125`); fix `'RAIN'`→`'rain'` in `fishing.js:68` | High | Low | `src/events/eventBus.js`, `src/ai/dwarfAI.js`, `src/sim/weatherCognition.js`, `src/sim/fishing.js` |
| 2 | **Remove the clouds-only gate** (`weather.js:80-84`) — replace with a per-realm allowlist or config flag so seasonal rain/snow/fog actually spawn | High | Low | `src/sim/weather.js` |
| 3 | **Weather into LLM prompts**: `describeWeather` in thought-observation context; `weather` key in assistant `worldContext`; use the existing never-called `buildWeatherContext` | High | Low | `src/ai/thoughts.js`, `src/ai/llmClient.js`, `src/llm/gameAssistant.js` |
| 4 | **Weather chronicle / accumulating prompt**: transition detection → `state.weatherLog` → last-N entries in every LLM context | High | Medium | `src/sim/weather.js`, `src/llm/gameAssistant.js`, `src/llm/entityChat.js`, `src/llm/eventNarrator.js` |
| 5 | **Biome/season-aware weather director**: rewrite `updateSeasonalWeather` to read `map.biome.avgTemperature`/`avgMoisture` + season; add SANDSTORM type for DESERT; bias snow by temperature; per-season intensity/duration profiles + build/peak/decay envelope (replace linear decay at `weather.js:168`) | High | Medium | `src/sim/weatherScenarios.js`, `src/sim/weatherParticles.js`, `src/sim/weather.js` |
| 6 | **Macro-field fronts**: wind-scrolled fbm humidity/temperature fields driving per-tile weather; particles become texture inside the field mask; adopt rot.js `RNG` (determinism) + `Map.Cellular` (storm-cell shapes) here | Very high | High | `src/sim/weather.js`, `src/map/noise.js`, `package.json` (+rot-js) |
| 7 | **Persistence grids**: `wetness`/`snowDepth` arrays; mud/puddle/snow tile rendering; melt→mud-season; mud slows movement | High | Medium | `src/sim/weather.js`, `src/ui/renderer.js`, `src/sim/movement.js`, `src/map/tiles.js` |
| 8 | **Shelter-seeking**: wire `getWeatherBehaviorModifier` into task selection; add `AI_STATE.SEEKING_SHELTER`; underground/roofed tiles count as shelter (optionally rot.js FOV for dry-tile computation) | Medium | Medium | `src/ai/dwarfAI.js`, `src/sim/weatherCognition.js` |
| 9 | **Rendering blend instead of replace**: intensity-proportional fg/bg blending (the unused `blendColors` is already written); never occlude entity glyphs | Medium | Low | `src/ui/weatherRenderer.js`, `src/ui/renderer.js` |
| 10 | **Hygiene**: strip hot-path debug logs (`weather.js:118-123`, `weatherRenderer.js:43-46`, `main.js:587-593`, `renderer.js:225-228`); delete unused imports (`world.js:24`) and dead exports; fix `disorientsLocally` typo | Low | Low | as listed |

### Suggested sequencing
**Phase A (one sitting):** 1 + 2 + 10 — the existing system starts actually running. **Phase B:** 3 + 4 — owner's accumulating-prompt goal lands with minimal new code. **Phase C:** 5 + 9 — visible variety and biome character. **Phase D:** 6 + 7 + 8 — true emergence: fronts sweep in, the ground remembers, dwarves run for cover, and the LLM narrates all of it.
