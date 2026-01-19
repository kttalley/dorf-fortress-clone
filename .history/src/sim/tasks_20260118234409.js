/**
 * Task and Aspiration System
 * Dwarves pursue meaningful work based on their skills and personality
 */

// === TASK TYPES ===
export const TASK_TYPE = {
  // Construction
  DIG: 'dig',                   // Carve into walls
  BUILD: 'build',               // Place structures
  SMOOTH: 'smooth',             // Smooth rough stone

  // Crafting
  CRAFT: 'craft',               // Create items at workshop
  HAUL: 'haul',                 // Move resources

  // Social
  SOCIALIZE: 'socialize',       // Seek conversation
  GATHER: 'gather',             // Group meeting

  // Exploration
  EXPLORE: 'explore',           // Map new areas
  SCOUT: 'scout',               // Check specific location

  // Food Production
  FARM: 'farm',                 // Work on farm
  HUNT: 'hunt',                 // Go hunting
  FISH: 'fish',                 // Fish from water
  BREW: 'brew',                 // Brew at brewery
  GATHER_WILD: 'gather_wild',   // Forage wild plants
  FEAST: 'feast',               // Attend feast in meeting hall

  // Survival (low priority now)
  FORAGE: 'forage',             // Find food
  EAT: 'eat',                   // Consume food

  // Rest
  REST: 'rest',                 // Recover energy
  IDLE: 'idle',                 // Do nothing
};

// === TASK PRIORITIES ===
export const PRIORITY = {
  CRITICAL: 100,    // Life-threatening
  HIGH: 75,         // Important personal need
  NORMAL: 50,       // Regular work
  LOW: 25,          // Nice to have
  IDLE: 0,          // Default
};

// === SKILL TYPES ===
export const SKILL = {
  MINING: 'mining',           // Digging efficiency
  MASONRY: 'masonry',         // Stone construction
  CARPENTRY: 'carpentry',     // Wood construction
  CRAFTING: 'crafting',       // General item creation
  COOKING: 'cooking',         // Food preparation
  SOCIAL: 'social',           // Conversation quality
  EXPLORATION: 'exploration', // Finding new areas
};

// === ASPIRATION TYPES ===
// Long-term goals that drive behavior
export const ASPIRATION = {
  MASTER_CRAFTSMAN: 'master_craftsman',   // Excel at a craft
  ARCHITECT: 'architect',                  // Build grand structures
  EXPLORER: 'explorer',                    // Map the world
  SOCIAL_BUTTERFLY: 'social_butterfly',   // Know everyone
  HERMIT: 'hermit',                        // Find perfect solitude
  LEADER: 'leader',                        // Organize others
};

// === WORKSHOP TYPES ===
export const WORKSHOP = {
  MASON: 'mason',           // Stone crafts
  CARPENTER: 'carpenter',   // Wood crafts
  CRAFTSDWARF: 'craftsdwarf', // General crafts
  KITCHEN: 'kitchen',       // Food preparation
};

// === RESOURCE TYPES ===
export const RESOURCE = {
  STONE: 'stone',
  WOOD: 'wood',
  FOOD: 'food',
  CRAFT_GOODS: 'craft_goods',
};

/**
 * Create a new task
 */
export function createTask(type, target, options = {}) {
  return {
    id: Date.now() + Math.random(),
    type,
    target,           // { x, y } or entity reference
    priority: options.priority || PRIORITY.NORMAL,
    assignee: null,   // Dwarf ID
    progress: 0,      // 0-100
    requiredSkill: options.skill || null,
    requiredResources: options.resources || [],
    createdAt: Date.now(),
    status: 'pending', // 'pending' | 'active' | 'completed' | 'cancelled'
  };
}

/**
 * Generate an aspiration based on personality
 */
export function generateAspiration(personality) {
  const p = personality || {};

  // Weight aspirations by personality
  const weights = [
    { type: ASPIRATION.MASTER_CRAFTSMAN, weight: (p.creativity || 0.5) + (p.patience || 0.5) },
    { type: ASPIRATION.ARCHITECT, weight: (p.creativity || 0.5) + (p.bravery || 0.5) },
    { type: ASPIRATION.EXPLORER, weight: (p.curiosity || 0.5) + (p.bravery || 0.5) },
    { type: ASPIRATION.SOCIAL_BUTTERFLY, weight: (p.friendliness || 0.5) + (p.humor || 0.5) },
    { type: ASPIRATION.HERMIT, weight: (p.melancholy || 0.3) + (1 - (p.friendliness || 0.5)) },
    { type: ASPIRATION.LEADER, weight: (p.bravery || 0.5) + (p.loyalty || 0.5) },
  ];

  // Weighted random selection
  const total = weights.reduce((sum, w) => sum + w.weight, 0);
  let roll = Math.random() * total;

  for (const { type, weight } of weights) {
    roll -= weight;
    if (roll <= 0) return type;
  }

  return ASPIRATION.EXPLORER; // Default
}

/**
 * Generate initial skills based on personality
 */
