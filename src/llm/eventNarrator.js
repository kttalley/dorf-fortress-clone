/**
 * Event Narrator
 * Transforms raw event log entries into dramatic prose at day-end
 *
 * Called asynchronously outside the tick loop (CLAUDE.md constraint)
 * Batches events, calls LLM, stores narrated text alongside raw events
 */

import { queueGeneration } from '../ai/llmClient.js';
import {
  SYSTEM_EVENT_NARRATOR,
  formatNarratorPrompt,
  parseNarratorResponse,
  enrichEventForPrompt,
} from './prompts/narrative.js';
import { narrateEventLocal } from './fallbacks.js';
import { getCalendar } from '../sim/clock.js';
import { on, EVENTS } from '../events/eventBus.js';

// Configuration
const MAX_EVENTS_PER_BATCH = 10;

// Narration state
let pendingEvents = [];
let lastNarrationDay = 0;

// Day-scoped dedupe keys (combat pairs, weather types) so spammy per-tick
// events queue at most once per day. Cleared at each day-end narration.
const seenThisDay = new Set();

/**
 * Queue an event for narration at day-end
 * Call this from the event bus or wherever events are logged
 * @param {object} event - { tick, message, type? }
 */
export function queueEventForNarration(event) {
  pendingEvents.push({
    tick: event.tick,
    raw: event.message || event.raw,
    type: event.type || null,
    narrated: null, // Filled later
  });
}

/**
 * Check if it's time to narrate (day boundary)
 * @param {number} currentTick
 * @returns {boolean}
 */
export function shouldNarrate(currentTick) {
  return getDay(currentTick) > lastNarrationDay && pendingEvents.length > 0;
}

/**
 * Get current simulation day from tick (shared clock — src/sim/clock.js)
 * @param {number} tick
 * @returns {number}
 */
export function getDay(tick) {
  return getCalendar(tick).day;
}

/**
 * Narrate accumulated day events
 * Call this at day boundary (outside tick loop!)
 *
 * @param {Array} eventList - Array of { tick, raw, type? } events
 * @param {object} worldState - Current world state (for context)
 * @returns {Promise<Array>} Array of { raw, narrated, tick } objects
 */
export async function narrateDayEvents(eventList, worldState = {}) {
  if (!eventList || eventList.length === 0) {
    return [];
  }

  const day = worldState.tick ? getDay(worldState.tick) : 1;

  // Select key events (limit to MAX_EVENTS_PER_BATCH)
  const keyEvents = selectKeyEvents(eventList, MAX_EVENTS_PER_BATCH);

  // Enrich events with type hints
  const enrichedEvents = keyEvents.map(e => ({
    ...e,
    enriched: enrichEventForPrompt(e),
  }));

  // Build prompt
  const userPrompt = formatNarratorPrompt(
    enrichedEvents.map(e => ({ raw: e.enriched })),
    day
  );

  // Call LLM — system instructions go out as a real system role (ambient call)
  const response = await queueGeneration(userPrompt, {
    system: SYSTEM_EVENT_NARRATOR,
    maxTokens: 400,
    temperature: 0.8,
    stop: ['\n\n\n'],
  });

  // Parse response
  const narrations = parseNarratorResponse(response, keyEvents.length);

  // Merge narrations with events
  const results = keyEvents.map((event, index) => ({
    tick: event.tick,
    raw: event.raw,
    narrated: narrations?.[index] || narrateEventLocal(event),
    wasLLM: !!narrations?.[index],
  }));

  return results;
}

/**
 * Process pending events at day-end
 * Stores results back into world state
 *
 * @param {object} worldState - World state with eventLog
 * @returns {Promise<void>}
 */
export async function processEndOfDay(worldState) {
  // New day: reset the once-per-day dedupe window for combat/weather taps
  seenThisDay.clear();

  if (pendingEvents.length === 0) {
    return;
  }

  // Day boundary detection prefers the shared clock on state (audit P5)
  const currentDay = worldState.clock?.day ?? getDay(worldState.tick);

  // Don't re-narrate same day
  if (currentDay <= lastNarrationDay) {
    return;
  }

  // Narrate events
  const narrated = await narrateDayEvents(pendingEvents, worldState);

  // Store in world state (create narratedLog if needed)
  if (!worldState.narratedLog) {
    worldState.narratedLog = [];
  }

  // Merge narrated events
  for (const event of narrated) {
    // Find matching event in main log and augment it
    const existing = worldState.log?.find(
      e => e.tick === event.tick && e.message === event.raw
    );

    if (existing) {
      existing.narrated = event.narrated;
      existing.wasLLM = event.wasLLM;
    }

    // Also store in dedicated narrated log
    worldState.narratedLog.push({
      day: currentDay,
      ...event,
    });
  }

  // Prune narrated log (keep last 100)
  if (worldState.narratedLog.length > 100) {
    worldState.narratedLog = worldState.narratedLog.slice(-100);
  }

  // Clear pending and update marker
  pendingEvents = [];
  lastNarrationDay = currentDay;
}

/**
 * Select key events from a list (prioritize interesting events)
 * @param {Array} events
 * @param {number} maxCount
 * @returns {Array}
 */
