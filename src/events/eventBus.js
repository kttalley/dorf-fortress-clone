/**
 * Simple Event Bus for decoupling game events from LLM triggers
 * Pub/sub pattern for loose coupling between simulation and thought system
 */

const listeners = new Map();

/**
 * Event types that can trigger thoughts/speech
 */
export const EVENTS = Object.freeze({
  // Social events (trigger LLM thoughts)
  DWARF_MEETING: 'dwarf:meeting',           // Two dwarves come within interaction range
  DWARF_PARTING: 'dwarf:parting',           // Two dwarves move apart

  // Discovery events (trigger LLM thoughts)
  FOOD_FOUND: 'dwarf:food_found',           // Dwarf finds food source
  FOOD_DEPLETED: 'dwarf:food_depleted',     // Food source exhausted nearby
  NEW_TERRAIN: 'dwarf:new_terrain',         // Dwarf enters different terrain type

  // State change events (trigger LLM thoughts)
  HUNGER_THRESHOLD: 'dwarf:hunger_threshold', // Hunger crosses 40/60/80 boundary
  MOOD_SHIFT: 'dwarf:mood_shift',             // Significant mood change (>15 points)

  // World events (informational, may trigger thoughts)
  DWARF_DEATH: 'dwarf:death',
  DWARF_SPAWN: 'dwarf:spawn',
  TICK: 'world:tick',                       // Emitted every simulation tick
});

/**
 * Subscribe to an event
 * @param {string} event - Event type from EVENTS
 * @param {function} callback - Handler function(payload)
 * @returns {function} Unsubscribe function
 */
export function on(event, callback) {
  if (!listeners.has(event)) {
    listeners.set(event, new Set());
  }
  listeners.get(event).add(callback);

  // Return unsubscribe function
  return () => {
    const set = listeners.get(event);
    if (set) {
      set.delete(callback);
    }
  };
}

/**
 * Subscribe to an event, but only fire once
 * @param {string} event - Event type
 * @param {function} callback - Handler function
 * @returns {function} Unsubscribe function
 */
export function once(event, callback) {
  const unsubscribe = on(event, (payload) => {
    unsubscribe();
    callback(payload);
  });
  return unsubscribe;
}

/**
 * Emit an event to all subscribers
 * @param {string} event - Event type
 * @param {object} payload - Event data
 */
export function emit(event, payload = {}) {
  const handlers = listeners.get(event);
  if (!handlers || handlers.size === 0) return;

  for (const handler of handlers) {
    try {
      handler(payload);
    } catch (error) {
      console.error(`[EventBus] Handler error for ${event}:`, error);
    }
  }
}

/**
 * Remove all listeners for an event
 * @param {string} event - Event type, or omit to clear all
 */
export function off(event = null) {
  if (event) {
    listeners.delete(event);
  } else {
    listeners.clear();
  }
}

/**
 * Get count of listeners for an event
 * @param {string} event
 * @returns {number}
 */
export function listenerCount(event) {
  return listeners.get(event)?.size || 0;
}

/**
 * Clear all listeners (for cleanup/testing)
 */
export function clear() {
  listeners.clear();
}