export function generateSkills(personality) {
  const p = personality || {};
  const skills = {};

  // Base skills with personality influence
  skills[SKILL.MINING] = 0.2 + Math.random() * 0.3 + (p.stubbornness || 0) * 0.2;
  skills[SKILL.MASONRY] = 0.2 + Math.random() * 0.3 + (p.patience || 0) * 0.2;
  skills[SKILL.CARPENTRY] = 0.2 + Math.random() * 0.3 + (p.creativity || 0) * 0.2;
  skills[SKILL.CRAFTING] = 0.2 + Math.random() * 0.3 + (p.creativity || 0) * 0.3;
  skills[SKILL.COOKING] = 0.2 + Math.random() * 0.3 + (p.patience || 0) * 0.2;
  skills[SKILL.SOCIAL] = 0.2 + Math.random() * 0.3 + (p.friendliness || 0) * 0.3;
  skills[SKILL.EXPLORATION] = 0.2 + Math.random() * 0.3 + (p.curiosity || 0) * 0.3;

  // Clamp all to 0-1
  for (const skill of Object.keys(skills)) {
    skills[skill] = Math.min(1, Math.max(0, skills[skill]));
  }

  return skills;
}

/**
 * Calculate task suitability for a dwarf
 * Returns a score 0-100
 */
export function calculateTaskSuitability(dwarf, task) {
  let score = 50;

  // Skill match
  if (task.requiredSkill && dwarf.skills) {
    const skillLevel = dwarf.skills[task.requiredSkill] || 0.3;
    score += skillLevel * 30;
  }

  // Aspiration match
  if (dwarf.aspiration) {
    const aspirationBonus = getAspirationTaskBonus(dwarf.aspiration, task.type);
    score += aspirationBonus;
  }

  // Personality match
  if (dwarf.personality) {
    score += getPersonalityTaskBonus(dwarf.personality, task.type);
  }

  // Distance penalty
  if (task.target && typeof task.target.x === 'number') {
    const dist = Math.abs(dwarf.x - task.target.x) + Math.abs(dwarf.y - task.target.y);
    score -= Math.min(20, dist * 0.5);
  }

  return Math.max(0, Math.min(100, score));
}

function getAspirationTaskBonus(aspiration, taskType) {
  const bonuses = {
    [ASPIRATION.MASTER_CRAFTSMAN]: { [TASK_TYPE.CRAFT]: 20, [TASK_TYPE.SMOOTH]: 10 },
    [ASPIRATION.ARCHITECT]: { [TASK_TYPE.BUILD]: 20, [TASK_TYPE.DIG]: 15 },
    [ASPIRATION.EXPLORER]: { [TASK_TYPE.EXPLORE]: 25, [TASK_TYPE.SCOUT]: 15 },
    [ASPIRATION.SOCIAL_BUTTERFLY]: { [TASK_TYPE.SOCIALIZE]: 25, [TASK_TYPE.GATHER]: 15 },
    [ASPIRATION.HERMIT]: { [TASK_TYPE.DIG]: 15, [TASK_TYPE.CRAFT]: 10 },
    [ASPIRATION.LEADER]: { [TASK_TYPE.GATHER]: 20, [TASK_TYPE.BUILD]: 10 },
  };

  return bonuses[aspiration]?.[taskType] || 0;
}

function getPersonalityTaskBonus(personality, taskType) {
  let bonus = 0;

  switch (taskType) {
    case TASK_TYPE.DIG:
      bonus += (personality.stubbornness || 0) * 10;
      bonus += (personality.bravery || 0) * 5;
      break;
    case TASK_TYPE.BUILD:
      bonus += (personality.creativity || 0) * 10;
      bonus += (personality.patience || 0) * 5;
      break;
    case TASK_TYPE.CRAFT:
      bonus += (personality.creativity || 0) * 15;
      bonus += (personality.patience || 0) * 10;
      break;
    case TASK_TYPE.SOCIALIZE:
      bonus += (personality.friendliness || 0) * 15;
      bonus += (personality.humor || 0) * 10;
      break;
    case TASK_TYPE.EXPLORE:
      bonus += (personality.curiosity || 0) * 15;
      bonus += (personality.bravery || 0) * 10;
      break;
  }

  return bonus;
}

/**
 * Get task description for display/LLM
 */
export function getTaskDescription(task) {
  const descriptions = {
    [TASK_TYPE.DIG]: 'carving stone',
    [TASK_TYPE.BUILD]: 'constructing',
    [TASK_TYPE.SMOOTH]: 'smoothing walls',
    [TASK_TYPE.CRAFT]: 'crafting',
    [TASK_TYPE.HAUL]: 'hauling resources',
    [TASK_TYPE.SOCIALIZE]: 'chatting',
    [TASK_TYPE.GATHER]: 'attending meeting',
    [TASK_TYPE.EXPLORE]: 'exploring',
    [TASK_TYPE.SCOUT]: 'scouting',
    [TASK_TYPE.FORAGE]: 'foraging',
    [TASK_TYPE.EAT]: 'eating',
    [TASK_TYPE.REST]: 'resting',
    [TASK_TYPE.IDLE]: 'relaxing',
  };

  return descriptions[task.type] || 'working';
}

/**
 * Check if a task is complete
 */
export function isTaskComplete(task) {
  return task.progress >= 100 || task.status === 'completed';
}

/**
 * Progress a task based on skill
 */
export function progressTask(task, dwarf, amount = 1) {
  if (!task || task.status === 'completed') return;

  let skillMultiplier = 1;
  if (task.requiredSkill && dwarf.skills) {
    skillMultiplier = 0.5 + (dwarf.skills[task.requiredSkill] || 0.3) * 1.5;
  }

  task.progress = Math.min(100, task.progress + amount * skillMultiplier);

  if (task.progress >= 100) {
    task.status = 'completed';
  }

  // Skill improvement
  if (task.requiredSkill && dwarf.skills && Math.random() < 0.1) {
    dwarf.skills[task.requiredSkill] = Math.min(1,
      (dwarf.skills[task.requiredSkill] || 0.2) + 0.01
    );
  }
}
