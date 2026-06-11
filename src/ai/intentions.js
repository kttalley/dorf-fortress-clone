/**
 * Intention layer — LLM thoughts become destinations (audit WALK R4 / §3.2)
 *
 * parseIntent runs a deterministic keyword scan over a generated thought (NO
 * extra LLM call) and resolves a concrete map destination from what the dwarf
 * actually knows: named landmarks, remembered locations (perception.js
 * memory.locations), and dwarves they can name. dwarfAI then scores the
 * intention as a task candidate; arriving emits INTENTION_FULFILLED, which
 * triggers a follow-up thought — the loop the audit calls "the keystone that
 * makes the LLM loop bidirectional".
 */

import { findLandmarkInText } from '../sim/landmarks.js';

// How long an intention stays actionable (~3/4 of an in-game day)
const INTENTION_TTL_TICKS = 900;

// Minimum distance for a destination to be worth walking to
const MIN_DISTANCE = 3;

// A thought must express wanting/going for us to read direction into it
const DESIRE_PATTERN = /\b(want|wish|need|should|must|long|yearn|crave|go|going|head|visit|find|seek|see|check|explore|wander|look for|miss)\b/i;

// Keyword → remembered-location type (perception.js memory.locations)
const MEMORY_TARGETS = [
  { pattern: /\b(water|river|stream|brook|drink|fish|fishing|shore)\b/i, locType: 'water', label: 'the water' },
  { pattern: /\b(food|berr(?:y|ies)|forage|harvest|mushrooms?|eat)\b/i, locType: 'food', label: 'a food spot' },
  { pattern: /\b(trees?|forest|woods?|grove|green)\b/i, locType: 'vegetation', label: 'the trees' },
];

// Keyword → landmark type (sim/landmarks.js)
const LANDMARK_TARGETS = [
  { pattern: /\b(crystals?|glimmer|shining)\b/i, lmType: 'crystal' },
  { pattern: /\b(mushrooms?|fungus|fungal|spores?)\b/i, lmType: 'mushroom' },
  { pattern: /\b(berr(?:y|ies)|thickets?)\b/i, lmType: 'berry_bush' },
  { pattern: /\b(river|ford|crossing)\b/i, lmType: 'river' },
  { pattern: /\b(marsh|fen|swamp|bog)\b/i, lmType: 'marsh' },
  { pattern: /\b(mountain|peak|summit|heights?|climb)\b/i, lmType: 'mountain_peak' },
  { pattern: /\b(flowers?|meadow|blossoms?)\b/i, lmType: 'flower' },
];

const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Nearest remembered location of a type (perception.js memory.locations)
 */
function nearestRememberedLocation(dwarf, locType) {
  let best = null;
  let bestDist = Infinity;
  for (const loc of Object.values(dwarf.memory?.locations || {})) {
    if (loc.type !== locType) continue;
    const dist = manhattan(dwarf, loc);
    if (dist < bestDist) {
      bestDist = dist;
      best = loc;
    }
  }
  return best;
}

/**
 * A dwarf whose name appears in the thought (word-boundary, case-insensitive)
 */
function findNamedDwarf(thought, dwarf, state) {
  for (const other of state?.dwarves || []) {
    if (other.id === dwarf.id) continue;
    const name = other.generatedName || other.name;
    if (!name || name.length < 3) continue;
    // First name is enough — generated names are often "Urist Coppervein"
    const firstName = name.split(/\s+/)[0];
    if (new RegExp(`\\b${firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(thought)) {
      return other;
    }
  }
  return null;
}

/**
 * Parse a generated thought into a concrete destination, or null.
 *
 * @param {string} thought - The LLM-generated thought text
 * @param {object} dwarf - The thinking dwarf (memory, position)
 * @param {object} state - World state (landmarks, dwarves, tick)
 * @returns {{targetType: string, targetName: string, x: number, y: number,
 *            reason: string, createdTick: number, expiresTick: number}|null}
 */
export function parseIntent(thought, dwarf, state) {
  if (!thought || !dwarf || !state) return null;
  if (!DESIRE_PATTERN.test(thought)) return null;

  const tick = state.tick || 0;
  const wrap = (targetType, targetName, x, y) => {
    if (typeof x !== 'number' || typeof y !== 'number') return null;
    if (manhattan(dwarf, { x, y }) < MIN_DISTANCE) return null;
    return {
      targetType,
      targetName,
      x,
      y,
      reason: thought.length > 100 ? `${thought.slice(0, 97)}...` : thought,
      createdTick: tick,
      expiresTick: tick + INTENTION_TTL_TICKS,
    };
  };

  // 1. A landmark named outright ("the Crystal Hollow")
  const namedLandmark = findLandmarkInText(state, thought);
  if (namedLandmark) {
    return wrap('landmark', namedLandmark.name, namedLandmark.x, namedLandmark.y);
  }

  // 2. A dwarf named in the thought ("I should find Urist")
  const namedDwarf = findNamedDwarf(thought, dwarf, state);
  if (namedDwarf) {
    return wrap('dwarf', namedDwarf.generatedName || namedDwarf.name, namedDwarf.x, namedDwarf.y);
  }

  // 3. Landmark by subject ("those crystals", "the marsh")
  for (const { pattern, lmType } of LANDMARK_TARGETS) {
    if (!pattern.test(thought)) continue;
    const landmark = (state.landmarks || []).find(l => l.type === lmType);
    if (landmark) {
      return wrap('landmark', landmark.name, landmark.x, landmark.y);
    }
  }

  // 4. Remembered location by subject ("I need water")
  for (const { pattern, locType, label } of MEMORY_TARGETS) {
    if (!pattern.test(thought)) continue;
    const remembered = nearestRememberedLocation(dwarf, locType);
    if (remembered) {
      return wrap('memory', label, remembered.x, remembered.y);
    }
  }

  return null;
}
