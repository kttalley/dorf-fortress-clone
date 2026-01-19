/**
 * Visitor Spawner
 * Handles spawning of external visitors (merchants, raiders, missionaries) at map edges
 */

import { RACE, RACE_CONFIG } from './races.js';
import { createVisitorGroup } from './visitors.js';
import { getRandomEdgePosition } from './edges.js';
import { getSpawnWeightModifier, getDwarfRelation } from './history.js';
import { emit, EVENTS } from '../events/eventBus.js';

export const SPAWN_CONFIG = Object.freeze({
  BASE_INTERVAL: 500,       // Ticks between spawn checks
  BASE_CHANCE: 0.15,        // Base spawn chance per check
  MAX_VISITORS: 12,         // Maximum simultaneous visitors on map
  MIN_TICK: 200,            // Don't spawn before this tick (let dwarves settle)
  COOLDOWN_AFTER_SPAWN: 300, // Minimum ticks between spawns
});

// Track last spawn time
let lastSpawnTick = 0;

/**
 * Reset spawner state (call on world regeneration)
 */
export function resetSpawner() {
  lastSpawnTick = 0;
}

/**
 * Calculate spawn weights for each race based on history
 */
function calculateRaceWeights(history) {
  const weights = {};

  for (const race of Object.values(RACE)) {
    const baseWeight = getRaceBaseWeight(race);
    const historyMod = history ? getSpawnWeightModifier(history, race) : 1.0;

    weights[race] = baseWeight * historyMod;
  }

  return weights;
}

/**
 * Get base spawn weight for a race
 */
function getRaceBaseWeight(race) {
  switch (race) {
    case RACE.HUMAN:
      return 40; // Most common visitors
    case RACE.GOBLIN:
      return 30; // Fairly common threats
    case RACE.ELF:
      return 20; // Less common
    default:
      return 10;
  }
}

/**
 * Select which race to spawn based on weights
 */
function selectRace(weights) {
  const totalWeight = Object.values(weights).reduce((sum, w) => sum + w, 0);
  let roll = Math.random() * totalWeight;

  for (const [race, weight] of Object.entries(weights)) {
    roll -= weight;
    if (roll <= 0) {
      return race;
    }
  }

  return RACE.HUMAN; // Fallback
}

/**
 * Maybe spawn visitors this tick
 * @param {object} state - World state
 */
export function maybeSpawnVisitors(state) {
  // Initialize visitors array if needed
  if (!state.visitors) {
    state.visitors = [];
  }

  // Too early in the game
  if (state.tick < SPAWN_CONFIG.MIN_TICK) return;

  // Max visitors reached
  const livingVisitors = state.visitors.filter(v => v.state !== 'dead');
  if (livingVisitors.length >= SPAWN_CONFIG.MAX_VISITORS) return;

  // Only check at intervals
  if (state.tick % SPAWN_CONFIG.BASE_INTERVAL !== 0) return;

  // Cooldown since last spawn
  if (state.tick - lastSpawnTick < SPAWN_CONFIG.COOLDOWN_AFTER_SPAWN) return;

  // Random chance check
  const spawnChance = calculateSpawnChance(state);
  if (Math.random() > spawnChance) return;

  // Select race based on history
  const weights = calculateRaceWeights(state.history);
  const race = selectRace(weights);

  // Find spawn position
  const spawnPos = getRandomEdgePosition(state.map);
  if (!spawnPos) {
    console.warn('[Spawner] Could not find walkable edge position');
    return;
  }

  // Create visitor group
  const historyContext = {
    history: state.history,
    modifiers: {},
  };

  const visitors = createVisitorGroup(spawnPos.x, spawnPos.y, race, historyContext);

  // Set entry edge for all visitors
  for (const visitor of visitors) {
    visitor.entryEdge = spawnPos.edge;
  }

  // Add to state
  state.visitors.push(...visitors);
  lastSpawnTick = state.tick;

  // Emit event
  const leader = visitors.find(v => v.groupLeader) || visitors[0];
  emit(EVENTS.VISITOR_ARRIVED, {
    visitor: leader,
    group: visitors,
    race,
    edge: spawnPos.edge,
    count: visitors.length,
  });

  // Log spawn
  const raceNames = { human: 'Human', goblin: 'Goblin', elf: 'Elf' };
  const roleDesc = {
    merchant: 'merchants',
    guard: 'guards',
    raider: 'raiders',
    scout: 'scouts',
    missionary: 'missionaries',
    diplomat: 'diplomats',
  };

  const mainRole = roleDesc[leader.role] || 'visitors';
  console.log(
    `[Spawner] ${raceNames[race]} ${mainRole} (${visitors.length}) arrived from ${spawnPos.edge}`
  );
}

/**
 * Calculate spawn chance based on current state
 */
function calculateSpawnChance(state) {
  let chance = SPAWN_CONFIG.BASE_CHANCE;

  // More dwarves = more likely to attract attention
  const dwarfCount = state.dwarves?.length || 0;
  chance *= 1 + (dwarfCount - 3) * 0.1;

  // Fewer current visitors = more likely to spawn
  const visitorCount = state.visitors?.length || 0;
  chance *= 1 - (visitorCount / SPAWN_CONFIG.MAX_VISITORS) * 0.5;

  // History affects overall activity
  if (state.history) {
    // More recent events = more activity
    const recentEvents = state.history.events?.slice(-3) || [];
    if (recentEvents.length > 0) {
      chance *= 1.1;
    }
  }

  return Math.max(0.05, Math.min(0.5, chance));
}

/**
 * Force spawn a specific type of visitor (for testing/events)
 */
export function forceSpawnVisitor(state, race, position = null) {
  if (!state.visitors) {
    state.visitors = [];
  }

  const spawnPos = position || getRandomEdgePosition(state.map);
  if (!spawnPos) return null;

  const historyContext = {
    history: state.history,
    modifiers: {},
  };

  const visitors = createVisitorGroup(spawnPos.x, spawnPos.y, race, historyContext);

  for (const visitor of visitors) {
    visitor.entryEdge = spawnPos.edge;
  }

  state.visitors.push(...visitors);
  lastSpawnTick = state.tick;

  const leader = visitors.find(v => v.groupLeader) || visitors[0];
  emit(EVENTS.VISITOR_ARRIVED, {
    visitor: leader,
    group: visitors,
    race,
    edge: spawnPos.edge,
    count: visitors.length,
  });

  return visitors;
}

/**
 * Get spawn statistics
 */
export function getSpawnStats(state) {
  const visitors = state.visitors || [];

  return {
    total: visitors.length,
    byRace: {
      [RACE.HUMAN]: visitors.filter(v => v.race === RACE.HUMAN).length,
      [RACE.GOBLIN]: visitors.filter(v => v.race === RACE.GOBLIN).length,
      [RACE.ELF]: visitors.filter(v => v.race === RACE.ELF).length,
    },
    byState: {
      arriving: visitors.filter(v => v.state === 'arriving').length,
      active: visitors.filter(v => !['arriving', 'leaving', 'dead'].includes(v.state)).length,
      leaving: visitors.filter(v => v.state === 'leaving').length,
    },
    lastSpawnTick,
    nextSpawnCheck: Math.ceil(state.tick / SPAWN_CONFIG.BASE_INTERVAL) * SPAWN_CONFIG.BASE_INTERVAL,
  };
}