function selectKeyEvents(events, maxCount) {
  if (events.length <= maxCount) {
    return events;
  }

  // Priority keywords for interesting events
  const priorityKeywords = [
    'died', 'death', 'starv', 'panic',
    'found', 'discover',
    'said', 'spoke', 'met',
    'built', 'craft',
  ];

  // Score events by interest
  const scored = events.map(event => {
    const raw = (event.raw || event.message || '').toLowerCase();
    let score = 0;

    for (const keyword of priorityKeywords) {
      if (raw.includes(keyword)) {
        score += 10;
      }
    }

    // Recency bonus
    score += event.tick / 1000;

    return { event, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // Take top N
  return scored.slice(0, maxCount).map(s => s.event);
}

/**
 * Force narration of current pending events (for testing/manual trigger)
 * @param {object} worldState
 * @returns {Promise<Array>}
 */
export async function forceNarration(worldState) {
  const events = [...pendingEvents];
  pendingEvents = [];
  return narrateDayEvents(events, worldState);
}

/**
 * Get pending event count
 * @returns {number}
 */
export function getPendingCount() {
  return pendingEvents.length;
}

/**
 * Clear pending events (for reset/testing)
 */
export function clearPending() {
  pendingEvents = [];
  lastNarrationDay = 0;
  seenThisDay.clear();
}

// ============================================================
// NOTABLE-EVENT TAPS (audit P4)
// ============================================================

/**
 * Display name for any entity (dwarf or visitor)
 * @param {object} entity
 * @returns {string}
 */
function entityName(entity) {
  if (!entity) return 'someone';
  return entity.generatedName || entity.name || `a ${entity.race || entity.type || 'stranger'}`;
}

/**
 * Queue an event once per day for a given dedupe key (combat pairs,
 * weather types — events that fire every tick must not flood the batch).
 */
function queueOncePerDay(key, tick, message, type) {
  if (seenThisDay.has(key)) return;
  seenThisDay.add(key);
  queueEventForNarration({ tick, message, type });
}

let tapsInitialized = false;

/**
 * Subscribe the narrator to NOTABLE event-bus events — deaths, arrivals,
 * fights, construction, weather — feeding queueEventForNarration without
 * spamming every log line. Call once at startup; safe to call again (no-op).
 *
 * @param {object} state - World state (source of tick for queued events)
 */
export function initNarratorEventTaps(state) {
  if (tapsInitialized) return;
  tapsInitialized = true;

  const tick = () => state?.tick || 0;

  // Deaths
  on(EVENTS.DWARF_DEATH, ({ dwarf, killer, cause }) => {
    const message = killer
      ? `${entityName(dwarf)} was slain by ${entityName(killer)}.`
      : `${entityName(dwarf)} died${cause ? ` (${cause})` : ''}.`;
    queueEventForNarration({ tick: tick(), message, type: 'death' });
  });

  on(EVENTS.VISITOR_DEATH, ({ visitor, killer }) => {
    const message = killer
      ? `${entityName(visitor)} the ${visitor?.race || 'visitor'} was slain by ${entityName(killer)}.`
      : `${entityName(visitor)} the ${visitor?.race || 'visitor'} perished.`;
    queueEventForNarration({ tick: tick(), message, type: 'death' });
  });

  // Arrivals
  on(EVENTS.VISITOR_ARRIVED, ({ visitor, race, count, edge }) => {
    const group = count > 1 ? `A band of ${count} ${race}s` : `A lone ${race}`;
    const from = edge ? ` from the ${edge}` : '';
    queueEventForNarration({
      tick: tick(),
      message: `${group} led by ${entityName(visitor)} arrived${from}.`,
      type: 'arrival',
    });
  });

  // Fights (COMBAT_HIT fires per attack — record each pairing once per day)
  on(EVENTS.COMBAT_HIT, ({ attacker, defender }) => {
    const key = `fight:${attacker?.id}:${defender?.id}`;
    queueOncePerDay(key, tick(), `${entityName(attacker)} attacked ${entityName(defender)}.`, 'fight');
  });

  // Construction
  on(EVENTS.CONSTRUCTION_COMPLETE, ({ structure, builtBy }) => {
    const builder = builtBy ? `, built by ${builtBy}` : '';
    queueEventForNarration({
      tick: tick(),
      message: `The ${structure?.name || 'structure'} was completed${builder}.`,
      type: 'construction',
    });
  });

  // Wildlife (audit WALK R2): predator kills once per species pairing per
  // day; animal attacks on dwarves are always notable
  on(EVENTS.ANIMAL_KILLED, ({ predator, prey }) => {
    const key = `kill:${predator?.subtype}:${prey?.subtype || prey?.type}`;
    const preyName = prey?.type === 'dwarf'
      ? entityName(prey)
      : `a ${prey?.subtype || 'creature'}`;
    queueOncePerDay(key, tick(), `A ${predator?.subtype || 'predator'} brought down ${preyName}.`, 'wildlife');
  });

  on(EVENTS.ANIMAL_ATTACKED, ({ animal, target }) => {
    if (target?.type !== 'dwarf') return;
    const key = `maul:${animal?.subtype}:${target?.id}`;
    queueOncePerDay(key, tick(), `${entityName(target)} was attacked by a ${animal?.subtype || 'beast'}!`, 'wildlife');
  });

  // Weather (emitted per dwarf per tick when notable — once per type per day)
  on(EVENTS.WEATHER_CHANGE, ({ type, intensity }) => {
    if (!type) return;
    const strength = intensity > 0.7 ? 'Heavy' : 'Drifting';
    queueOncePerDay(`weather:${type}`, tick(), `${strength} ${type} swept over the land.`, 'weather');
  });
}
