# Audit pass 2 — post-SYNTHESIS health check & dead modules

Date: 2026-06-12 · Branch: `june26-enhancements` @ `fad44c8` · Tree: clean

## Verification of the SYNTHESIS work (all green)

- All 10 implementation test suites pass: 336 asserts total (itineraries 15,
  narrator-parser 8, phase2a 21, phase2b 27, phase3 23, phase4 48, phase5 23,
  scent-channels 17, sprites 154, weather-integration 13). `vite build` clean.
- `tests/test-llm-browser.js` is a browser-only diagnostic (references
  `window`); it cannot run under Node and is not a regression — it actually
  connected to the LLM endpoint before failing on the `window` reference.
- Every system added in Phases 1–5 is confirmed wired into the live loop:
  scent map (init/seed/decay/emit in `world.js`), ground cover
  (`tickGroundCover` in tick, `tintGroundBg` in renderer), itineraries
  (`ensureItinerary` in `visitorAI.js`), intentions (`parseIntent` in
  `thoughts.js`), landmarks (`extractLandmarks` in `main.js`), narrator taps +
  day-end fold (`main.js:350`, `main.js:683`), animal AI in tick, carcasses →
  `state.foodSources` (`world.js:164-177`).
- Original walkers-audit findings resolved: `tilegeneratedName` typo gone;
  movement unified. One leftover: `goalStack: []` is still initialized at
  `entities.js:187` but never read or written anywhere — dead field.

## Finding 1: ~1,100 lines of unwired modules

Whole modules whose exports are never imported anywhere in `src/` or `tests/`:

| Module | Lines | Verdict |
|---|---|---|
| `src/sim/hunting.js` | 263 | **Wireable** — see below |
| `src/sim/fishing.js` | 206 | **Wireable** — see below |
| `src/llm/nameGenerationEvents.js` | 256 | Superseded by `nameGenerator.js` — delete |
| `src/llm/prompts/analysis.js` | 215 | Autopsy/analysis prompts, no caller — delete (or wire deaths → narrator autopsies) |
| `src/sim/jobs.js` | 120 | v0.1 job-queue scaffolding, superseded by `tasks.js` — delete |
| `src/map/mapConfig.js` | 44 | `getInitialMapConfig` unused — delete |

### hunting.js — the biggest remaining "aliveness" gap

This is the same pattern the original audits found with the animal ecosystem:
a complete system written and never plugged in. It has tracking difficulty,
pursuit, skill-modified hit chance, large/small prey modifiers, XP awards, and
loot via `getAnimalLoot`. Critically, it imports **live, current** APIs
(`animals.js`, `movement.js` `executeSmartMovement`, `eventBus`), so it did
not rot during the Phase 1 movement unification.

Now that Phase 4 gave us a real animal ecosystem (herds, fear, carcasses →
food), dwarves are the only species that doesn't participate in the food web:
they forage but never hunt. Wiring `attemptHunt` in as a task (the same way
`SEEK_SHELTER` was added in Phase 3: TASK_TYPE + AI_STATE + work function,
gated on hunger + `canHuntAt`) would close the loop — and hunts already emit
events the Phase 2 narrator taps could pick up.

### fishing.js — small companion wire-up

Same shape, smaller: water adjacency check, skill-modified catch chance, and a
rain bonus that the now-live weather system would feed for free
(`WEATHER_RAIN_BONUS: 1.2`). Water tiles, drives, and the event bus it
imports are all current.

## Finding 2: the chronicle is invisible to the player

The Phase 2b chronicle (`state.chronicle.saga` / `.recent` / `.headline`)
feeds LLM prompts via worldContext L1, but no UI component ever displays it.
The running story of the fortress — the thing the whole layered-context
thread was built to create — exists only inside prompts. A small saga panel
(or a line in the existing stat panel / a hover on the theater-mask sprite at
`sprites.js:529`) would surface it.

## Recommended next phase, in order

1. Delete `jobs.js`, `nameGenerationEvents.js`, `prompts/analysis.js`,
   `mapConfig.js` (or its unused export), and the `goalStack` field — ~635
   lines of scaffolding gone, zero behavior change.
2. Wire hunting as a hunger-driven task (Phase-3 shelter pattern), with
   narrator taps on kills.
3. Wire fishing for water-adjacent dwarves, rain bonus from live weather.
4. Chronicle UI surface.

## Resolution (2026-06-12, same branch)

All four steps implemented. Corrections discovered during the wire-up:

- `nameGenerationEvents.js` was NOT fully dead — `main.js` imported
  `waitForBatchNameGeneration` from it. `nameGenerator.js` ships an
  equivalent export, so `main.js` was switched over and the module deleted.
- `fishing.js` had the same `getTile`/`inBounds` arg-order bug Phase 4
  fixed in perception, and checked for a nonexistent `'water'` tile type
  (real ids: `water_shallow`/`water_deep`/`river`).
- `hunting.js` moved the dwarf itself with a stale `executeSmartMovement`
  signature — movement extracted to the `workHunt` caller (single mover).
- Both modules gated on skill levels no dwarf ever spawns with;
  personality now substitutes for the untrained (bravery → hunting,
  patience → fishing) and floors the seeded skill's proficiency, which
  otherwise starts BELOW the untrained value and would re-lock the gate.

Hunts chase real prey and kills feed the Phase-4 carcass pipeline; catches
land as food at the dwarf's feet; both emit narrator-tapped events. The
chronicle (headline + saga + recent) renders atop the event-log widget.
Coverage: `tests/test-hunting-fishing.js` (32 asserts); all suites green.
