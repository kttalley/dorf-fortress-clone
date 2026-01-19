/**
 * World state schema for v0.1
 * Single source of truth for the simulation
 */

// Re-export entity factories from entities.js
export { createDwarf, createFoodSource } from '../sim/entities.js';

export function createWorldState(width = 40, height = 20) {
  return {
    tick: 0,

    map: {
      width,
      height,
      tiles: []  // Populated by initMap()
    },

    dwarves: [],

    foodSources: [],

    productionSites: [],  // Food production sites (farms, fishing spots, etc.)

    log: []  // Capped at 50 entries
  };
}

/**
 * Add a log entry (auto-prunes to 50)
 */
export function addLog(state, message) {
  state.log.push({ tick: state.tick, message });
  if (state.log.length > 50) {
    state.log.shift();
  }
}
