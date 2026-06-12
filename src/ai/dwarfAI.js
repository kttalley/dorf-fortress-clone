/**
 * Dwarf AI - Task-Driven Behavior System
 * Dwarves pursue meaningful work, social connections, and personal aspirations
 */

import {
  isHungry,
  isCritical,
  distance,
  needsSocial,
  getMostPressingNeed,
  satisfyFulfillment,
  getDisplayName,
} from '../sim/entities.js';

import { addLog } from '../state/store.js';

import {
  canHuntAt,
  findNearestPrey,
  attemptHunt,
  getHuntingAbility,
  HUNTING_CONFIG,
} from '../sim/hunting.js';

import {
  canFishAt,
  attemptFish,
  getFishingAbility,
  isWaterTile,
} from '../sim/fishing.js';

import {
  TASK_TYPE,
  ASPIRATION,
  calculateTaskSuitability,
  getTaskDescription,
} from '../sim/tasks.js';

import {
  executeSmartMovement,
  moveToward,
  emitScent,
  findPath,
  isPassable,
} from '../sim/movement.js';

import {
  findNearestDigTask,
  workOnDig,
  getDigDesignations,
  suggestRoom,
  designateRoom,
  getIncompleteStructures,
  getBuildProjects,
  findNearestBuildProject,
  findWorkLocation,
  workOnBuildProject,
  considerBuilding,
  getStructures,
  STRUCTURE_TYPE,
} from '../sim/construction.js';

import {
  findBestCraftingJob,
  workOnCrafting,
  getPendingCraftingJobs,
} from '../sim/crafting.js';

import {
  findNearestThreat,
  findSafePosition,
  shouldFlee,
  attemptAttack,
  inAttackRange,
} from '../sim/combat.js';

import { emit, EVENTS } from '../events/eventBus.js';

// Weather cognition integration
import {
  applyWeatherMood,
  getWeatherBehaviorModifier,
  updateWeatherFulfillment,
  getWeatherHealthEffects,
} from '../sim/weatherCognition.js';

// === AI STATES ===
export const AI_STATE = {
  IDLE: 'idle',
  WANDERING: 'wandering',
  SEEKING_FOOD: 'seeking_food',
  EATING: 'eating',
  SEEKING_SOCIAL: 'seeking_social',
  SOCIALIZING: 'socializing',
  EXPLORING: 'exploring',
  SEEKING_SHELTER: 'seeking_shelter',
  HUNTING: 'hunting',
  FISHING: 'fishing',
  GATHERING: 'gathering',
  SLEEPING: 'sleeping',
  PURSUING_INTENTION: 'pursuing_intention',
  WORKING_DIG: 'digging',
  WORKING_BUILD: 'building',
  WORKING_CRAFT: 'crafting',
  HAULING: 'hauling',
  // Combat states
  FIGHTING: 'fighting',
  FLEEING_COMBAT: 'fleeing_combat',
};

// Configuration
const CONFIG = {
  TASK_RECONSIDER_INTERVAL: 20,  // Ticks between reconsidering task
  SOCIAL_RANGE: 4,               // Tiles for socializing
  WORK_RANGE: 1,                 // Tiles to work on something
};

/**
 * Main decision function - called each tick for each dwarf
 */
export function decide(dwarf, state) {
  // Track decision interval
  if (!dwarf._lastDecision) dwarf._lastDecision = 0;
  dwarf._lastDecision++;

  // Phase 2: Apply weather effects to mood and behavior
  if (state.weather) {
    const weather = state.weather.getWeatherAt(dwarf.x, dwarf.y);
    // getWeatherAt already computes the dominant field (lowercase ids,
    // matching WEATHER_MOOD_MAP / fulfillment keys). Sheltered dwarves are
    // out of the weather — no exposure effects (that's what shelter is FOR).
    if (weather.type && weather.dominant > 0.05 && !isSheltered(dwarf, state)) {
      const dominantType = weather.type;
      const maxIntensity = weather.dominant;

      // Apply weather mood effects
      applyWeatherMood(dwarf, dominantType, maxIntensity, state);

      // Update fulfillment based on weather
      updateWeatherFulfillment(dwarf, dominantType, maxIntensity);

      // Track chronic exposure: health effects scale with ticks spent in
      // the same weather, not with instantaneous intensity
      if (dwarf._weatherType === dominantType) {
        dwarf._weatherExposure = (dwarf._weatherExposure || 0) + 1;
      } else {
        dwarf._weatherType = dominantType;
        dwarf._weatherExposure = 1;
      }

      const healthEffects = getWeatherHealthEffects(dwarf, dominantType, dwarf._weatherExposure) || {};
      dwarf._weatherStress = (dwarf._weatherStress || 0) + (healthEffects.stress || 0) * 0.01;
      if ((healthEffects.sickness || 0) * 0.005 > Math.random()) {
        dwarf._sickTicks = (dwarf._sickTicks || 0) + 1;
      }
    } else {
      // Clear skies: exposure resets
      dwarf._weatherType = null;
      dwarf._weatherExposure = 0;
    }
  }

  // HIGHEST PRIORITY: Combat threats
  const threat = findNearestThreat(dwarf, state);
  if (threat) {
    return decideCombatResponse(dwarf, threat, state);
  }

  // If fleeing, continue until safe
  if (dwarf.state === AI_STATE.FLEEING_COMBAT) {
    return continueFleeing(dwarf, state);
  }

  // Critical hunger overrides everything except combat
  if (isCritical(dwarf)) {
    return decideCritical(dwarf, state);
  }

  // If we have an active task, continue it
  if (dwarf.currentTask && dwarf._lastDecision < CONFIG.TASK_RECONSIDER_INTERVAL) {
    return continueTask(dwarf, state);
  }

  // Time to find a new task
  dwarf._lastDecision = 0;
  return findNewTask(dwarf, state);
}

