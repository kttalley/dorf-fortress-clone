/**
 * World Context Assembler — layered LLM context (audit llm-prompt-transference §3)
 *
 * Layers (different change rates):
 *   L0 WORLD LORE   — built once at worldgen, byte-stable cached string:
 *                     scenario + biome + history summary + race relations.
 *                     ONE canonical string shared by every call type so the
 *                     Ollama prefix cache stays warm across thoughts, speech,
 *                     entity chat, the assistant, and name generation.
 *   L1 CHRONICLE    — rolling day-by-day saga: season/day/weather headline +
 *                     folded saga + last ~8 narrated day-events. Lives on
 *                     state.chronicle (persists with saves) and changes ONLY
 *                     at day boundaries (updateChronicle), so the system
 *                     prefix stays byte-stable — and prefix-cache friendly —
 *                     within a day.
 *   L2 LOCAL        — per-entity detail at call time (stub — Phase 3).
 *   L3 TURN         — the event/question/dialogue turn itself.
 *
 * L0+L1 render into the system message, L2+L3 into the user message.
 * Budget trim order: L2 first, then L1 — NEVER L0.
 *
 * Reads (buildWorldLore, buildChronicle, assembleContext) are built entirely
 * from local data — no LLM calls, never throw. The one exception is
 * updateChronicle's saga folding, which makes a single summarization call at
 * day boundaries and degrades to keeping the raw lines when the LLM is offline.
 */

import { getHistorySummary } from '../sim/history.js';
import { estimateTokens } from '../utils/gameContextCompressor.js';
import { getCalendar, getSeasonStage } from '../sim/clock.js';
import { queueGeneration } from '../ai/llmClient.js';
import { buildWeatherContext } from '../sim/weatherCognition.js';
import { summarizeBehavior, compassDirection } from '../sim/behaviorTrace.js';
import { getStructures } from '../sim/construction.js';
import { getScent, SCENT_CHANNEL } from '../sim/movement.js';

// Per-layer token budgets (audit §3.4)
const L0_TOKEN_BUDGET = 350;
const DEFAULT_CONTEXT_BUDGET = 900;

// L0: build once, cache the string; invalidate only on world regen
let loreCache = null;

/**
 * Describe a 0..1 climate scalar with a stable word (deterministic)
 * @param {number|undefined} value
 * @param {[string, string, string]} labels - [low, mid, high]
 * @returns {string|null}
 */
function describeScalar(value, labels) {
  if (typeof value !== 'number' || Number.isNaN(value)) return null;
  if (value < 0.35) return labels[0];
  if (value < 0.65) return labels[1];
  return labels[2];
}

/**
 * Drop trailing lines from a block until it fits a token budget.
 * Deterministic — same input always yields the same output.
 * @param {string} text
 * @param {number} maxTokens
 * @returns {string}
 */
function trimToTokenBudget(text, maxTokens) {
  let trimmed = text;
  while (trimmed && estimateTokens(trimmed) > maxTokens) {
    const cut = trimmed.lastIndexOf('\n');
    if (cut === -1) {
      // Single overlong line: hard-truncate at the char equivalent
      trimmed = trimmed.slice(0, maxTokens * 4).trimEnd();
      break;
    }
    trimmed = trimmed.slice(0, cut).trimEnd();
  }
  return trimmed;
}

/**
 * Build the L0 world-lore string (byte-stable, cached).
 * Sources: scenario title/description/victory conditions, biome
 * name/description/climate/resources (state.map.biome), and
 * getHistorySummary(state.history) which includes race relations.
 *
 * Cached after the first build; call invalidateWorldLore() on world regen.
 * Degrades gracefully: missing pieces are skipped, nothing throws.
 *
 * @param {object} state - World state (map.biome, history)
 * @param {object} [scenario] - Current scenario (title, description, victory_conditions)
 * @returns {string} The canonical L0 lore string ('' if nothing is known yet)
 */
