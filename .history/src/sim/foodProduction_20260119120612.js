/**
 * Food Production System
 * Farming, hunting, fishing, and brewing to provide abundant food
 * No death from hunger - food production keeps colony fed
 */

import { nextId, distance, getDisplayName } from './entities.js';
import { SKILL } from './tasks.js';
import { addLog } from '../state/store.js';

// === FOOD PRODUCTION TYPES ===
export const PRODUCTION_TYPE = {
  FARMING: 'farming',        // Plant and harvest crops
  HUNTING: 'hunting',        // Hunt wild animals
  FISHING: 'fishing',        // Fish from water
  BREWING: 'brewing',        // Ferment plants into alcohol (counts as food)
  GATHERING: 'gathering',    // Forage wild plants (passive)
};

// === PRODUCTION RATES ===
// How much food each activity produces per tick when worked on
export const PRODUCTION_RATES = {
  [PRODUCTION_TYPE.FARMING]: {
    foodPerTick: 0.5,      // Crops yield regular food
    skillBonus: 0.1,       // +10% per skill level
    setupTime: 50,         // Ticks to establish a farm
    yield: 20,             // Food produced when farm matures
    skill: SKILL.MINING,   // Farming uses similar skills
  },
  [PRODUCTION_TYPE.HUNTING]: {
    foodPerTick: 0.3,      // Hunting yields meat
    skillBonus: 0.15,
    setupTime: 0,          // No setup - just go hunt
    yield: 15,
    skill: SKILL.EXPLORATION,
  },
  [PRODUCTION_TYPE.FISHING]: {
    foodPerTick: 0.4,      // Fishing yields fish
    skillBonus: 0.12,
    setupTime: 30,         // Set up fishing spot
    yield: 18,
    skill: SKILL.EXPLORATION,
  },
  [PRODUCTION_TYPE.BREWING]: {
    foodPerTick: 0.2,      // Brewing is slow but converts base food
    skillBonus: 0.08,
    setupTime: 20,
    yield: 25,             // Higher yield - conversion magic
    skill: SKILL.CRAFTING,
  },
  [PRODUCTION_TYPE.GATHERING]: {
    foodPerTick: 0.25,     // Passive gathering
    skillBonus: 0.05,
    setupTime: 0,
    yield: 8,
    skill: SKILL.EXPLORATION,
  },
};

// === PRODUCTION SITE ===
/**
 * Create a food production site (farm, fishing spot, hunting ground, etc.)
 */
export function createProductionSite(x, y, type, assignedDwarves = []) {
  return {
    id: nextId(),
    type,
    x,
    y,
    status: 'setup',        // 'setup' → 'active' → 'mature' → 'depleted'
    progress: 0,            // 0-100 setup progress
    foodStored: 0,          // Food accumulated at site
    assignedDwarves,        // Array of dwarf IDs assigned
    createdAt: Date.now(),
    lastHarvestedTick: 0,
  };
}

/**
 * Work on a production site (setup phase)
 */
export function workOnProduction(site, dwarf, state) {
  if (!site || site.status === 'depleted') return false;

  const config = PRODUCTION_RATES[site.type];
  if (!config) return false;

  // Setup phase
  if (site.status === 'setup') {
    const skillLevel = dwarf.skills?.[config.skill] || 0.3;
    const workDone = 1 + skillLevel * 2;
    site.progress += workDone;

    if (site.progress >= config.setupTime) {
      site.status = 'active';
      site.progress = 0;
      addLog(state, `${dwarf.name} established a ${site.type} production site at (${site.x}, ${site.y}).`);
      return true;
    }
  }

  // Active production
  if (site.status === 'active' || site.status === 'mature') {
    const skillLevel = dwarf.skills?.[config.skill] || 0.3;
    const baseProduction = config.foodPerTick * (1 + skillLevel * config.skillBonus);
    
    site.foodStored += baseProduction;

    // Skill improvement
    if (Math.random() < 0.05) {
      dwarf.skills[config.skill] = Math.min(1, dwarf.skills[config.skill] + 0.01);
    }

    // Move to mature after 100 ticks of production
    if (state.tick - site.lastHarvestedTick > 100) {
      site.status = 'mature';
    }

    return true;
  }

  return false;
}

/**
 * Harvest food from a production site
 */
export function harvestProduction(site, state) {
  if (site.foodStored <= 0) return 0;

  const harvested = Math.floor(site.foodStored);
  site.foodStored -= harvested;
  site.lastHarvestedTick = state.tick;

  // Deplete after a while (unless breeding/growing)
  if (site.status === 'mature' && Math.random() < 0.02) {
    site.status = 'active'; // Reset for next cycle
  }

  return harvested;
}

/**
 * Get all production sites of a type
 */
export function getProductionSitesByType(sites, type) {
  return sites.filter(s => s.type === type && s.status !== 'depleted');
}

/**
 * Update production sites each tick
 */
export function updateProduction(state) {
  if (!state.productionSites) {
    state.productionSites = [];
  }

  // Passive production for mature sites
  for (const site of state.productionSites) {
    if (site.status === 'mature') {
      const config = PRODUCTION_RATES[site.type];
      // Mature sites produce slowly without worker
      site.foodStored += config.foodPerTick * 0.3;
    }
  }
}

/**
 * Create a feast from stored food
 */
export function createFeast(meetingHall, state) {
  if (!state.productionSites) return null;

  let totalFood = 0;
  for (const site of state.productionSites) {
    totalFood += Math.floor(site.foodStored);
  }

  if (totalFood < 10) return null; // Need at least 10 servings

  // Harvest from all sites
  const feastFood = [];
  for (const site of state.productionSites) {
    const harvested = harvestProduction(site, state);
    if (harvested > 0) {
      feastFood.push({ type: site.type, amount: harvested });
    }
  }

  return {
    id: nextId(),
    location: { x: meetingHall.x, y: meetingHall.y },
    food: feastFood,
    totalServings: totalFood,
    participants: [],
    tick: state.tick,
    duration: 30, // Ticks
  };
}

/**
 * Process a feast - dwarves eat and satisfy social needs
 */
export function processFeast(feast, dwarf, state) {
  if (!feast || feast.duration <= 0) return false;

  // Reduce hunger significantly
  dwarf.hunger = Math.max(0, dwarf.hunger - 50);

  // Satisfy social fulfillment
  if (dwarf.fulfillment) {
    dwarf.fulfillment.social = Math.min(100, dwarf.fulfillment.social + 40);
  }

  // Boost mood
  if (dwarf.mood !== undefined) {
    dwarf.mood = Math.min(100, dwarf.mood + 20);
  }

  // Record memory
  if (dwarf.memory) {
    dwarf.memory.significantEvents = dwarf.memory.significantEvents || [];
    dwarf.memory.significantEvents.push({
      content: 'Attended a great feast with the colony',
      tick: state.tick,
    });
  }

  feast.participants.push(dwarf.id);
  return true;
}