/**
 * Continue working on current task
 */
function continueTask(dwarf, state) {
  const task = dwarf.currentTask;

  switch (task?.type) {
    case TASK_TYPE.DIG:
      return workDig(dwarf, state);

    case TASK_TYPE.BUILD:
      return workBuild(dwarf, state);

    case TASK_TYPE.CRAFT:
      return workCraft(dwarf, state);

    case TASK_TYPE.SOCIALIZE:
      return workSocialize(dwarf, state);

    case TASK_TYPE.EXPLORE:
      return workExplore(dwarf, state);

    case TASK_TYPE.FORAGE:
    case TASK_TYPE.EAT:
      return workEat(dwarf, state);

    case TASK_TYPE.SEEK_SHELTER:
      return workSeekShelter(dwarf, state);

    case TASK_TYPE.HUNT:
      return workHunt(dwarf, state);

    case TASK_TYPE.FISH:
      return workFish(dwarf, state);

    case TASK_TYPE.GATHER:
      return workGather(dwarf, state);

    case TASK_TYPE.REST:
      return workRest(dwarf, state);

    case TASK_TYPE.SCOUT:
      return workIntention(dwarf, state);

    case 'fighting':
      return workFighting(dwarf, state);

    default:
      // No valid task, find new one
      dwarf.currentTask = null;
      return findNewTask(dwarf, state);
  }
}

/**
 * Find a new task based on needs, aspirations, and available work
 */
function findNewTask(dwarf, state) {
  const candidates = [];

  // Check pressing fulfillment needs
  const pressingNeed = getMostPressingNeed(dwarf);

  // Hunger check (but less urgent now)
  if (isHungry(dwarf)) {
    const food = findNearestFood(dwarf, state);
    candidates.push({
      type: TASK_TYPE.FORAGE,
      priority: 60 + (dwarf.hunger - 60),
      target: food,
    });

    // Dwarves join the food web (audit pass 2): when foraging has nothing
    // sure to walk to (no visible food, only a stale memory), hunting and
    // fishing outrank it; with real food in sight they stay fallbacks
    const noSureFood = !food || food.remembered;

    if (canHuntAt(dwarf, dwarf.x, dwarf.y, state)) {
      const prey = findNearestPrey(dwarf, state);
      if (prey) {
        candidates.push({
          type: TASK_TYPE.HUNT,
          priority: noSureFood
            ? 64 + (dwarf.hunger - 60) + getHuntingAbility(dwarf) * 8
            : 50 + (dwarf.hunger - 60) * 0.5 + getHuntingAbility(dwarf) * 8,
          target: prey,
        });
      }
    }

    const fishingSpot = findNearestFishingSpot(dwarf, state);
    if (fishingSpot && canFishAt(dwarf, fishingSpot.x, fishingSpot.y, state)) {
      candidates.push({
        type: TASK_TYPE.FISH,
        priority: noSureFood
          ? 63 + (dwarf.hunger - 60) + getFishingAbility(dwarf) * 8
          : 49 + (dwarf.hunger - 60) * 0.5 + getFishingAbility(dwarf) * 8,
        target: fishingSpot,
      });
    }
  }

  // Social need
  if (pressingNeed?.type === 'social' || needsSocial(dwarf)) {
    const socialTarget = findSocialTarget(dwarf, state);
    if (socialTarget) {
      candidates.push({
        type: TASK_TYPE.SOCIALIZE,
        priority: 50 + pressingNeed?.urgency || 0,
        target: socialTarget,
      });
    }
  }

  // Exploration need
  if (pressingNeed?.type === 'exploration') {
    candidates.push({
      type: TASK_TYPE.EXPLORE,
      priority: 45 + (pressingNeed.urgency || 0),
      target: null,
    });
  }

  // Check for work tasks based on aspiration
  const workTasks = findAspirationWork(dwarf, state);
  candidates.push(...workTasks);

  // Check for available dig tasks
  const digTask = findNearestDigTask(dwarf);
  if (digTask) {
    const suitability = dwarf.skills?.mining || 0.3;
    candidates.push({
      type: TASK_TYPE.DIG,
      priority: 40 + suitability * 20,
      target: digTask,
    });
  }

  // Check for active building projects
  const buildProject = findNearestBuildProject(dwarf);
  if (buildProject) {
    const buildSkill = Math.max(
      dwarf.skills?.masonry || 0.3,
      dwarf.skills?.mining || 0.3
    );
    candidates.push({
      type: TASK_TYPE.BUILD,
      priority: 45 + buildSkill * 20,
      target: buildProject,
    });
  }

  // Consider starting a new building project
  if (!buildProject && Math.random() < 0.05) {
    const newProject = considerBuilding(dwarf, state);
    if (newProject) {
      candidates.push({
        type: TASK_TYPE.BUILD,
        priority: 60, // High priority for newly initiated project
        target: newProject,
      });
    }
  }

  // Check for crafting tasks
  const craftJob = findBestCraftingJob(dwarf);
  if (craftJob) {
    candidates.push({
      type: TASK_TYPE.CRAFT,
      priority: 40 + (dwarf.skills?.crafting || 0.3) * 20,
      target: craftJob,
    });
  }

  // Weather-driven behavior (audit WALK R5 / WX 8): bad weather damps
  // outdoor work and socializing and pulls dwarves toward shelter
  if (state.weather) {
    const weather = state.weather.getWeatherAt(dwarf.x, dwarf.y);
    if (weather?.type && weather.dominant > 0.3) {
      const shift = getWeatherBehaviorModifier(dwarf, weather.type, weather.dominant).priorityShift || {};

      for (const candidate of candidates) {
        if (shift.working && (candidate.type === TASK_TYPE.DIG || candidate.type === TASK_TYPE.BUILD || candidate.type === TASK_TYPE.CRAFT)) {
          candidate.priority += shift.working * weather.dominant;
        }
        if (shift.socializing && candidate.type === TASK_TYPE.SOCIALIZE) {
          candidate.priority += shift.socializing * weather.dominant;
        }
      }

      if (shift.seeking_shelter > 0 && !isSheltered(dwarf, state)) {
        const shelter = findNearestShelter(dwarf, state);
        if (shelter) {
          // Rain at full intensity ~55, miasma ~85 (outranks routine work,
          // not critical hunger/combat)
          candidates.push({
            type: TASK_TYPE.SEEK_SHELTER,
            priority: 25 + shift.seeking_shelter * 6 * weather.dominant,
            target: shelter,
          });
        }
      }
    }
  }

  // Day/night rhythm (audit WALK R8): dusk pulls idle dwarves together,
  // night pulls them to sleep — temporal texture the prompts can see
  const phase = state.clock?.phase;
  if (phase === 'dusk') {
    const spot = findGatheringSpot(dwarf, state);
    if (spot) {
      candidates.push({
        type: TASK_TYPE.GATHER,
        priority: 46,
        target: spot,
      });
    }
  } else if (phase === 'night') {
    const spot = findNearestShelter(dwarf, state) || findGatheringSpot(dwarf, state);
    // Tired dwarves want sleep more (energy finally matters)
    candidates.push({
      type: TASK_TYPE.REST,
      priority: 50 + (100 - (dwarf.energy ?? 100)) * 0.2,
      target: spot,
    });
  }

  // LLM intention (audit WALK R4): a thought picked a destination — above
  // idle wandering, below pressing needs and aspiration work
  if (dwarf.intention && (dwarf.intention.expiresTick ?? Infinity) > state.tick) {
    candidates.push({
      type: TASK_TYPE.SCOUT,
      priority: 48,
      target: { x: dwarf.intention.x, y: dwarf.intention.y },
    });
  }

  // Always have idle as fallback
  candidates.push({
    type: TASK_TYPE.IDLE,
    priority: 10,
    target: null,
  });

  // Sort by priority and pick best
  candidates.sort((a, b) => b.priority - a.priority);
  const chosen = candidates[0];

  dwarf.currentTask = chosen;

  // Start the task
  return startTask(dwarf, chosen, state);
}

