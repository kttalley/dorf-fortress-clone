/**
 * Inspection system - queries world data at positions
 * Provides tile info, entity data, and formatted display data
 */

import { getTile } from '../map/map.js';
import { getTileDef, TILE_DEFS } from '../map/tiles.js';
import { getDominantTraits } from '../sim/entities.js';

/**
 * Get all entities at a specific position
 * @param {object} state - World state
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {Array} Entities at position
 */
export function getEntitiesAt(state, x, y) {
  const entities = [];

  // Check dwarves
  for (const dwarf of state.dwarves) {
    if (dwarf.x === x && dwarf.y === y) {
      entities.push({ type: 'dwarf', entity: dwarf });
    }
  }

  // Check food sources
  for (const food of state.foodSources) {
    if (food.x === x && food.y === y && food.amount > 0) {
      entities.push({ type: 'food', entity: food });
    }
  }

  return entities;
}

/**
 * Get tile information at position
 * @param {object} state - World state
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {object|null} Tile info
 */
export function getTileAt(state, x, y) {
  const tile = getTile(state.map, x, y);
  if (!tile) return null;

  const def = getTileDef(tile);
  return {
    type: tile.type,
    def,
    resourceAmount: tile.resourceAmount || 0,
  };
}

/**
 * Get complete inspection data for a position
 * @param {object} state - World state
 * @param {number} x - X coordinate
 * @param {number} y - Y coordinate
 * @returns {object} Full inspection data
 */
export function inspectPosition(state, x, y) {
  const tile = getTileAt(state, x, y);
  const entities = getEntitiesAt(state, x, y);

  return {
    x,
    y,
    tile,
    entities,
    hasDwarf: entities.some(e => e.type === 'dwarf'),
    hasFood: entities.some(e => e.type === 'food'),
  };
}

/**
 * Format tile type name for display
 * @param {string} tileType - Tile type constant
 * @returns {string} Human-readable name
 */
export function formatTileName(tileType) {
  if (!tileType) return 'Unknown';

  return tileType
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Get dwarf stats for display panel
 * @param {object} dwarf - Dwarf entity
 * @returns {object} Formatted stats
 */
export function getDwarfStats(dwarf) {
  const traits = getDominantTraits(dwarf);

  // Calculate overall wellbeing (0-100)
  const fulfillmentAvg = dwarf.fulfillment
    ? (dwarf.fulfillment.social +
       dwarf.fulfillment.exploration +
       dwarf.fulfillment.creativity +
       dwarf.fulfillment.tranquility) / 4
    : 50;

  const wellbeing = Math.round(
    (dwarf.mood * 0.4) +
    (fulfillmentAvg * 0.4) +
    ((100 - dwarf.hunger) * 0.2)
  );

  return {
    // Identity
    id: dwarf.id,
    name: dwarf.generatedName || dwarf.name,  // Prefer generated name
    bio: dwarf.generatedBio || null,           // LLM-generated bio
    traits,

    // Vitals
    hunger: Math.round(dwarf.hunger),
    mood: Math.round(dwarf.mood),
    wellbeing,

    // Fulfillment
    fulfillment: dwarf.fulfillment ? {
      social: Math.round(dwarf.fulfillment.social),
      exploration: Math.round(dwarf.fulfillment.exploration),
      creativity: Math.round(dwarf.fulfillment.creativity),
      tranquility: Math.round(dwarf.fulfillment.tranquility),
    } : null,

    // State
    state: formatStateName(dwarf.state),
    currentThought: dwarf.currentThought,

    // Relationships summary
    relationshipCount: Object.keys(dwarf.relationships || {}).length,
    bestFriend: getBestFriend(dwarf),

    // Raw for advanced inspection
    raw: dwarf,
  };
}

/**
 * Get dwarf's best friend (highest affinity relationship)
 * @param {object} dwarf
 * @returns {object|null} { id, affinity }
 */
function getBestFriend(dwarf) {
  if (!dwarf.relationships) return null;

  let best = null;
  let bestAffinity = -Infinity;

  for (const [id, rel] of Object.entries(dwarf.relationships)) {
    if (rel.affinity > bestAffinity) {
      bestAffinity = rel.affinity;
      best = { id: parseInt(id), affinity: rel.affinity };
    }
  }

  return bestAffinity > 0 ? best : null;
}

/**
 * Format state name for display
 * @param {string} state
 * @returns {string}
 */
function formatStateName(state) {
  if (!state) return 'Idle';

  const stateNames = {
    idle: 'Idle',
    wandering: 'Wandering',
    seeking_food: 'Seeking Food',
    eating: 'Eating',
    seeking_social: 'Seeking Company',
    socializing: 'Socializing',
    exploring: 'Exploring',
  };

  return stateNames[state] || state.replace(/_/g, ' ');
}

/**
 * Get food source stats for display
 * @param {object} food - Food entity
 * @returns {object} Formatted stats
 */
export function getFoodStats(food) {
  return {
    id: food.id,
    amount: food.amount,
    position: { x: food.x, y: food.y },
  };
}

/**
 * Get a brief tooltip label for position
 * @param {object} inspection - Result from inspectPosition
 * @returns {string} Brief label
 */
export function getTooltipLabel(inspection) {
  const { tile, entities } = inspection;

  // Entity takes priority
  if (entities.length > 0) {
    const first = entities[0];
    if (first.type === 'dwarf') {
      return first.entity.generatedName;
    }
    if (first.type === 'human') {
      return first.entity.generatedName;
    }
    if (first.type === 'food') {
      return `Food (${first.entity.amount})`;
    }
  }

  // Fall back to tile
  if (tile) {
    return formatTileName(tile.type);
  }

  return 'Empty';
}

/**
 * Get mood descriptor from mood value
 * @param {number} mood - 0-100
 * @returns {string}
 */
export function getMoodDescriptor(mood) {
  if (mood >= 90) return 'Ecstatic';
  if (mood >= 75) return 'Happy';
  if (mood >= 60) return 'Content';
  if (mood >= 45) return 'Neutral';
  if (mood >= 30) return 'Unhappy';
  if (mood >= 15) return 'Miserable';
  return 'Despairing';
}

/**
 * Get hunger descriptor from hunger value
 * @param {number} hunger - 0-100
 * @returns {string}
 */
export function getHungerDescriptor(hunger) {
  if (hunger <= 10) return 'Full';
  if (hunger <= 30) return 'Satisfied';
  if (hunger <= 50) return 'Peckish';
  if (hunger <= 70) return 'Hungry';
  if (hunger <= 85) return 'Very Hungry';
  return 'Starving';
}
