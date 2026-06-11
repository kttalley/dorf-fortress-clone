/**
 * World state schema for v0.1
 * Single source of truth for the simulation
 */

import { getCalendar } from '../sim/clock.js';

// Re-export entity factories from entities.js
export { createDwarf, createFoodSource } from '../sim/entities.js';

/**
 * Fresh L1 chronicle slot (saga/recent persist on state so saves survive)
 */
export function createChronicle() {
  return {
    saga: '',      // Folded long-term summary ("the saga so far")
    recent: [],    // Last ~8 narrated day-event lines
    headline: '',  // Season/day/weather headline, refreshed at day boundaries
    lastDay: 0,    // Last narratedLog day folded into `recent`
  };
}

export function createWorldState(width = 40, height = 20) {
  return {
    tick: 0,

    clock: getCalendar(0),  // Day/season/phase calendar (refreshed each tick)

    map: {
      width,
      height,
      tiles: []  // Populated by initMap()
    },

    dwarves: [],

    foodSources: [],

    productionSites: [],  // Food production sites (farms, fishing spots, etc.)

    visitors: [],  // External visitors (humans, goblins, elves)

    history: null,  // World history (generated at world creation)

    narratedLog: [],  // Day-end narrated events (eventNarrator, capped at 100)

    chronicle: createChronicle(),  // L1 rolling chronicle (worldContext.js)

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