export function buildWorldLore(state, scenario) {
  if (loreCache !== null) return loreCache;

  const parts = [];

  try {
    // Scenario premise
    if (scenario) {
      const lines = [];
      if (scenario.title) lines.push(`Scenario: ${scenario.title}`);
      if (scenario.description) lines.push(scenario.description);
      const victory = scenario.victory_conditions || scenario.victoryConditions;
      if (Array.isArray(victory) && victory.length > 0) {
        lines.push(`Goals: ${victory.join('; ')}`);
      }
      if (lines.length > 0) parts.push(lines.join('\n'));
    }

    // Biome identity (state.map.biome — src/map/map.js addBiomeToMap)
    const biome = state?.map?.biome;
    if (biome) {
      const lines = [];
      if (biome.name) lines.push(`The land: ${biome.name}`);
      if (biome.description) lines.push(biome.description);
      const climate = biome.climate || {};
      const climateWords = [
        describeScalar(climate.avgTemperature, ['cold', 'temperate', 'hot']),
        describeScalar(climate.avgMoisture, ['arid', 'moderately moist', 'humid']),
        describeScalar(climate.avgElevation, ['lowland', 'mid-elevation', 'highland']),
      ].filter(Boolean);
      if (climateWords.length > 0) lines.push(`Climate: ${climateWords.join(', ')}.`);
      if (Array.isArray(biome.resources) && biome.resources.length > 0) {
        lines.push(`Native resources: ${biome.resources.slice(0, 5).join(', ')}.`);
      }
      if (lines.length > 0) parts.push(lines.join('\n'));
    }

    // World history + race relations (first-ever getHistorySummary call site)
    if (state?.history) {
      const summary = getHistorySummary(state.history);
      if (summary) parts.push(summary);
    }
  } catch (error) {
    console.warn('[WorldContext] Lore build failed (continuing with partial lore):', error.message);
  }

  let lore = parts.join('\n\n').trim();

  // Enforce the L0 budget (audit P10): trim trailing lines, never exceed
  lore = trimToTokenBudget(lore, L0_TOKEN_BUDGET);

  loreCache = lore;
  return loreCache;
}

/**
 * Get the cached L0 lore string without rebuilding.
 * @returns {string} Cached lore, or '' if the world hasn't been built yet
 */
export function getWorldLore() {
  return loreCache !== null ? loreCache : '';
}

/**
 * Invalidate the cached L0 lore. Call ONLY on world regeneration —
 * the string must stay byte-identical between regens for prefix caching.
 */
export function invalidateWorldLore() {
  loreCache = null;
}

// L1 chronicle tuning (audit P4 / §3.3)
const RECENT_CAP = 8;          // Max narrated lines kept verbatim
const FOLD_COUNT = 4;          // Oldest lines folded into the saga on overflow
const SAGA_TOKEN_BUDGET = 250; // Saga never outgrows the L1 budget

/**
 * Ensure the chronicle slot exists on state (mirrors store.createChronicle —
 * inline so loaded saves and test states work too).
 * @param {object} state
 * @returns {{saga: string, recent: string[], headline: string, lastDay: number}}
 */
function ensureChronicle(state) {
  if (!state.chronicle) {
    state.chronicle = { saga: '', recent: [], headline: '', lastDay: 0 };
  }
  return state.chronicle;
}

// Lowercase weather field ids (weather.js getWeatherAt) → headline phrases
const WEATHER_HEADLINES = {
  rain: 'rain falling',
  snow: 'snow falling',
  fog: 'fog on the land',
  clouds: 'clouds overhead',
  mist: 'mist drifting',
  miasma: 'miasma in the air',
  smoke: 'smoke on the wind',
  spores: 'spores adrift',
  sandstorm: 'a sandstorm raging',
};

/**
 * One-line season/day/weather headline, e.g.
 * "Day 14, mid-autumn, fog on the land."
 * Weather is sampled at map center at build time — call only at day
 * boundaries so the headline (and thus L1) stays byte-stable within a day.
 * @param {object} state
 * @param {object} clock - state.clock-shaped calendar
 * @returns {string}
 */
function buildHeadline(state, clock) {
  let headline = `Day ${clock.day}, ${getSeasonStage(clock.dayOfSeason)}-${clock.season}`;

  try {
    const weather = state?.weather?.getWeatherAt?.(
      (state.map?.width || 0) / 2 | 0,
      (state.map?.height || 0) / 2 | 0
    );
    if (weather && weather.type && weather.dominant > 0.25) {
      headline += `, ${WEATHER_HEADLINES[weather.type] || `${weather.type} about`}`;
    } else if (weather) {
      headline += ', clear skies';
    }
  } catch {
    // Weather is decorative — headline works without it
  }

  return `${headline}.`;
}

/**
 * Fold chronicle lines into 2 sentences of saga prose via ONE LLM call.
 * @param {string[]} lines
 * @returns {Promise<string|null>} Summary, or null when the LLM is offline
 */
