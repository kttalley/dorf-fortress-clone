/**
 * Dwarf AI decision-making for v0.1
 * Implements: hunger-driven behavior + bad decisions when starving
 */

import { isHungry, isCritical, distance } from '../sim/entities.js';

// === AI STATES ===
export const AI_STATE = {
  IDLE: 'idle',
  WANDERING: 'wandering',
  SEEKING_FOOD: 'seeking_food',
  EATING: 'eating',
};

/**
 * Main decision function - called each tick for each dwarf
 * Returns the new state and target for the dwarf
 */
export function decide(dwarf, state) {
  // Critical hunger causes bad decisions
  if (isCritical(dwarf)) {
    return decideCritical(dwarf, state);
  }

  // Normal hunger - seek food rationally
  if (isHungry(dwarf)) {
    return decideHungry(dwarf, state);
  }

  // Not hungry - idle or wander
  return decideIdle(dwarf, state);
}

/**
 * Critical hunger: desperate, irrational behavior
 * - May pick suboptimal food (not nearest)
 * - May wander aimlessly even with food available
 * - Mood tanks
 */
function decideCritical(dwarf, state) {
  // Degrade mood
  dwarf.mood = Math.max(0, dwarf.mood - 2);

  const foods = state.foodSources.filter(f => f.amount > 0);

  if (foods.length === 0) {
    // No food - desperate wandering
    return {
      state: AI_STATE.WANDERING,
      target: randomAdjacentPassable(dwarf, state),
    };
  }

  // 30% chance to make a bad decision even with food available
  if (Math.random() < 0.3) {
    // Wander instead of eating (panic/confusion)
    return {
      state: AI_STATE.WANDERING,
      target: randomAdjacentPassable(dwarf, state),
    };
  }

  // 50% chance to pick random food instead of nearest
  let food;
  if (Math.random() < 0.5) {
    food = foods[Math.floor(Math.random() * foods.length)];
  } else {
    food = findNearestFood(dwarf, foods);
  }

  return {
    state: AI_STATE.SEEKING_FOOD,
    target: { x: food.x, y: food.y },
  };
}

/**
 * Normal hunger: rational food-seeking
 */
function decideHungry(dwarf, state) {
  const foods = state.foodSources.filter(f => f.amount > 0);

  if (foods.length === 0) {
    // No food available, wander
    return {
      state: AI_STATE.WANDERING,
      target: randomAdjacentPassable(dwarf, state),
    };
  }

  const food = findNearestFood(dwarf, foods);
  return {
    state: AI_STATE.SEEKING_FOOD,
    target: { x: food.x, y: food.y },
  };
}

/**
 * Not hungry: idle behavior
 */
function decideIdle(dwarf, state) {
  // Slowly restore mood when not hungry
  dwarf.mood = Math.min(100, dwarf.mood + 1);

  // 70% chance to stay idle, 30% to wander
  if (dwarf.state === AI_STATE.IDLE && Math.random() < 0.7) {
    return { state: AI_STATE.IDLE, target: null };
  }

  return {
    state: AI_STATE.WANDERING,
    target: randomAdjacentPassable(dwarf, state),
  };
}

/**
 * Find nearest food source
 */
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

/**
 * Pick a random passable adjacent tile
 */
function randomAdjacentPassable(dwarf, state) {
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

/**
 * Check if tile is passable (import map functions lazily to avoid cycles)
 */
function isPassable(x, y, state) {
  // Bounds check
  if (x < 0 || x >= state.map.width || y < 0 || y >= state.map.height) {
    return false;
  }

  // Get tile from map array
  const index = y * state.map.width + x;
  const tile = state.map.tiles[index];

  // Wall tiles are impassable
  return tile !== '#';
}
