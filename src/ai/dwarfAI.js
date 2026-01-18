/**
 * Dwarf AI decision-making
 * Prioritizes fulfillment and social interaction over mere survival
 * Dwarves seek meaning through relationships and exploration
 */

import {
  isHungry,
  isCritical,
  distance,
  needsSocial,
  needsExploration,
  getMostPressingNeed,
  applyFulfillmentDecay,
  satisfyFulfillment,
} from '../sim/entities.js';

// === AI STATES ===
export const AI_STATE = {
  IDLE: 'idle',
  WANDERING: 'wandering',
  SEEKING_FOOD: 'seeking_food',
  EATING: 'eating',
  SEEKING_SOCIAL: 'seeking_social',   // Moving toward another dwarf
  SOCIALIZING: 'socializing',         // Near another dwarf, chatting
  EXPLORING: 'exploring',             // Seeking new terrain
};

/**
 * Main decision function - called each tick for each dwarf
 * Priority: Critical hunger > Fulfillment needs > Normal hunger > Idle
 */
export function decide(dwarf, state) {
  // Apply fulfillment decay each tick
  applyFulfillmentDecay(dwarf);

  // Critical hunger still matters (but rare with new settings)
  if (isCritical(dwarf)) {
    return decideCritical(dwarf, state);
  }

  // Check fulfillment needs - this is the main driver now
  const pressingNeed = getMostPressingNeed(dwarf);

  if (pressingNeed) {
    switch (pressingNeed.type) {
      case 'social':
        return decideSocial(dwarf, state);
      case 'exploration':
        return decideExplore(dwarf, state);
      case 'tranquility':
        return decideTranquil(dwarf, state);
      default:
        // creativity - for now, just wander creatively
        return decideWander(dwarf, state);
    }
  }

  // Normal hunger - seek food if needed
  if (isHungry(dwarf)) {
    return decideHungry(dwarf, state);
  }

  // Content - idle or gentle wandering
  return decideContent(dwarf, state);
}

/**
 * Social need: seek out other dwarves for conversation
 */
function decideSocial(dwarf, state) {
  const otherDwarves = state.dwarves.filter(d => d.id !== dwarf.id);

  if (otherDwarves.length === 0) {
    // No one to talk to - wander sadly
    return decideWander(dwarf, state);
  }

  // Find nearest dwarf who might also want to socialize
  let bestTarget = null;
  let bestScore = -Infinity;

  for (const other of otherDwarves) {
    const dist = distance(dwarf, other);
    const relationship = dwarf.relationships?.[other.id];
    const affinity = relationship?.affinity || 0;

    // Score based on: closeness, positive relationship, other's social need
    const otherNeedsSocial = needsSocial(other) ? 20 : 0;
    const score = -dist + affinity * 0.5 + otherNeedsSocial;

    if (score > bestScore) {
      bestScore = score;
      bestTarget = other;
    }
  }

  if (bestTarget) {
    const dist = distance(dwarf, bestTarget);

    // Already close enough - socializing
    if (dist <= 2) {
      // Satisfy social need a bit each tick while near others
      satisfyFulfillment(dwarf, 'social', 0.1);
      return {
        state: AI_STATE.SOCIALIZING,
        target: { x: bestTarget.x, y: bestTarget.y },
      };
    }

    // Move toward them
    return {
      state: AI_STATE.SEEKING_SOCIAL,
      target: { x: bestTarget.x, y: bestTarget.y },
    };
  }

  return decideWander(dwarf, state);
}

/**
 * Exploration need: seek new terrain types
 */
function decideExplore(dwarf, state) {
  // Get current terrain
  const currentTile = getTileAt(dwarf.x, dwarf.y, state);

  // Track visited areas (simplified - just terrain types)
  if (!dwarf.memory.visitedAreas) {
    dwarf.memory.visitedAreas = new Set();
  }

  if (currentTile && !dwarf.memory.visitedAreas.has(currentTile)) {
    dwarf.memory.visitedAreas.add(currentTile);
    satisfyFulfillment(dwarf, 'exploration', 0.5);
  }

  // Find an interesting direction to explore
  const target = findExplorationTarget(dwarf, state);

  if (target) {
    return {
      state: AI_STATE.EXPLORING,
      target,
    };
  }

  return decideWander(dwarf, state);
}

/**
 * Tranquility need: find a peaceful spot away from others
 */
function decideTranquil(dwarf, state) {
  const otherDwarves = state.dwarves.filter(d => d.id !== dwarf.id);

  // Check if we're alone
  const nearbyCount = otherDwarves.filter(d => distance(dwarf, d) <= 5).length;

  if (nearbyCount === 0) {
    // We're alone - gain tranquility
    satisfyFulfillment(dwarf, 'tranquility', 0.2);
    return {
      state: AI_STATE.IDLE,
      target: null,
    };
  }

  // Find direction away from others
  const target = findQuietSpot(dwarf, state, otherDwarves);

  if (target) {
    return {
      state: AI_STATE.WANDERING,
      target,
    };
  }

  return decideWander(dwarf, state);
}

/**
 * Critical hunger: still matters, but rare
 */