async function summarizeForSaga(lines) {
  try {
    const result = await queueGeneration(
      `Compress these chronicle lines into 2 sentences. Keep names.\n${lines.join('\n')}`,
      {
        system: 'You compress fortress chronicle entries into terse saga prose. Reply with exactly 2 sentences and nothing else.',
        maxTokens: 90,
        temperature: 0.6,
      }
    );
    const summary = typeof result === 'string' ? result.trim() : '';
    return summary || null;
  } catch (error) {
    console.warn('[WorldContext] Saga folding failed (keeping raw lines):', error.message);
    return null;
  }
}

/**
 * Trim the saga from the FRONT (oldest sentences first) to a token budget.
 * @param {string} saga
 * @param {number} maxTokens
 * @returns {string}
 */
function trimSagaToBudget(saga, maxTokens) {
  let trimmed = saga;
  while (trimmed && estimateTokens(trimmed) > maxTokens) {
    const cut = trimmed.indexOf('. ');
    if (cut === -1) {
      trimmed = trimmed.slice(trimmed.length - maxTokens * 4).trimStart();
      break;
    }
    trimmed = trimmed.slice(cut + 2);
  }
  return trimmed;
}

/**
 * Refresh the L1 chronicle at a day boundary (audit P4 / §3.3):
 *   1. Append newly narrated day-events (state.narratedLog, written by
 *      eventNarrator.processEndOfDay) to chronicle.recent.
 *   2. On overflow past ~8 lines, fold the oldest 4 into chronicle.saga via
 *      one LLM summarization call; offline, the raw lines join the saga
 *      verbatim (graceful degradation — nothing throws).
 *   3. Rebuild the season/day/weather headline.
 *
 * Everything lives on state.chronicle so saves carry the saga forward.
 * Call ONLY at day boundaries — L1 must stay byte-stable within a day.
 *
 * @param {object} state - World state (narratedLog, clock, weather)
 * @returns {Promise<void>}
 */
export async function updateChronicle(state) {
  if (!state) return;

  try {
    const chronicle = ensureChronicle(state);
    const clock = state.clock || getCalendar(state.tick || 0);

    // 1. Ingest narrated day-events not yet woven into the chronicle
    const fresh = (state.narratedLog || []).filter(e => (e.day || 0) > (chronicle.lastDay || 0));
    for (const entry of fresh) {
      const text = entry.narrated || entry.raw;
      if (text) chronicle.recent.push(`Day ${entry.day}: ${text}`);
      chronicle.lastDay = Math.max(chronicle.lastDay, entry.day || 0);
    }

    // 2. Fold overflow into the saga (one summarization call per fold)
    while (chronicle.recent.length > RECENT_CAP) {
      const folded = chronicle.recent.splice(0, FOLD_COUNT);
      const summary = await summarizeForSaga(folded);
      const addition = summary || folded.join(' ');
      chronicle.saga = trimSagaToBudget(
        chronicle.saga ? `${chronicle.saga} ${addition}` : addition,
        SAGA_TOKEN_BUDGET
      );
    }

    // 3. New day's headline (the only intra-day-volatile data, snapshotted)
    chronicle.headline = buildHeadline(state, clock);
  } catch (error) {
    console.warn('[WorldContext] Chronicle update failed (keeping previous chronicle):', error.message);
  }
}

/**
 * Render the L1 chronicle: season/day/weather headline + saga + recent
 * narrated day-events. Reads only state.chronicle/state.clock — no LLM
 * calls, never throws. Byte-stable between day boundaries.
 * @param {object} state
 * @returns {string} '' when nothing is known yet
 */
export function buildChronicle(state) {
  if (!state) return '';

  try {
    const chronicle = state.chronicle;
    const clock = state.clock || getCalendar(state.tick || 0);
    const lines = [];

    // Headline: snapshotted at the day boundary; before the first boundary,
    // derive from day/season only (also stable within a day)
    lines.push(
      chronicle?.headline ||
      `Day ${clock.day}, ${getSeasonStage(clock.dayOfSeason)}-${clock.season}.`
    );

    if (chronicle?.saga) {
      lines.push(`The saga so far: ${chronicle.saga}`);
    }
    if (chronicle?.recent?.length > 0) {
      lines.push(`Recent days:\n${chronicle.recent.map(l => `- ${l}`).join('\n')}`);
    }

    return lines.join('\n');
  } catch (error) {
    console.warn('[WorldContext] Chronicle render failed:', error.message);
    return '';
  }
}

