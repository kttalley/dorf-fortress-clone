# Audit Synthesis — The Path to a Living World

**Date:** 2026-06-10 · Sources: `llm-prompt-transference.md`, `entity-walkers.md`, `weather-systems.md`

## The one-sentence finding

The aliveness this project wants is mostly **already written and simply not plugged in** — the fastest route to emergence is reconnection and bug-fixing, not new systems.

## Cross-cutting findings

1. **Dead machinery built for exactly this goal.** The animal ecosystem (species, predator/prey, territories) never executes — `state.animals` never exists. The event narrator — the one component designed to build a rolling narrative thread — has zero call sites. The weather simulator rejects every weather type except clouds (`weather.js:80-84`), making all rain/snow/fog/seasonal triggers no-ops. `getHistorySummary`, `buildWeatherContext`, shelter-seeking modifiers, A* pathfinding, `goalStack`, `moveCost` — all written, none called.

2. **~10 silent data-loss bugs** sever the couplings that do exist: the `tilegeneratedName` typo (every observation says "somewhere"), wrong biome-climate path, `victory_conditions` key mismatch, `history.summary` never populated, relationships rendered as "Dwarf #3", UPPERCASE/lowercase weather key mismatches (weather never affects mood; fishing bonus dead), a NaN stress accumulator, four signature bugs in animalAI, and a double-movement conflict (dwarves move twice per tick through two different walkability systems).

3. **Context inversion.** The game-assistant panel (low frequency) receives biome+history+scenario+visitors; the ambient calls that create perceived aliveness — thoughts and conversations, firing constantly — receive almost no world info at all. Weather reaches zero prompts. No call uses a real `system` role or threading; every prompt starts with volatile content, guaranteeing zero Ollama prefix-cache reuse.

## Unified roadmap

**Phase 1 — Reconnect (hours, mostly one-liners):** fix all data-loss bugs (LLM P1, WX rec 1, WALK appendix); remove the clouds-only gate (WX 2); unify the double-movement/walkability mess (WALK R1); strip hot-path debug logs.
*The weather-implementation agent currently running was instructed to cover the WX Phase-A items.*

**Phase 2 — The thread (the owner's stated goal):** real system/user roles in `generate()` (LLM P2); new `src/llm/worldContext.js` assembler with layered context — L0 byte-stable world lore → L1 accumulating chronicle (wire the dead narrator + saga-folding compression) → L2 per-entity local context → L3 turn (LLM P3-P4); shared day/season clock (LLM P5, WALK R8 overlap). Token budgets + explicit `num_ctx` + reduced ambient concurrency (P10).

**Phase 3 — Local senses:** weather into L2 via existing `buildWeatherContext` (P6); typed "what's near" scan incl. visitors (P7); behavior-trace ring buffer feeding prompts (WALK R3); shelter-seeking wired into task selection (WALK R5, WX 8).

**Phase 4 — Living world:** wire the animal ecosystem (WALK R2 — highest single payoff); LLM intention layer: thoughts become destinations, arrivals trigger follow-up thoughts (WALK R4); biome/season weather director + sandstorms (WX 5); wind-scrolled macro-field fronts with rot.js cellular storm shapes (WX 6); wetness/snow persistence grids → mud season emerges (WX 7); landmarks + day/night congregation (WALK R8); multi-channel scent (WALK R7); history-aware visitors (LLM P8); scenario→biome→names continuity chain (LLM P9).

## Why this ordering compounds

Phase 1 makes existing systems honest. Phase 2 creates the *shared memory* every later feature writes into: once the chronicle exists, animals hunting (P4), fronts sweeping (WX 6), and intentions fulfilled (WALK R4) all become prompt-visible narrative for free — each LLM turn then genuinely builds on a thread.
