/**
 * Crafting System
 * Dwarves create items at workshops, building their skills and reputation
 */

import { SKILL, TASK_TYPE, createTask, PRIORITY } from './tasks.js';
import { STRUCTURE_TYPE, getWorkshops } from './construction.js';

// === CRAFT CATEGORIES ===
export const CRAFT_CATEGORY = {
  STONEWORK: 'stonework',
  WOODWORK: 'woodwork',
  GOODS: 'goods',
  FOOD: 'food',
};

// === CRAFT RECIPES ===
export const RECIPES = {
  // Stonework (Mason)
  stone_block: {
    name: 'Stone Block',
    category: CRAFT_CATEGORY.STONEWORK,
    workshop: STRUCTURE_TYPE.WORKSHOP_MASON,
    skill: SKILL.MASONRY,
    materials: [{ type: 'stone', amount: 1 }],
    workAmount: 15,
    output: { type: 'stone_block', amount: 4 },
  },
  stone_furniture: {
    name: 'Stone Furniture',
    category: CRAFT_CATEGORY.STONEWORK,
    workshop: STRUCTURE_TYPE.WORKSHOP_MASON,
    skill: SKILL.MASONRY,
    materials: [{ type: 'stone', amount: 2 }],
    workAmount: 25,
    output: { type: 'furniture', amount: 1, material: 'stone' },
  },
  stone_crafts: {
    name: 'Stone Crafts',
    category: CRAFT_CATEGORY.STONEWORK,
    workshop: STRUCTURE_TYPE.WORKSHOP_MASON,
    skill: SKILL.MASONRY,
    materials: [{ type: 'stone', amount: 1 }],
    workAmount: 20,
    output: { type: 'craft_goods', amount: 2, material: 'stone' },
  },

  // Woodwork (Carpenter)
  wooden_furniture: {
    name: 'Wooden Furniture',
    category: CRAFT_CATEGORY.WOODWORK,
    workshop: STRUCTURE_TYPE.WORKSHOP_CARPENTER,
    skill: SKILL.CARPENTRY,
    materials: [{ type: 'wood', amount: 2 }],
    workAmount: 20,
    output: { type: 'furniture', amount: 1, material: 'wood' },
  },
  wooden_crafts: {
    name: 'Wooden Crafts',
    category: CRAFT_CATEGORY.WOODWORK,
    workshop: STRUCTURE_TYPE.WORKSHOP_CARPENTER,
    skill: SKILL.CARPENTRY,
    materials: [{ type: 'wood', amount: 1 }],
    workAmount: 15,
    output: { type: 'craft_goods', amount: 2, material: 'wood' },
  },

  // General Crafts (Craftsdwarf)
  trinkets: {
    name: 'Trinkets',
    category: CRAFT_CATEGORY.GOODS,
    workshop: STRUCTURE_TYPE.WORKSHOP_CRAFTSDWARF,
    skill: SKILL.CRAFTING,
    materials: [{ type: 'stone', amount: 1 }],
    workAmount: 12,
    output: { type: 'trinket', amount: 3 },
  },
  figurine: {
    name: 'Figurine',
    category: CRAFT_CATEGORY.GOODS,
    workshop: STRUCTURE_TYPE.WORKSHOP_CRAFTSDWARF,
    skill: SKILL.CRAFTING,
    materials: [{ type: 'stone', amount: 1 }],
    workAmount: 25,
    output: { type: 'figurine', amount: 1 },
    quality: true, // Can be masterwork
  },

  // Food (Kitchen)
  prepared_meal: {
    name: 'Prepared Meal',
    category: CRAFT_CATEGORY.FOOD,
    workshop: STRUCTURE_TYPE.WORKSHOP_KITCHEN,
    skill: SKILL.COOKING,
    materials: [{ type: 'food', amount: 2 }],
    workAmount: 10,
    output: { type: 'meal', amount: 3 },
  },
};

// === QUALITY LEVELS ===
export const QUALITY = {
  POOR: { name: 'poor', multiplier: 0.5, symbol: '-' },
  NORMAL: { name: 'normal', multiplier: 1.0, symbol: '' },
  FINE: { name: 'fine', multiplier: 1.5, symbol: '+' },
  SUPERIOR: { name: 'superior', multiplier: 2.0, symbol: '*' },
  EXCEPTIONAL: { name: 'exceptional', multiplier: 3.0, symbol: '☆' },
  MASTERWORK: { name: 'masterwork', multiplier: 5.0, symbol: '★' },
};

// === CRAFTED ITEMS STORAGE ===
let craftedItems = [];
let craftingJobs = [];

/**
 * Initialize crafting system
 */
export function initCrafting() {
  craftedItems = [];
  craftingJobs = [];
}

/**
 * Get available recipes for a workshop type
 */
export function getRecipesForWorkshop(workshopType) {
  return Object.entries(RECIPES)
    .filter(([id, recipe]) => recipe.workshop === workshopType)
    .map(([id, recipe]) => ({ id, ...recipe }));
}

/**
 * Check if a recipe can be crafted
 */
export function canCraftRecipe(recipeId, state) {
  const recipe = RECIPES[recipeId];
  if (!recipe) return false;

  // Check for workshop
  const workshops = getWorkshops(recipe.workshop);
  if (workshops.length === 0) return false;

  // Check for materials
  for (const mat of recipe.materials) {
    const available = countResource(mat.type, state);
    if (available < mat.amount) return false;
  }

  return true;
}

/**
 * Create a crafting job
 */