/**
 * Find work aligned with dwarf's aspiration
 */
function findAspirationWork(dwarf, state) {
  const tasks = [];

  switch (dwarf.aspiration) {
    case ASPIRATION.MASTER_CRAFTSMAN:
      // Look for crafting opportunities
      const craftJob = findBestCraftingJob(dwarf);
      if (craftJob) {
        tasks.push({
          type: TASK_TYPE.CRAFT,
          priority: 55, // Higher priority for aspiration match
          target: craftJob,
        });
      }
      break;

    case ASPIRATION.ARCHITECT:
      // Look for building/digging opportunities
      const digDesignations = getDigDesignations();
      if (digDesignations.length > 0) {
        tasks.push({
          type: TASK_TYPE.DIG,
          priority: 55,
          target: findNearestDigTask(dwarf),
        });
      }

      // Maybe suggest a new room if no dig tasks
      if (digDesignations.length === 0 && Math.random() < 0.1) {
        const room = suggestRoom(state, 4 + Math.floor(Math.random() * 3));
        if (room) {
          designateRoom(room.x, room.y, room.x + room.w - 1, room.y + room.h - 1, state);
        }
      }
      break;

    case ASPIRATION.EXPLORER:
      tasks.push({
        type: TASK_TYPE.EXPLORE,
        priority: 50,
        target: null,
      });
      break;

    case ASPIRATION.SOCIAL_BUTTERFLY:
      const target = findSocialTarget(dwarf, state);
      if (target) {
        tasks.push({
          type: TASK_TYPE.SOCIALIZE,
          priority: 55,
          target,
        });
      }
      break;

    case ASPIRATION.HERMIT:
      // Find quiet spot
      tasks.push({
        type: TASK_TYPE.EXPLORE,
        priority: 45,
        target: null,
        _avoidSocial: true,
      });
      break;
  }

  return tasks;
}

/**
 * Start a task
 */
function startTask(dwarf, task, state) {
  switch (task.type) {
    case TASK_TYPE.DIG:
      return {
        state: AI_STATE.WORKING_DIG,
        target: task.target ? { x: task.target.x, y: task.target.y } : null,
      };

    case TASK_TYPE.BUILD:
      return {
        state: AI_STATE.WORKING_BUILD,
        target: task.target ? { x: task.target.x, y: task.target.y } : null,
      };

    case TASK_TYPE.CRAFT:
      return {
        state: AI_STATE.WORKING_CRAFT,
        target: task.target?.workshop ? { x: task.target.workshop.x, y: task.target.workshop.y } : null,
      };

    case TASK_TYPE.SOCIALIZE:
      return {
        state: AI_STATE.SEEKING_SOCIAL,
        target: task.target ? { x: task.target.x, y: task.target.y } : null,
      };

    case TASK_TYPE.EXPLORE:
      return decideExplore(dwarf, state, task._avoidSocial);

    case TASK_TYPE.FORAGE:
    case TASK_TYPE.EAT:
      const food = task.target || findNearestFood(dwarf, state);
      return {
        state: AI_STATE.SEEKING_FOOD,
        target: food ? { x: food.x, y: food.y } : null,
      };

    case TASK_TYPE.SEEK_SHELTER:
      return workSeekShelter(dwarf, state);

    case TASK_TYPE.HUNT:
      return workHunt(dwarf, state);

    case TASK_TYPE.FISH:
      return workFish(dwarf, state);

    case TASK_TYPE.GATHER:
      return workGather(dwarf, state);

    case TASK_TYPE.REST:
      return workRest(dwarf, state);

    case TASK_TYPE.SCOUT:
      return workIntention(dwarf, state);

    default:
      return decideIdle(dwarf, state);
  }
}

