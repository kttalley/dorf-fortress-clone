/**
 * Simulation rules for v0.1
 * Centralized constants and rule functions
 */

import { addLog } from '../state/store.js';
import { isStarved, HUNGER_DEATH } from './entities.js';

// === SIMULATION CONSTANTS ===

export const RULES = {
  // Hunger
  HUNGER_PER_TICK: 1,       // Hunger increase per tick
  HUNGER_RESTORE: 30,       // Hunger restored per food unit

  // Food
  FOOD_RESPAWN_CHANCE: 0.02, // Chance per tick for new food to spawn
  FOOD_INITIAL_AMOUNT: 10,   // Starting units per food source

  // Ticks
  TICKS_PER_SECOND: 4,       // Simulation speed
};

// === RULE FUNCTIONS ===

/**
 * Apply hunger to all dwarves
 */
export function applyHunger(state) {
  for (const dwarf of state.dwarves) {
    dwarf.hunger += RULES.HUNGER_PER_TICK;
  }
}

/**
 * Process deaths - returns array of survivors
 */
export function processDeath(state) {
  const alive = [];
  const dead = [];

  for (const dwarf of state.dwarves) {
    if (isStarved(dwarf)) {
      dead.push(dwarf);
      addLog(state, `${dwarf.name} has starved to death.`);
    } else {
      alive.push(dwarf);
    }
  }

  state.dwarves = alive;
  return dead;
}

/**
 * Process eating at a food source
 */
export function processEat(dwarf, food, state) {
  if (food.amount <= 0) return false;

  food.amount--;
  dwarf.hunger = Math.max(0, dwarf.hunger - RULES.HUNGER_RESTORE);

  addLog(state, `${dwarf.name} eats. (hunger: ${dwarf.hunger})`);

  if (food.amount <= 0) {
    // Remove depleted food
    const index = state.foodSources.indexOf(food);
    if (index !== -1) {
      state.foodSources.splice(index, 1);
    }
    addLog(state, `Food source depleted at (${food.x}, ${food.y}).`);
  }

  return true;
}

/**
 * Maybe spawn new food (stochastic pressure)
 */
export function maybeSpawnFood(state, createFoodFn) {
  if (Math.random() < RULES.FOOD_RESPAWN_CHANCE) {
    // Find a random passable tile
    const x = Math.floor(Math.random() * state.map.width);
    const y = Math.floor(Math.random() * state.map.height);

    // Simple check - just avoid walls
    const index = y * state.map.width + x;
    const tile = state.map.tiles[index];

    if (tile !== '#') {
      const food = createFoodFn(x, y, RULES.FOOD_INITIAL_AMOUNT);
      state.foodSources.push(food);
      addLog(state, `New food appeared at (${x}, ${y}).`);
    }
  }
}
