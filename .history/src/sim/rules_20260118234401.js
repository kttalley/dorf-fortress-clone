/**
 * Simulation rules for v0.1 - Food Production Edition
 * No death from hunger - food production sustains the colony
 */

import { addLog } from '../state/store.js';
import { isStarved, HUNGER_CAP } from './entities.js';
import { updateProduction } from './foodProduction.js';

// === SIMULATION CONSTANTS ===

export const RULES = {
  // Hunger (non-lethal - food production prevents starvation)
  HUNGER_PER_TICK: 0.12,    // Slow hunger increase - production keeps ahead
  HUNGER_RESTORE: 30,       // Base food restores some hunger
  HUNGER_CAP: HUNGER_CAP,   // Hard cap on hunger

  // Food production (sustains the colony)
  FOOD_RESPAWN_CHANCE: 0.02, // Lower - production systems take over
  FOOD_INITIAL_AMOUNT: 15,   // Seed food from map

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
    // Hard cap - hunger never kills
    dwarf.hunger = Math.min(RULES.HUNGER_CAP, dwarf.hunger);
  }
}

/**
 * Process deaths - food production prevents starvation
 */
export function processDeath(state) {
  // No more starvation deaths!
  // Colony survives through food production systems
  // Keep this function for future death mechanics (accidents, etc.)
  return [];
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
 * Spawn initial food from map
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
      addLog(state, `Wild food appeared at (${x}, ${y}).`);
    }
  }
}

/**
 * Update all food production systems
 */
export function updateFoodProduction(state) {
  updateProduction(state);
}