// === WORK FUNCTIONS ===

function workDig(dwarf, state) {
  const task = dwarf.currentTask;
  if (!task?.target) {
    dwarf.currentTask = null;
    return findNewTask(dwarf, state);
  }

  const dist = distance(dwarf, task.target);

  if (dist <= CONFIG.WORK_RANGE) {
    // Do the work
    const complete = workOnDig(task.target.x, task.target.y, dwarf, state);

    if (complete) {
      dwarf.tilesDigged++;
      satisfyFulfillment(dwarf, 'creativity', 0.3);
      dwarf.currentTask = null;
    }

    return { state: AI_STATE.WORKING_DIG, target: task.target };
  }

  // Move toward dig site
  executeSmartMovement(dwarf, state, { targetPos: task.target });
  return { state: AI_STATE.WORKING_DIG, target: task.target };
}

function workBuild(dwarf, state) {
  const task = dwarf.currentTask;
  if (!task?.target) {
    dwarf.currentTask = null;
    return findNewTask(dwarf, state);
  }

  const project = task.target;

  // Find where to work on the project
  const workLoc = findWorkLocation(project, dwarf);
  const dist = Math.abs(dwarf.x - workLoc.x) + Math.abs(dwarf.y - workLoc.y);

  if (dist <= CONFIG.WORK_RANGE) {
    // Do the work
    const complete = workOnBuildProject(project, dwarf, state);

    if (complete) {
      satisfyFulfillment(dwarf, 'creativity', 0.8);
      dwarf.tilesDigged = (dwarf.tilesDigged || 0) + 1;
      dwarf.currentTask = null;
    }

    return { state: AI_STATE.WORKING_BUILD, target: workLoc };
  }

  // Move toward work location
  executeSmartMovement(dwarf, state, { targetPos: workLoc });
  return { state: AI_STATE.WORKING_BUILD, target: workLoc };
}

function workCraft(dwarf, state) {
  const task = dwarf.currentTask;
  if (!task?.target?.job) {
    dwarf.currentTask = null;
    return findNewTask(dwarf, state);
  }

  const job = task.target.job;
  const workshop = job.workshop;
  const dist = Math.abs(dwarf.x - workshop.x) + Math.abs(dwarf.y - workshop.y);

  if (dist <= CONFIG.WORK_RANGE + 1) {
    const item = workOnCrafting(job, dwarf, state);

    if (item) {
      dwarf.itemsCrafted++;
      if (item.quality?.name === 'masterwork') {
        dwarf.masterworkCount++;
      }
      dwarf.memory.craftedItems.push(item);
      satisfyFulfillment(dwarf, 'creativity', 0.8);
      dwarf.currentTask = null;
    }

    return { state: AI_STATE.WORKING_CRAFT, target: { x: workshop.x, y: workshop.y } };
  }

  executeSmartMovement(dwarf, state, { targetPos: { x: workshop.x, y: workshop.y } });
  return { state: AI_STATE.WORKING_CRAFT, target: { x: workshop.x, y: workshop.y } };
}

function workSocialize(dwarf, state) {
  const task = dwarf.currentTask;
  const target = task?.target;

  if (!target) {
    dwarf.currentTask = null;
    return findNewTask(dwarf, state);
  }

  // Find the actual dwarf
  const other = state.dwarves.find(d => d.id === target.id);
  if (!other) {
    dwarf.currentTask = null;
    return findNewTask(dwarf, state);
  }

  const dist = distance(dwarf, other);

  if (dist <= CONFIG.SOCIAL_RANGE) {
    // Socializing!
    satisfyFulfillment(dwarf, 'social', 0.15);
    dwarf.mood = Math.min(100, (dwarf.mood || 50) + 1);

    // Stay near but don't crowd
    if (dist < 2) {
      return { state: AI_STATE.SOCIALIZING, target: { x: other.x, y: other.y } };
    }

    executeSmartMovement(dwarf, state, { targetPos: { x: other.x, y: other.y }, seekSocial: true });
    return { state: AI_STATE.SOCIALIZING, target: { x: other.x, y: other.y } };
  }

  // Move toward social target
  executeSmartMovement(dwarf, state, { targetPos: { x: other.x, y: other.y }, seekSocial: true });
  return { state: AI_STATE.SEEKING_SOCIAL, target: { x: other.x, y: other.y } };
}

function workExplore(dwarf, state) {
  satisfyFulfillment(dwarf, 'exploration', 0.05);

  // Ensure visitedAreas is initialized as a Set
  if (!dwarf.memory.visitedAreas) {
    dwarf.memory.visitedAreas = new Set();
  }

  // Mark current area as visited
  const tile = getTileAt(dwarf.x, dwarf.y, state);
  if (tile && !dwarf.memory.visitedAreas.has(tile)) {
    dwarf.memory.visitedAreas.add(tile);
    satisfyFulfillment(dwarf, 'exploration', 0.3);
  }

  // Keep exploring
  return decideExplore(dwarf, state, false);
}