export function createCraftingJob(recipeId, workshopId, state) {
  const recipe = RECIPES[recipeId];
  if (!recipe) return null;

  const workshops = getWorkshops(recipe.workshop);
  const workshop = workshops.find(w => w.id === workshopId) || workshops[0];

  if (!workshop) return null;

  const job = {
    id: Date.now() + Math.random(),
    recipeId,
    recipe,
    workshopId: workshop.id,
    workshop,
    progress: 0,
    assignee: null,
    status: 'pending',
    materialsReserved: false,
  };

  craftingJobs.push(job);

  return createTask(TASK_TYPE.CRAFT, { job, workshop }, {
    priority: PRIORITY.NORMAL,
    skill: recipe.skill,
    resources: recipe.materials,
  });
}

/**
 * Work on a crafting job
 */
export function workOnCrafting(job, dwarf, state) {
  if (!job || job.status === 'completed') return null;

  // Reserve materials if not done
  if (!job.materialsReserved) {
    for (const mat of job.recipe.materials) {
      if (!consumeResource(mat.type, mat.amount, state)) {
        return null; // Can't craft - missing materials
      }
    }
    job.materialsReserved = true;
  }

  // Calculate work based on skill
  const skill = dwarf.skills?.[job.recipe.skill] || 0.3;
  const workDone = 1 + skill * 2;

  job.progress += workDone;

  if (job.progress >= job.recipe.workAmount) {
    // Craft complete!
    job.status = 'completed';

    // Determine quality
    const quality = determineQuality(dwarf, job.recipe);

    // Create item
    const item = createItem(job.recipe.output, quality, dwarf);
    craftedItems.push(item);

    // Skill improvement
    if (dwarf.skills && Math.random() < 0.2) {
      dwarf.skills[job.recipe.skill] = Math.min(1,
        (dwarf.skills[job.recipe.skill] || 0.2) + 0.02
      );
    }

    // Mood boost from crafting
    dwarf.mood = Math.min(100, (dwarf.mood || 50) + 5 + quality.multiplier);

    // Remove from jobs
    const idx = craftingJobs.indexOf(job);
    if (idx !== -1) craftingJobs.splice(idx, 1);

    return item;
  }

  return null;
}

/**
 * Determine quality of crafted item
 */
function determineQuality(dwarf, recipe) {
  const skill = dwarf.skills?.[recipe.skill] || 0.3;
  const creativity = dwarf.personality?.creativity || 0.5;
  const patience = dwarf.personality?.patience || 0.5;

  // Base roll + skill bonus + personality bonus
  const roll = Math.random() + skill * 0.3 + creativity * 0.1 + patience * 0.1;

  if (roll > 1.3) return QUALITY.MASTERWORK;
  if (roll > 1.1) return QUALITY.EXCEPTIONAL;
  if (roll > 0.9) return QUALITY.SUPERIOR;
  if (roll > 0.6) return QUALITY.FINE;
  if (roll > 0.3) return QUALITY.NORMAL;
  return QUALITY.POOR;
}

/**
 * Create a crafted item
 */
function createItem(output, quality, crafter) {
  return {
    id: Date.now() + Math.random(),
    type: output.type,
    amount: output.amount,
    material: output.material || null,
    quality,
    crafterId: crafter.id,
    crafterName: crafter.name,
    createdAt: Date.now(),
  };
}

/**
 * Get pending crafting jobs
 */
export function getPendingCraftingJobs() {
  return craftingJobs.filter(j => j.status === 'pending');
}

/**
 * Get all crafted items
 */
export function getCraftedItems() {
  return craftedItems;
}

/**
 * Count resource in world
 */
function countResource(type, state) {
  if (!state.resources) return 0;
  return state.resources
    .filter(r => r.type === type)
    .reduce((sum, r) => sum + r.amount, 0);
}

/**
 * Consume resource from world
 */
function consumeResource(type, amount, state) {
  if (!state.resources) return false;

  let remaining = amount;

  for (const resource of state.resources) {
    if (resource.type !== type) continue;

    const take = Math.min(remaining, resource.amount);
    resource.amount -= take;
    remaining -= take;

    if (remaining <= 0) break;
  }

  // Clean up empty resources
  state.resources = state.resources.filter(r => r.amount > 0);

  return remaining <= 0;
}

/**
 * Find best crafting job for a dwarf
 */
export function findBestCraftingJob(dwarf) {
  const pendingJobs = getPendingCraftingJobs();

  let bestJob = null;
  let bestScore = -Infinity;

  for (const job of pendingJobs) {
    if (job.assignee && job.assignee !== dwarf.id) continue;

    // Score based on skill match and distance
    const skill = dwarf.skills?.[job.recipe.skill] || 0.3;
    const dist = Math.abs(dwarf.x - job.workshop.x) + Math.abs(dwarf.y - job.workshop.y);

    const score = skill * 50 - dist;

    if (score > bestScore) {
      bestScore = score;
      bestJob = job;
    }
  }

  return bestJob;
}

/**
 * Get description of item quality
 */
export function getQualityDescription(item) {
  const q = item.quality || QUALITY.NORMAL;
  if (q === QUALITY.MASTERWORK) {
    return `masterwork ${item.type} by ${item.crafterName}`;
  }
  if (q === QUALITY.EXCEPTIONAL) {
    return `exceptional ${item.type}`;
  }
  if (q.name !== 'normal') {
    return `${q.name} ${item.type}`;
  }
  return item.type;
}
