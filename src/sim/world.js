/**
 * Core simulation loop
 * Order: scent → hunger → decision → action → death → spawn
 * Emits events for the thought system
 */

import { addLog } from '../state/store.js';
import { getTile, inBounds } from '../map/map.js';
import { getTileDef } from '../map/tiles.js';
import { isCritical, createFoodSource } from './entities.js';
import { decide as aiDecide } from '../ai/dwarfAI.js';
import { applyHunger, processDeath, processEat, maybeSpawnFood } from './rules.js';
import { emit, EVENTS } from '../events/eventBus.js';
import { initScentMap, emitScent, decayScents } from './movement.js';
import { initConstruction } from './construction.js';
import { initCrafting } from './crafting.js';

let systemsInitialized = false;

/**
 * Initialize simulation systems
 */
export function initSystems(state) {
  initScentMap(state.map.width, state.map.height);
  initConstruction();
  initCrafting();
  systemsInitialized = true;
}

/**
 * Run one simulation tick
 */
export function tick(state) {
  // Initialize systems on first tick
  if (!systemsInitialized) {
    initSystems(state);
  }

  state.tick++;

  // 0. Update scent map
  decayScents();

  // Emit food scents
  for (const food of state.foodSources || []) {
    if (food.amount > 0) {
      emitScent(food.x, food.y, food.amount * 0.5, 12);
    }
  }

  // Track previous hunger for threshold detection
  const previousHungers = new Map();
  const previousMoods = new Map();
  for (const dwarf of state.dwarves) {
    previousHungers.set(dwarf.id, dwarf.hunger);
    previousMoods.set(dwarf.id, dwarf.mood || 50);
  }

  // 1. Apply hunger pressure
  applyHunger(state);

  // Emit hunger threshold events
  for (const dwarf of state.dwarves) {
    const prev = previousHungers.get(dwarf.id);
    const current = dwarf.hunger;
    if (prev !== current) {
      emit(EVENTS.HUNGER_THRESHOLD, {
        dwarf,
        previousHunger: prev,
        newHunger: current,
        worldState: state,
      });
    }
  }

  // 2. Each dwarf decides what to do
  for (const dwarf of state.dwarves) {
    decide(dwarf, state);
  }

  // 3. Execute actions
  for (const dwarf of state.dwarves) {
    act(dwarf, state);
  }

  // 4. Check for deaths
  processDeath(state);

  // 5. Maybe spawn new food (stochastic pressure)
  maybeSpawnFood(state, createFoodSource);

  // Check for mood shifts after all actions
  for (const dwarf of state.dwarves) {
    const prevMood = previousMoods.get(dwarf.id);
    const currentMood = dwarf.mood || 50;
    const moodDelta = Math.abs(currentMood - prevMood);
    if (moodDelta >= 15) {
      emit(EVENTS.MOOD_SHIFT, {
        dwarf,
        previousMood: prevMood,
        newMood: currentMood,
        reason: moodDelta > 0 ? 'improved' : 'declined',
        worldState: state,
      });
    }
  }

  // Emit tick event for proximity detection and other systems
  emit(EVENTS.TICK, { worldState: state, tick: state.tick });
}

/**
 * Dwarf decision logic - delegates to AI module
 */
function decide(dwarf, state) {
  const decision = aiDecide(dwarf, state);
  dwarf.state = decision.state;
  dwarf.target = decision.target;

  // Log critical hunger events
  if (isCritical(dwarf) && dwarf.state === 'wandering') {
    addLog(state, `${dwarf.name} panics from hunger!`);
  }
}

/**
 * Execute dwarf action
 */
function act(dwarf, state) {
  if (dwarf.target === null) {
    dwarf.state = 'idle';
    return;
  }

  const atTarget = dwarf.x === dwarf.target.x && dwarf.y === dwarf.target.y;

  if (atTarget) {
    if (dwarf.state === 'seeking_food') {
      eat(dwarf, state);
    } else {
      // Arrived at wander destination
      dwarf.state = 'idle';
      dwarf.target = null;
    }
  } else {
    moveToward(dwarf, dwarf.target, state);
  }
}

/**
 * Move one step toward target
 */
function moveToward(dwarf, target, state) {
  const dx = Math.sign(target.x - dwarf.x);
  const dy = Math.sign(target.y - dwarf.y);

  // Try horizontal first, then vertical
  const newX = dwarf.x + dx;
  const newY = dwarf.y + dy;

  if (dx !== 0 && isPassable(newX, dwarf.y, state)) {
    dwarf.x = newX;
  } else if (dy !== 0 && isPassable(dwarf.x, newY, state)) {
    dwarf.y = newY;
  }
  // If blocked, dwarf stays put this tick
}

/**
 * Eat at current position
 */
function eat(dwarf, state) {
  const food = state.foodSources.find(
    f => f.x === dwarf.x && f.y === dwarf.y && f.amount > 0
  );

  if (food) {
    // Emit food found event before eating
    emit(EVENTS.FOOD_FOUND, {
      dwarf,
      food,
      worldState: state,
    });

    processEat(dwarf, food, state);
    dwarf.state = 'eating';

    // Check if food depleted
    if (food.amount <= 0) {
      emit(EVENTS.FOOD_DEPLETED, {
        dwarf,
        food,
        worldState: state,
      });
    }
  }

  // Done eating, reset
  dwarf.target = null;
  dwarf.state = 'idle';
}

/**
 * Check if a tile is passable
 */
function isPassable(x, y, state) {
  if (!inBounds(state.map, x, y)) {
    return false;
  }

  const tile = getTile(state.map, x, y);
  if (!tile) return false;

  return getTileDef(tile).walkable;
}