function workEat(dwarf, state) {
  const food = findNearestFood(dwarf, state, { desperate: isCritical(dwarf) });

  if (!food) {
    dwarf.currentTask = null;
    return { state: AI_STATE.WANDERING, target: null };
  }

  const dist = distance(dwarf, food);

  // Memory-driven foraging (audit WALK R6): walking a remembered patch,
  // not visible food. Real food entering sight takes over automatically
  // (findNearestFood prefers it).
  if (food.remembered) {
    if (dist <= 1) {
      const loc = dwarf.memory?.locations?.[food.memKey];
      if (loc) {
        loc.visits = (loc.visits || 0) + 1;
        // A remembered FOOD spot with nothing here is stale — forget it.
        // Vegetation is still vegetation; just not edible today.
        if (loc.type === 'food') delete dwarf.memory.locations[food.memKey];
      }
      dwarf.currentTask = null;
      return { state: AI_STATE.WANDERING, target: null };
    }
    executeSmartMovement(dwarf, state, { targetPos: { x: food.x, y: food.y }, followScent: true });
    return { state: AI_STATE.SEEKING_FOOD, target: { x: food.x, y: food.y } };
  }

  if (dist <= 1) {
    // Eat!
    return { state: AI_STATE.EATING, target: { x: food.x, y: food.y } };
  }

  executeSmartMovement(dwarf, state, { targetPos: { x: food.x, y: food.y }, followScent: true });
  return { state: AI_STATE.SEEKING_FOOD, target: { x: food.x, y: food.y } };
}

function workSeekShelter(dwarf, state) {
  const task = dwarf.currentTask;
  if (!task?.target) {
    dwarf.currentTask = null;
    return findNewTask(dwarf, state);
  }

  // Weather cleared: no reason to hide anymore
  const weather = state.weather?.getWeatherAt?.(dwarf.x, dwarf.y);
  if (!weather?.type || weather.dominant < 0.2) {
    dwarf.currentTask = null;
    return findNewTask(dwarf, state);
  }

  const dist = Math.abs(dwarf.x - task.target.x) + Math.abs(dwarf.y - task.target.y);
  if (dist <= 1 || isSheltered(dwarf, state)) {
    // Hunkered down: ride out the weather
    satisfyFulfillment(dwarf, 'tranquility', 0.1);
    dwarf.mood = Math.min(100, (dwarf.mood || 50) + 0.5);
    return { state: AI_STATE.SEEKING_SHELTER, target: task.target };
  }

  executeSmartMovement(dwarf, state, { targetPos: task.target });
  return { state: AI_STATE.SEEKING_SHELTER, target: task.target };
}

const HUNT_GIVE_UP_RANGE = HUNTING_CONFIG.HUNT_RANGE * 1.5;
const FISHING_MAX_CASTS = 80; // ticks at the water's edge before giving up

/**
 * Hunger-driven hunt (audit pass 2): chase the prey via the movement
 * system (single mover), attack via attemptHunt when adjacent. A kill stays
 * unresolved here on purpose — world.js turns the fallen animal into a
 * carcass food source at the kill site, and the still-hungry dwarf's next
 * decision forages it.
 */
function workHunt(dwarf, state) {
  const prey = dwarf.currentTask?.target;

  // Prey dead, despawned, or escaped beyond tracking: end the hunt
  if (!prey || prey.hp <= 0 || prey.state === 'dead' ||
      !state.animals?.includes(prey) ||
      distance(dwarf, prey) > HUNT_GIVE_UP_RANGE) {
    dwarf.currentTask = null;
    return findNewTask(dwarf, state);
  }

  const result = attemptHunt(dwarf, prey, state);

  if (result.killed) {
    dwarf.mood = Math.min(100, (dwarf.mood || 50) + 4);
    satisfyFulfillment(dwarf, 'exploration', 0.2);
    addLog(state, `${getDisplayName(dwarf)} brought down a ${prey.subtype}!`);
    dwarf.currentTask = null;
    return { state: AI_STATE.HUNTING, target: { x: dwarf.x, y: dwarf.y } };
  }

  if (result.reason) {
    // insufficient_skill / incapacitated — not a hunter today
    dwarf.currentTask = null;
    return findNewTask(dwarf, state);
  }

  if (result.phase === 'chasing') {
    executeSmartMovement(dwarf, state, { targetPos: { x: prey.x, y: prey.y } });
  }

  return { state: AI_STATE.HUNTING, target: { x: prey.x, y: prey.y } };
}

/**
 * Hunger-driven fishing (audit pass 2): walk to the remembered bank spot,
 * then cast each tick — attemptFish rolls catch chance (rain bonus comes
 * free from the live weather system). The catch lands at the dwarf's feet
 * as a food source, so the next decision forages it.
 */
function workFish(dwarf, state) {
  const task = dwarf.currentTask;
  const spot = task?.target;
  if (!spot) {
    dwarf.currentTask = null;
    return findNewTask(dwarf, state);
  }

  // Not at a fishable spot yet: keep walking to the bank
  if (!canFishAt(dwarf, dwarf.x, dwarf.y, state)) {
    const dist = Math.abs(dwarf.x - spot.x) + Math.abs(dwarf.y - spot.y);
    if (dist === 0) {
      // Arrived but the spot isn't fishable after all (water gone? blocked?)
      dwarf.currentTask = null;
      return findNewTask(dwarf, state);
    }
    executeSmartMovement(dwarf, state, { targetPos: spot });
    return { state: AI_STATE.FISHING, target: spot };
  }

  // At the water's edge: cast
  task._castTicks = (task._castTicks || 0) + 1;
  const result = attemptFish(dwarf, state);

  if (result.success) {
    dwarf.mood = Math.min(100, (dwarf.mood || 50) + 3);
    satisfyFulfillment(dwarf, 'tranquility', 0.2);
    addLog(state, `${getDisplayName(dwarf)} caught ${result.amount > 1 ? `${result.amount} fish` : 'a fish'}.`);
    dwarf.currentTask = null;
    return { state: AI_STATE.FISHING, target: { x: dwarf.x, y: dwarf.y } };
  }

  if (result.reason === 'no_water' || result.reason === 'incapacitated' ||
      task._castTicks > FISHING_MAX_CASTS) {
    dwarf.currentTask = null;
    return findNewTask(dwarf, state);
  }

  // Patient casting — a quiet activity
  satisfyFulfillment(dwarf, 'tranquility', 0.02);
  return { state: AI_STATE.FISHING, target: { x: dwarf.x, y: dwarf.y } };
}

