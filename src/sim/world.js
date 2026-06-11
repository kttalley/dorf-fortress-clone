/**
 * Core simulation loop
 * Order: scent → hunger → perception (decision interval) → decide → act → combat → death → spawn
 * Emits events for the thought system
 */

import { addLog } from '../state/store.js';
import { isCritical, createFoodSource } from './entities.js';
import { decide as aiDecide, workFighting } from '../ai/dwarfAI.js';
import { applyHunger, processDeath, processEat, maybeSpawnFood, updateFoodProduction } from './rules.js';
import { emit, EVENTS } from '../events/eventBus.js';
import { initScentMap, emitScent, decayScents } from './movement.js';
import { initConstruction } from './construction.js';
import { initCrafting } from './crafting.js';
import { decayDrives, getDominantDrive, applyHomeostasis } from './drives.js';
import { perceiveWorld } from './perception.js';
import { getCalendar } from './clock.js';
import { sampleBehavior } from './behaviorTrace.js';
import { ageAnimal, getAnimalNutrition, getAnimalDisplayName, updateAnimalFear } from './animals.js';
import { decideAnimal, actAnimal } from '../ai/animalAI.js';

// External forces imports
import { processVisitors } from '../ai/visitorAI.js';
import { maybeSpawnVisitors, resetSpawner } from './visitorSpawner.js';
import { processCombat, cleanupDeadEntities, tickCooldowns } from './combat.js';

let systemsInitialized = false;

/**
 * Initialize simulation systems
 */
export function initSystems(state) {
  initScentMap(state.map.width, state.map.height);
  initConstruction();
  initCrafting();
  resetSpawner();  // Reset visitor spawner state
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

  // Refresh the shared day/season clock (single source of truth — audit P5)
  state.clock = getCalendar(state.tick);

  // 0. Update weather (Phase 1: Core Loop)
  if (state.weather) {
    state.weather.tick(state);
  }

  // 0.5 Update scent map
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

  // === NEW: 0.75 Decay all entity drives (replaces applyHunger for drives) ===
  for (const dwarf of state.dwarves) {
    decayDrives(dwarf, state);
    // Homeostasis: mood drifts back toward each dwarf's own setpoint and
    // stress bleeds off — misery is a state, not a destination
    applyHomeostasis(dwarf);
    // Energy drains while awake, recovers during night sleep (workRest —
    // audit WALK R8). Finally makes the long-dormant energy stat real.
    if (dwarf.state !== 'sleeping') {
      dwarf.energy = Math.max(0, (dwarf.energy ?? 100) - 0.05);
    }
  }

  // 1. Apply hunger pressure (legacy compatibility; now also uses drives)
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

  // === NEW: 1.5 Perception at decision intervals ===
  for (const dwarf of state.dwarves) {
    if (!dwarf.decisionTick) dwarf.decisionTick = 0;
    if (!dwarf.decisionInterval) dwarf.decisionInterval = 30;

    // Every N ticks, perceive the world
    if (state.tick % dwarf.decisionInterval === 0) {
      perceiveWorld(dwarf, state);
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

  // 3.2 Sample behavior traces after movement resolves (ring buffer feeding
  // LLM prompts — audit WALK R3)
  for (const dwarf of state.dwarves) {
    sampleBehavior(dwarf, state.tick);
  }
  for (const visitor of state.visitors || []) {
    sampleBehavior(visitor, state.tick);
  }

  // 3.4 Animal ecosystem (audit WALK R2): drives + aging every tick,
  // perception/fear/decisions at the animal's faster interval, actions every tick
  for (const animal of state.animals || []) {
    if (animal.hp <= 0 || animal.state === 'dead') continue;
    decayDrives(animal, state);
    ageAnimal(animal, state);
    if (state.tick % (animal.decisionInterval || 10) === 0) {
      perceiveWorld(animal, state);
      updateAnimalFear(animal);
      decideAnimal(animal, state);
    }
    actAnimal(animal, state);
  }

  // 3.45 Fallen animals become carcasses (forageable food) and leave the world
  if (state.animals?.length) {
    const fallen = state.animals.filter(a => a.hp <= 0 || a.state === 'dead');
    if (fallen.length > 0) {
      for (const animal of fallen) {
        state.foodSources.push(createFoodSource(animal.x, animal.y, getAnimalNutrition(animal)));
        addLog(state, `${getAnimalDisplayName(animal)} has fallen.`);
        emit(EVENTS.ANIMAL_DEATH, { animal, worldState: state });
      }
      state.animals = state.animals.filter(a => a.hp > 0 && a.state !== 'dead');
    }
  }

  // 3.5 Process visitors (external forces)
  processVisitors(state);

  // 3.6 Process combat between all entities
  processCombat(state);

  // 4. Check for deaths
  processDeath(state);

  // 4.5 Cleanup dead entities (visitors and dwarves killed in combat)
  cleanupDeadEntities(state);

  // 5. Update food production systems
  updateFoodProduction(state);

  // 6. Maybe spawn new food (stochastic pressure)
  maybeSpawnFood(state, createFoodSource);

  // 7. Maybe spawn visitors (external forces)
  maybeSpawnVisitors(state);

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
    const displayName = dwarf.generatedName || dwarf.name;
    addLog(state, `${displayName} panics from hunger!`);
  }
}

/**
 * Execute dwarf action.
 * Movement happens exclusively inside decide() via the movement.js system
 * (executeSmartMovement), so dwarves move at most one tile per tick.
 * act() only resolves arrival effects: eating and target completion.
 */
function act(dwarf, state) {
  // Sleeping/gathering dwarves stay put at their spot — dwarfAI owns the
  // wake-up/dissolve transitions (phase change), not arrival resolution
  if (dwarf.state === 'sleeping' || dwarf.state === 'gathering') {
    return;
  }

  if (dwarf.target === null) {
    dwarf.state = 'idle';
    return;
  }

  const atTarget = dwarf.x === dwarf.target.x && dwarf.y === dwarf.target.y;
  const nearTarget =
    Math.abs(dwarf.x - dwarf.target.x) <= 1 &&
    Math.abs(dwarf.y - dwarf.target.y) <= 1;

  if ((dwarf.state === 'seeking_food' || dwarf.state === 'eating') && nearTarget) {
    eat(dwarf, state);
  } else if (atTarget) {
    // Arrived at destination
    dwarf.state = 'idle';
    dwarf.target = null;
  }
}

/**
 * Eat food at or adjacent to current position
 */
function eat(dwarf, state) {
  const food = state.foodSources.find(
    f => Math.abs(f.x - dwarf.x) <= 1 && Math.abs(f.y - dwarf.y) <= 1 && f.amount > 0
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