// Tile type -> evocative place phrase (shared by L2 and the thought system)
const TILE_DESCRIPTIONS = {
  'grass': 'a grassy meadow',
  'tall_grass': 'tall grass',
  'forest_floor': 'the forest floor',
  'tree_conifer': 'among pine trees',
  'tree_deciduous': 'under leafy trees',
  'cave_floor': 'a dim cavern',
  'cave_wall': 'near cave walls',
  'river_bank': 'by the river',
  'river': 'at the water\'s edge',
  'mountain_slope': 'a rocky slope',
  'mountain_peak': 'high ground',
  'marsh': 'marshy ground',
  'sand': 'sandy terrain',
  'mushroom': 'a mushroom patch',
  'moss': 'mossy stone',
  'crystal': 'near glowing crystals',
  'berry_bush': 'near berry bushes',
};

/**
 * Human phrase for the tile at (x, y) ("a grassy meadow").
 * @param {number} x
 * @param {number} y
 * @param {object} state - World state with map
 * @returns {string}
 */
export function getTileDescription(x, y, state) {
  const tile = state?.map?.tiles?.[y * state.map.width + x];
  if (!tile?.type) return 'an unknown area';
  return TILE_DESCRIPTIONS[tile.type] || 'an open area';
}

// L2 tuning
const NEARBY_RADIUS = 8;       // Perception-ish radius for the local scan
const MAX_NEARBY_MENTIONS = 6; // Cap the "Nearby:" list
const MAX_REMEMBERED = 2;      // Remembered locations worth mentioning

/**
 * Manhattan distance (avoids importing entities.js — keeps L2 dependency-light)
 */
const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * L2 local context (audit P6, P7, WALK R3): what THIS entity senses right
 * now — tile underfoot, weather overhead, a typed nearby scan (dwarves,
 * visitors, food, structures), remembered places, and the behavior trace.
 * Volatile per call, so it renders into the USER message (assembleContext),
 * never the cached system prefix. Built from local data only — never throws.
 *
 * @param {object} entity - Walker with x/y (dwarf or visitor)
 * @param {object} state - World state
 * @returns {string} ~3-line local block, or '' when nothing is known
 */