function decideCritical(dwarf, state) {
  dwarf.mood = Math.max(0, dwarf.mood - 1);

  const foods = state.foodSources.filter(f => f.amount > 0);

  if (foods.length === 0) {
    return {
      state: AI_STATE.WANDERING,
      target: randomWanderTarget(dwarf, state, 3),
    };
  }

  const food = findNearestFood(dwarf, foods);
  return {
    state: AI_STATE.SEEKING_FOOD,
    target: { x: food.x, y: food.y },
  };
}

/**
 * Normal hunger: calmly seek food
 */
function decideHungry(dwarf, state) {
  const foods = state.foodSources.filter(f => f.amount > 0);

  if (foods.length === 0) {
    return decideWander(dwarf, state);
  }

  const food = findNearestFood(dwarf, foods);
  return {
    state: AI_STATE.SEEKING_FOOD,
    target: { x: food.x, y: food.y },
  };
}

/**
 * Content state: gentle wandering, enjoying life
 */
function decideContent(dwarf, state) {
  // Slowly restore mood
  dwarf.mood = Math.min(100, dwarf.mood + 0.5);

  // Slight chance to gain tranquility if idle
  if (Math.random() < 0.3) {
    satisfyFulfillment(dwarf, 'tranquility', 0.05);
  }

  // Mix of idle and wandering
  if (dwarf.state === AI_STATE.IDLE && Math.random() < 0.6) {
    return { state: AI_STATE.IDLE, target: null };
  }

  return decideWander(dwarf, state);
}

/**
 * General wandering behavior
 */
function decideWander(dwarf, state) {
  return {
    state: AI_STATE.WANDERING,
    target: randomWanderTarget(dwarf, state, 4),
  };
}

// === HELPER FUNCTIONS ===

function findNearestFood(dwarf, foods) {
  let nearest = null;
  let nearestDist = Infinity;

  for (const food of foods) {
    const dist = distance(dwarf, food);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = food;
    }
  }

  return nearest;
}

function findExplorationTarget(dwarf, state) {
  // Pick a random direction and go that way
  const range = 5 + Math.floor(Math.random() * 5);
  const angle = Math.random() * Math.PI * 2;

  const targetX = Math.floor(dwarf.x + Math.cos(angle) * range);
  const targetY = Math.floor(dwarf.y + Math.sin(angle) * range);

  // Clamp to map bounds
  const x = Math.max(1, Math.min(state.map.width - 2, targetX));
  const y = Math.max(1, Math.min(state.map.height - 2, targetY));

  if (isPassable(x, y, state)) {
    return { x, y };
  }

  return randomWanderTarget(dwarf, state, 3);
}

function findQuietSpot(dwarf, state, otherDwarves) {
  // Calculate direction away from centroid of others
  let avgX = 0, avgY = 0;
  for (const other of otherDwarves) {
    avgX += other.x;
    avgY += other.y;
  }
  avgX /= otherDwarves.length;
  avgY /= otherDwarves.length;

  // Move away from average position
  const dx = dwarf.x - avgX;
  const dy = dwarf.y - avgY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;

  const targetX = Math.floor(dwarf.x + (dx / len) * 3);
  const targetY = Math.floor(dwarf.y + (dy / len) * 3);

  const x = Math.max(1, Math.min(state.map.width - 2, targetX));
  const y = Math.max(1, Math.min(state.map.height - 2, targetY));

  if (isPassable(x, y, state)) {
    return { x, y };
  }

  return randomWanderTarget(dwarf, state, 2);
}

function randomWanderTarget(dwarf, state, range) {
  // Try to find a passable tile within range
  for (let i = 0; i < 10; i++) {
    const dx = Math.floor(Math.random() * (range * 2 + 1)) - range;
    const dy = Math.floor(Math.random() * (range * 2 + 1)) - range;

    const x = dwarf.x + dx;
    const y = dwarf.y + dy;

    if (isPassable(x, y, state)) {
      return { x, y };
    }
  }

  // Fallback to adjacent
  const directions = [
    { x: dwarf.x - 1, y: dwarf.y },
    { x: dwarf.x + 1, y: dwarf.y },
    { x: dwarf.x, y: dwarf.y - 1 },
    { x: dwarf.x, y: dwarf.y + 1 },
  ];

  const passable = directions.filter(d => isPassable(d.x, d.y, state));
  if (passable.length === 0) return null;

  return passable[Math.floor(Math.random() * passable.length)];
}

function getTileAt(x, y, state) {
  if (x < 0 || x >= state.map.width || y < 0 || y >= state.map.height) {
    return null;
  }
  const index = y * state.map.width + x;
  const tile = state.map.tiles[index];
  return tile?.type || null;
}

function isPassable(x, y, state) {
  if (x < 0 || x >= state.map.width || y < 0 || y >= state.map.height) {
    return false;
  }

  const index = y * state.map.width + x;
  const tile = state.map.tiles[index];

  // Handle both object tiles and simple char tiles
  if (typeof tile === 'object') {
    // Check walkable property or type
    const walkable = [
      'grass', 'tall_grass', 'dirt', 'forest_floor', 'cave_floor',
      'river_bank', 'sand', 'mountain_slope', 'marsh', 'moss',
      'shrub', 'flower', 'mushroom', 'berry_bush', 'food_plant',
      'rocky_ground', 'snow', 'mud', 'crystal', 'path'
    ];
    return tile.walkable !== false && walkable.includes(tile.type);
  }

  return tile !== '#' && tile !== '~';
}
