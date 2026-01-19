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

// Configuration
const MAX_EVENTS_PER_BATCH = 10;
const TICKS_PER_DAY = 100; // Configurable: when to trigger day-end narration

// Narration state
let pendingEvents = [];
let lastNarrationDay = 0;

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
  const currentDay = Math.floor(currentTick / TICKS_PER_DAY);
  return currentDay > lastNarrationDay && pendingEvents.length > 0;
}

/**
 * Get current simulation day from tick
 * @param {number} tick
 * @returns {number}
 */
export function getDay(tick) {
  return Math.floor(tick / TICKS_PER_DAY) + 1;
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

  const fullPrompt = `${SYSTEM_EVENT_NARRATOR}\n\n${userPrompt}`;

  // Call LLM
  const response = await queueGeneration(fullPrompt, {
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
  if (pendingEvents.length === 0) {
    return;
  }

  const currentDay = getDay(worldState.tick);

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
}