export function buildLocalContext(entity, state) {
  if (!entity || typeof entity.x !== 'number' || !state) return '';

  try {
    const lines = [];

    // Tile underfoot + time of day (audit WALK R8: temporal texture)
    const phase = state.clock?.phase;
    const phaseNote = phase === 'dawn' ? ' Dawn is breaking.'
      : phase === 'dusk' ? ' Dusk is settling; the camp drifts together.'
      : phase === 'night' ? ' It is night.'
      : '';
    lines.push(`You stand in ${getTileDescription(entity.x, entity.y, state)}.${phaseNote}`);

    // Weather overhead (P6 — reuses the long-dead buildWeatherContext)
    const weather = state.weather?.getWeatherAt?.(entity.x, entity.y);
    const weatherLine = buildWeatherContext(entity, weather).trim();
    if (weatherLine) lines.push(weatherLine);

    // Typed nearby scan (P7): dwarves, visitors (a dwarf should NOTICE a
    // goblin), food, completed structures
    const seen = [];
    for (const other of state.dwarves || []) {
      if (other.id !== entity.id && manhattan(entity, other) <= NEARBY_RADIUS) {
        seen.push(`${other.generatedName || other.name} (${(other.state || 'idle').replace(/_/g, ' ')})`);
      }
    }
    for (const visitor of state.visitors || []) {
      if (visitor.state !== 'dead' && visitor.id !== entity.id && manhattan(entity, visitor) <= NEARBY_RADIUS) {
        seen.push(`${visitor.generatedName || visitor.name || 'a stranger'} the ${visitor.race || visitor.type || 'visitor'}`);
      }
    }
    // Wildlife (audit WALK R2): a dwarf should notice the wolf before it matters
    const beasts = {};
    for (const animal of state.animals || []) {
      if (animal.hp > 0 && manhattan(entity, animal) <= NEARBY_RADIUS) {
        beasts[animal.subtype] = (beasts[animal.subtype] || 0) + 1;
      }
    }
    for (const [subtype, count] of Object.entries(beasts)) {
      const dangerous = subtype === 'wolf' || subtype === 'bear' || subtype === 'boar';
      seen.push(count === 1
        ? `a ${subtype}${dangerous ? ' prowling close by' : ''}`
        : `${count} ${subtype}s${dangerous ? ' prowling close by' : ''}`);
    }
    const foodNearby = (state.foodSources || [])
      .filter(f => f.amount > 0 && manhattan(entity, f) <= NEARBY_RADIUS).length;
    if (foodNearby > 0) {
      seen.push(foodNearby === 1 ? 'a food source' : `${foodNearby} food sources`);
    }
    for (const s of getStructures()) {
      if (s.complete && manhattan(entity, s) <= NEARBY_RADIUS) {
        seen.push(`the ${s.name || 'structure'}`);
      }
    }
    // Named landmarks (audit WALK R8): shared nouns so conversations across
    // turns can reference the same places
    for (const landmark of state.landmarks || []) {
      if (manhattan(entity, landmark) <= NEARBY_RADIUS) {
        seen.push(landmark.name);
      }
    }
    lines.push(seen.length > 0 ? `Nearby: ${seen.slice(0, MAX_NEARBY_MENTIONS).join(', ')}.` : 'No one else is nearby.');

    // Scent facts (audit WALK R7): the danger field doubles as a free
    // narrative sensor — combat and kills taint a spot for a long while
    const danger = getScent(entity.x, entity.y, SCENT_CHANNEL.DANGER);
    if (danger > 1.5) {
      lines.push('There are signs of recent violence here; the wildlife has gone quiet.');
    } else if (danger > 0.4) {
      lines.push('Something violent happened near here not long ago — a faint unease lingers.');
    }

    // Remembered places (P7 — reuses perception.js memory.locations)
    const remembered = Object.values(entity.memory?.locations || {})
      .filter(loc => manhattan(entity, loc) > 2) // here-and-now is covered above
      .sort((a, b) => (b.lastSeen || 0) - (a.lastSeen || 0))
      .slice(0, MAX_REMEMBERED)
      .map(loc => `${loc.type} to the ${compassDirection(loc.x - entity.x, loc.y - entity.y)}`);
    if (remembered.length > 0) {
      lines.push(`You remember ${remembered.join(' and ')}.`);
    }

    // Behavior trace (WALK R3): what they have actually been doing
    const trace = summarizeBehavior(entity);
    if (trace) lines.push(`You have been ${trace}.`);

    return lines.join('\n');
  } catch (error) {
    console.warn('[WorldContext] Local context build failed:', error.message);
    return '';
  }
}

/**
 * Assemble layered context for one LLM call.
 * Returns { system, user }: system = L0 (+L1 when available), user = L2+L3.
 *
 * Budget enforcement trims L2 first, then L1 — L0 is never trimmed (it is
 * the byte-stable cached prefix; losing it would be the worst possible loss).
 *
 * @param {object} params
 * @param {object} [params.entity] - Entity the call concerns (for L2)
 * @param {object} params.state - World state
 * @param {object} [params.scenario] - Current scenario
 * @param {string} [params.turn] - L3 turn content (event/question/dialogue)
 * @param {number} [params.budget] - Total prompt token budget
 * @returns {{system: string, user: string}}
 */
export function assembleContext({ entity, state, scenario, turn = '', budget = DEFAULT_CONTEXT_BUDGET } = {}) {
  const l0 = buildWorldLore(state, scenario);
  let l1 = buildChronicle(state);
  let l2 = buildLocalContext(entity, state);
  const l3 = turn || '';

  const totalTokens = () =>
    estimateTokens([l0, l1, l2, l3].filter(Boolean).join('\n\n'));

  // Trim order: L2 → L1, never L0/L3
  if (totalTokens() > budget && l2) {
    const reserved = estimateTokens([l0, l1, l3].filter(Boolean).join('\n\n'));
    l2 = trimToTokenBudget(l2, Math.max(0, budget - reserved));
  }
  if (totalTokens() > budget && l1) {
    const reserved = estimateTokens([l0, l2, l3].filter(Boolean).join('\n\n'));
    l1 = trimToTokenBudget(l1, Math.max(0, budget - reserved));
  }

  return {
    system: [l0, l1].filter(Boolean).join('\n\n'),
    user: [l2, l3].filter(Boolean).join('\n\n'),
  };
}