const FISHING_SCAN_RADIUS = 12;

/**
 * Nearest standable bank tile beside water within scanning range
 */
function findNearestFishingSpot(dwarf, state) {
  let best = null;
  let bestDist = Infinity;

  for (let dy = -FISHING_SCAN_RADIUS; dy <= FISHING_SCAN_RADIUS; dy++) {
    for (let dx = -FISHING_SCAN_RADIUS; dx <= FISHING_SCAN_RADIUS; dx++) {
      if (Math.abs(dx) + Math.abs(dy) >= bestDist + 1) continue;
      const x = dwarf.x + dx;
      const y = dwarf.y + dy;
      if (!isWaterTile(getTileAt(x, y, state))) continue;

      // Stand on the closest passable bank tile beside this water
      for (const [bx, by] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (!isPassable(state, bx, by)) continue;
        const bankDist = Math.abs(bx - dwarf.x) + Math.abs(by - dwarf.y);
        if (bankDist < bestDist) {
          bestDist = bankDist;
          best = { x: bx, y: by };
        }
      }
    }
  }

  return best;
}

/**
 * Dusk congregation (audit WALK R8): drift to the gathering spot, then
 * mingle. Dissolves when dusk ends.
 */
function workGather(dwarf, state) {
  const phase = state.clock?.phase;
  if (phase !== 'dusk' && phase !== 'night') {
    dwarf.currentTask = null;
    return findNewTask(dwarf, state);
  }

  const task = dwarf.currentTask;
  if (!task?.target) {
    dwarf.currentTask = null;
    return findNewTask(dwarf, state);
  }

  const dist = Math.abs(dwarf.x - task.target.x) + Math.abs(dwarf.y - task.target.y);
  if (dist <= 3) {
    // Arrived: mingle by the fire
    satisfyFulfillment(dwarf, 'social', 0.08);
    dwarf.mood = Math.min(100, (dwarf.mood || 50) + 0.4);
    return { state: AI_STATE.GATHERING, target: task.target };
  }

  executeSmartMovement(dwarf, state, { targetPos: task.target, seekSocial: true });
  return { state: AI_STATE.GATHERING, target: task.target };
}

/**
 * Night sleep (audit WALK R8): walk to shelter, then sleep — the long-dormant
 * energy stat finally regenerates here (and decays while awake, world.js).
 */
function workRest(dwarf, state) {
  const phase = state.clock?.phase;
  if (phase !== 'night') {
    // Morning: wake up
    dwarf.currentTask = null;
    return findNewTask(dwarf, state);
  }

  const task = dwarf.currentTask;
  const target = task?.target;

  const dist = target
    ? Math.abs(dwarf.x - target.x) + Math.abs(dwarf.y - target.y)
    : 0;

  if (!target || dist <= 1 || isSheltered(dwarf, state)) {
    // Asleep: recover energy and a little tranquility
    dwarf.energy = Math.min(100, (dwarf.energy ?? 100) + 0.25);
    satisfyFulfillment(dwarf, 'tranquility', 0.05);
    return { state: AI_STATE.SLEEPING, target: target || { x: dwarf.x, y: dwarf.y } };
  }

  executeSmartMovement(dwarf, state, { targetPos: target });
  return { state: AI_STATE.SLEEPING, target };
}

/**
 * Pursue an LLM-thought destination (audit WALK R4). Arrival emits
 * INTENTION_FULFILLED so the thought system can close the loop with a
 * follow-up thought.
 */
function workIntention(dwarf, state) {
  const intention = dwarf.intention;

  // Intention gone or stale: drop the task
  if (!intention || (intention.expiresTick ?? Infinity) <= state.tick) {
    dwarf.intention = null;
    dwarf.currentTask = null;
    return findNewTask(dwarf, state);
  }

  const dist = Math.abs(dwarf.x - intention.x) + Math.abs(dwarf.y - intention.y);
  if (dist <= 1) {
    // Made it — the thought became a journey became an arrival
    satisfyFulfillment(dwarf, 'exploration', 0.4);
    satisfyFulfillment(dwarf, 'tranquility', 0.1);
    dwarf.mood = Math.min(100, (dwarf.mood || 50) + 2);
    emit(EVENTS.INTENTION_FULFILLED, { dwarf, intention, worldState: state });
    dwarf.intention = null;
    dwarf.currentTask = null;
    return { state: AI_STATE.IDLE, target: null };
  }

  executeSmartMovement(dwarf, state, { targetPos: { x: intention.x, y: intention.y } });
  return { state: AI_STATE.PURSUING_INTENTION, target: { x: intention.x, y: intention.y } };
}

/**
 * Where the camp congregates at dusk: completed structure center, else the
 * first landmark, else the dwarves' centroid
 */
function findGatheringSpot(dwarf, state) {
  for (const s of getStructures()) {
    if (s.complete) {
      return {
        x: s.x + Math.floor((s.width || 1) / 2),
        y: s.y + Math.floor((s.height || 1) / 2),
      };
    }
  }

  if (state.landmarks?.length > 0) {
    const landmark = state.landmarks[0];
    return { x: landmark.x, y: landmark.y };
  }

  const dwarves = state.dwarves || [];
  if (dwarves.length > 1) {
    return {
      x: Math.round(dwarves.reduce((sum, d) => sum + d.x, 0) / dwarves.length),
      y: Math.round(dwarves.reduce((sum, d) => sum + d.y, 0) / dwarves.length),
    };
  }

  return null;
}

