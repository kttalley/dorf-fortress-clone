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
} from '../sim/entities.js';

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
    if (weather.dominant) {
      // Determine dominant weather type
      const weatherTypes = ['RAIN', 'SNOW', 'FOG', 'CLOUDS', 'MIST', 'MIASMA', 'SMOKE', 'SPORES'];
      let dominantType = weatherTypes[0];
      let maxIntensity = weather.rain || 0;
      
      for (const type of weatherTypes) {
        const intensity = weather[type.toLowerCase()] || 0;
        if (intensity > maxIntensity) {
          maxIntensity = intensity;
          dominantType = type;
        }
      }
      
      // Apply weather mood effects
      applyWeatherMood(dwarf, dominantType, maxIntensity, state);
      
      // Update fulfillment based on weather
      updateWeatherFulfillment(dwarf, dominantType, maxIntensity, state);
      
      // Track health effects
      const healthEffects = getWeatherHealthEffects(dwarf, dominantType, maxIntensity, state);
      if (healthEffects) {
        dwarf._weatherStress = (dwarf._weatherStress || 0) + healthEffects.stressIncrease;
        if (healthEffects.sicknessProbability > Math.random()) {
          dwarf._sickTicks = (dwarf._sickTicks || 0) + 1;
        }
      }
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
    candidates.push({
      type: TASK_TYPE.FORAGE,
      priority: 60 + (dwarf.hunger - 60),
      target: findNearestFood(dwarf, state),
    });
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
  const food = findNearestFood(dwarf, state);

  if (!food) {
    dwarf.currentTask = null;
    return { state: AI_STATE.WANDERING, target: null };
  }

  const dist = distance(dwarf, food);

  if (dist <= 1) {
    // Eat!
    return { state: AI_STATE.EATING, target: { x: food.x, y: food.y } };
  }

  executeSmartMovement(dwarf, state, { targetPos: { x: food.x, y: food.y }, followScent: true });
  return { state: AI_STATE.SEEKING_FOOD, target: { x: food.x, y: food.y } };
}

// === DECISION HELPERS ===

function decideExplore(dwarf, state, avoidSocial = false) {
  // Pick a direction to explore
  const angle = Math.random() * Math.PI * 2;
  const range = 8 + Math.floor(Math.random() * 10);

  const targetX = Math.floor(dwarf.x + Math.cos(angle) * range);
  const targetY = Math.floor(dwarf.y + Math.sin(angle) * range);

  const x = Math.max(1, Math.min(state.map.width - 2, targetX));
  const y = Math.max(1, Math.min(state.map.height - 2, targetY));

  executeSmartMovement(dwarf, state, {
    targetPos: { x, y },
    exploreBias: true,
    avoidSocial,
  });

  return { state: AI_STATE.EXPLORING, target: { x, y } };
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

  const food = findNearestFood(dwarf, state);

  if (!food) {
    executeSmartMovement(dwarf, state, { followScent: true });
    return { state: AI_STATE.WANDERING, target: null };
  }

  executeSmartMovement(dwarf, state, { targetPos: { x: food.x, y: food.y } });
  return { state: AI_STATE.SEEKING_FOOD, target: { x: food.x, y: food.y } };
}

// === HELPER FUNCTIONS ===

function findNearestFood(dwarf, state) {
  const foods = state.foodSources?.filter(f => f.amount > 0) || [];

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
    const safePos = findSafePosition(dwarf, state);
    dwarf.currentTask = null;
    dwarf.target = safePos;
    return {
      state: AI_STATE.FLEEING_COMBAT,
      target: safePos,
    };
  }

  // Decide based on personality
  // Brave dwarves fight, cowardly flee
  if (bravery > 0.6 || hpRatio > 0.6) {
    // Fight!
    dwarf.currentTask = null;
    dwarf.target = threat;
    return {
      state: AI_STATE.FIGHTING,
      target: { x: threat.x, y: threat.y, entity: threat },
    };
  }

  // Moderate bravery - fight if winning
  const threatHpRatio = threat.hp / threat.maxHp;
  if (hpRatio > threatHpRatio) {
    dwarf.currentTask = null;
    dwarf.target = threat;
    return {
      state: AI_STATE.FIGHTING,
      target: { x: threat.x, y: threat.y, entity: threat },
    };
  }

  // Otherwise flee
  const safePos = findSafePosition(dwarf, state);
  dwarf.currentTask = null;
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