// === DECISION HELPERS ===

const EXPLORE_TARGET_TIMEOUT = 120; // ticks before abandoning an unreachable frontier

/**
 * Sample candidate frontier points, preferring far, unvisited ground
 * (audit WALK R6)
 */
function pickExploreTarget(dwarf, state) {
  let best = null;
  let bestScore = -Infinity;

  for (let i = 0; i < 12; i++) {
    const angle = Math.random() * Math.PI * 2;
    const range = 8 + Math.floor(Math.random() * 14);
    const x = Math.max(1, Math.min(state.map.width - 2, Math.floor(dwarf.x + Math.cos(angle) * range)));
    const y = Math.max(1, Math.min(state.map.height - 2, Math.floor(dwarf.y + Math.sin(angle) * range)));
    if (!isPassable(state, x, y)) continue;

    const tile = getTileAt(x, y, state);
    const unvisited = tile && !dwarf.memory?.visitedAreas?.has(tile) ? 1 : 0;
    const dist = Math.abs(x - dwarf.x) + Math.abs(y - dwarf.y);
    const score = unvisited * 20 + dist;
    if (score > bestScore) {
      bestScore = score;
      best = { x, y };
    }
  }

  return best;
}

function decideExplore(dwarf, state, avoidSocial = false) {
  // Persistent frontier target (audit WALK R6): keep walking toward the
  // same unvisited spot across ticks instead of re-rolling a direction
  // every call (which made "exploring" indistinguishable from drift)
  let target = dwarf._exploreTarget;
  const arrived = target && Math.abs(dwarf.x - target.x) + Math.abs(dwarf.y - target.y) <= 1;
  const expired = target && state.tick - (target.setTick || 0) > EXPLORE_TARGET_TIMEOUT;

  if (arrived) {
    satisfyFulfillment(dwarf, 'exploration', 0.5); // frontier reached
    target = null;
  }
  if (!target || expired) {
    const next = pickExploreTarget(dwarf, state);
    target = next ? { ...next, setTick: state.tick } : null;
    dwarf._exploreTarget = target;
  }
  if (!target) {
    // Boxed in: fall back to a drift step
    executeSmartMovement(dwarf, state, { exploreBias: true, avoidSocial });
    return { state: AI_STATE.EXPLORING, target: null };
  }

  executeSmartMovement(dwarf, state, {
    targetPos: { x: target.x, y: target.y },
    exploreBias: true,
    avoidSocial,
  });

  return { state: AI_STATE.EXPLORING, target: { x: target.x, y: target.y } };
}

function decideIdle(dwarf, state) {
  // Slow mood recovery
  dwarf.mood = Math.min(100, (dwarf.mood || 50) + 0.3);

  // Small fulfillment gains
  satisfyFulfillment(dwarf, 'tranquility', 0.05);

  // Occasional gentle movement
  if (Math.random() < 0.3) {
    executeSmartMovement(dwarf, state, { exploreBias: false });
    return { state: AI_STATE.WANDERING, target: null };
  }

  return { state: AI_STATE.IDLE, target: null };
}

function decideCritical(dwarf, state) {
  dwarf.mood = Math.max(0, dwarf.mood - 1);

  // Survival valve: a critical dwarf gets the omniscient scan (WALK R6)
  const food = findNearestFood(dwarf, state, { desperate: true });

  if (!food) {
    executeSmartMovement(dwarf, state, { followScent: true });
    return { state: AI_STATE.WANDERING, target: null };
  }

  executeSmartMovement(dwarf, state, { targetPos: { x: food.x, y: food.y } });
  return { state: AI_STATE.SEEKING_FOOD, target: { x: food.x, y: food.y } };
}

// === HELPER FUNCTIONS ===

function findNearestFood(dwarf, state, { desperate = false } = {}) {
  const foods = state.foodSources?.filter(f => f.amount > 0) || [];
  const sightRange = dwarf.perceptionRadius || 10;

  // Sight first (audit WALK R6): no more map-wide mind-reading. A starving
  // dwarf (desperate) keeps the old omniscient scan as a survival valve.
  let nearest = null;
  let nearestDist = Infinity;
  for (const food of foods) {
    const dist = distance(dwarf, food);
    if (dist < nearestDist && (desperate || dist <= sightRange)) {
      nearestDist = dist;
      nearest = food;
    }
  }
  if (nearest) return nearest;

  // Memory second: head for the freshest remembered food or vegetation
  // patch instead of wandering blind
  let memKey = null;
  let remembered = null;
  for (const [key, loc] of Object.entries(dwarf.memory?.locations || {})) {
    if (loc.type !== 'food' && loc.type !== 'vegetation') continue;
    if (!remembered || (loc.lastSeen || 0) > (remembered.lastSeen || 0)) {
      remembered = loc;
      memKey = key;
    }
  }
  if (remembered) {
    return { x: remembered.x, y: remembered.y, remembered: true, memKey };
  }

  return null;
}

function findSocialTarget(dwarf, state) {
  const others = state.dwarves.filter(d => d.id !== dwarf.id);

  let best = null;
  let bestScore = -Infinity;

  for (const other of others) {
    const dist = distance(dwarf, other);
    const relationship = dwarf.relationships?.[other.id];
    const affinity = relationship?.affinity || 0;
    const otherSocial = needsSocial(other) ? 20 : 0;

    const score = -dist * 0.5 + affinity * 0.3 + otherSocial;

    if (score > bestScore) {
      bestScore = score;
      best = other;
    }
  }

  return best;
}

function findBuildTask(dwarf, state) {
  const incomplete = getIncompleteStructures();
  if (incomplete.length === 0) return null;

  let nearest = null;
  let nearestDist = Infinity;

  for (const structure of incomplete) {
    const dist = Math.abs(dwarf.x - structure.x) + Math.abs(dwarf.y - structure.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = structure;
    }
  }

  return nearest;
}

/**
 * Sheltered = underground or inside a completed structure's footprint
 */
function isSheltered(dwarf, state) {
  const tileType = getTileAt(dwarf.x, dwarf.y, state);
  if (tileType === 'cave_floor') return true;

  return getStructures().some(s =>
    s.complete &&
    dwarf.x >= s.x && dwarf.x < s.x + (s.width || 1) &&
    dwarf.y >= s.y && dwarf.y < s.y + (s.height || 1)
  );
}

/**
 * Nearest shelter target: a completed structure's center, falling back to
 * the nearest cave-floor tile within scanning range
 */
function findNearestShelter(dwarf, state) {
  let best = null;
  let bestDist = Infinity;

  for (const s of getStructures()) {
    if (!s.complete) continue;
    const cx = s.x + Math.floor((s.width || 1) / 2);
    const cy = s.y + Math.floor((s.height || 1) / 2);
    const dist = Math.abs(dwarf.x - cx) + Math.abs(dwarf.y - cy);
    if (dist < bestDist) {
      bestDist = dist;
      best = { x: cx, y: cy };
    }
  }
  if (best) return best;

  const SCAN_RADIUS = 15;
  for (let dy = -SCAN_RADIUS; dy <= SCAN_RADIUS; dy++) {
    for (let dx = -SCAN_RADIUS; dx <= SCAN_RADIUS; dx++) {
      const x = dwarf.x + dx;
      const y = dwarf.y + dy;
      const dist = Math.abs(dx) + Math.abs(dy);
      if (dist === 0 || dist >= bestDist) continue;
      if (getTileAt(x, y, state) === 'cave_floor') {
        bestDist = dist;
        best = { x, y };
      }
    }
  }
  return best;
}

function getTileAt(x, y, state) {
  if (x < 0 || x >= state.map.width || y < 0 || y >= state.map.height) return null;
  const tile = state.map.tiles[y * state.map.width + x];
  return tile?.type || null;
}

// === COMBAT FUNCTIONS ===

/**
 * Decide how to respond to a combat threat
 */
function decideCombatResponse(dwarf, threat, state) {
  const bravery = dwarf.personality?.bravery || 0.5;
  const hpRatio = dwarf.hp / dwarf.maxHp;

  // Check if we should flee
  if (shouldFlee(dwarf) || (hpRatio < 0.4 && bravery < 0.4)) {
    return fleeFromThreat(dwarf, state);
  }

  // Decide based on personality
  // Brave dwarves fight, cowardly flee
  if (bravery > 0.6 || hpRatio > 0.6) {
    return engageThreat(dwarf, threat, state);
  }

  // Moderate bravery - fight if winning
  const threatHpRatio = threat.hp / threat.maxHp;
  if (hpRatio > threatHpRatio) {
    return engageThreat(dwarf, threat, state);
  }

  // Otherwise flee
  return fleeFromThreat(dwarf, state);
}

/**
 * Engage a threat: workFighting attacks in range or moves one step closer
 * via the movement.js system (single mover, see world.js act())
 */
function engageThreat(dwarf, threat, state) {
  dwarf.currentTask = null;
  dwarf.target = { x: threat.x, y: threat.y, entity: threat };
  return workFighting(dwarf, state);
}

/**
 * Flee from combat toward a safe position (moves via movement.js)
 */
function fleeFromThreat(dwarf, state) {
  const safePos = findSafePosition(dwarf, state);
  dwarf.currentTask = null;

  if (safePos) {
    executeSmartMovement(dwarf, state, { targetPos: safePos, avoidSocial: true });
  }

  return {
    state: AI_STATE.FLEEING_COMBAT,
    target: safePos,
  };
}

/**
 * Continue fleeing from combat
 */
function continueFleeing(dwarf, state) {
  // Check if still in danger
  const threat = findNearestThreat(dwarf, state);

  if (!threat || distance(dwarf, threat) > 10) {
    // Safe, return to normal
    dwarf.currentTask = null;
    return findNewTask(dwarf, state);
  }

  // Continue fleeing
  const safePos = findSafePosition(dwarf, state);
  if (safePos) {
    executeSmartMovement(dwarf, state, { targetPos: safePos, avoidSocial: true });
  }

  return {
    state: AI_STATE.FLEEING_COMBAT,
    target: safePos,
  };
}

/**
 * Execute fighting behavior
 */
export function workFighting(dwarf, state) {
  const target = dwarf.target?.entity;

  if (!target || target.hp <= 0 || target.state === 'dead') {
    // Target gone, return to normal
    dwarf.currentTask = null;
    dwarf.target = null;
    return findNewTask(dwarf, state);
  }

  const dist = distance(dwarf, target);

  if (inAttackRange(dwarf, target)) {
    // Attack!
    const result = attemptAttack(dwarf, target, state);

    // Mood boost for defending home
    if (result.success) {
      dwarf.mood = Math.min(100, (dwarf.mood || 50) + 2);
    }

    return {
      state: AI_STATE.FIGHTING,
      target: { x: target.x, y: target.y, entity: target },
    };
  }

  // Move toward target
  executeSmartMovement(dwarf, state, { targetPos: { x: target.x, y: target.y } });

  return {
    state: AI_STATE.FIGHTING,
    target: { x: target.x, y: target.y, entity: target },
  };
}
