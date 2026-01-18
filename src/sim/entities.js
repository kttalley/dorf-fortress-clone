/**
 * Entity utilities for v0.1
 * Dwarves and food sources
 */

// === ENTITY TYPES ===
export const ENTITY_TYPES = {
  DWARF: 'dwarf',
  FOOD: 'food',
};

// === HUNGER CONSTANTS ===
// Hunger goes 0 (full) → 100 (death)
export const HUNGER_SEEK_THRESHOLD = 50;  // Start seeking food
export const HUNGER_CRITICAL = 75;        // Desperate, bad decisions
export const HUNGER_DEATH = 100;          // Death threshold

// Dwarf names pool (deterministic variety)
const DWARF_NAMES = [
  'Urist', 'Bomrek', 'Fikod', 'Kadol', 'Morul',
  'Thikut', 'Zefon', 'Datan', 'Erith', 'Aban',
  'Lokum', 'Ingiz', 'Asob', 'Eshtan', 'Dodok',
  'Rigoth', 'Litast', 'Sibrek', 'Zasit', 'Tholtig'
];

// Personality trait names for generation
const PERSONALITY_TRAITS = [
  'curiosity', 'friendliness', 'bravery', 'humor', 'melancholy',
  'patience', 'creativity', 'loyalty', 'stubbornness', 'optimism'
];

let nameIndex = 0;
let idCounter = 0;

/**
 * Generate next dwarf name (cycles through pool)
 */
export function nextDwarfName() {
  const name = DWARF_NAMES[nameIndex % DWARF_NAMES.length];
  nameIndex++;
  return name;
}

/**
 * Generate next unique ID
 */
export function nextId() {
  return idCounter++;
}

/**
 * Reset ID counter (for testing)
 */
export function resetIds() {
  idCounter = 0;
  nameIndex = 0;
}

/**
 * Manhattan distance between two points
 */
export function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

/**
 * Check if entity is at position
 */
export function isAt(entity, x, y) {
  return entity.x === x && entity.y === y;
}

// === ENTITY FACTORIES ===

/**
 * Generate random personality traits
 * Each trait is 0.0-1.0
 */
function generatePersonality() {
  const personality = {};
  for (const trait of PERSONALITY_TRAITS) {
    // Weighted toward middle with some variance
    personality[trait] = 0.3 + Math.random() * 0.4 + (Math.random() > 0.7 ? Math.random() * 0.3 : 0);
  }
  return personality;
}

/**
 * Create a new dwarf entity with personality, relationships, and memory
 */
export function createDwarf(x, y, name = null) {
  const id = nextId();

  return {
    type: ENTITY_TYPES.DWARF,
    id,
    name: name || nextDwarfName(),
    x,
    y,

    // Vital stats
    hunger: 0,           // 0 = full, 100 = death
    mood: 70 + Math.floor(Math.random() * 30),  // 0-100, starts happy
    energy: 100,         // For future use

    // Behavioral state
    state: 'idle',       // 'idle' | 'wandering' | 'seeking_food' | 'eating' | 'socializing'
    target: null,        // {x, y} movement target

    // Personality (permanent traits, 0.0-1.0)
    personality: generatePersonality(),

    // Relationships with other dwarves
    // { [dwarfId]: { affinity: -100 to 100, interactions: count, lastInteraction: tick } }
    relationships: {},

    // Memory of recent events (for LLM context)
    memory: {
      recentThoughts: [],     // Last 5 thoughts
      recentConversations: [], // Last 3 conversations
      significantEvents: [],   // Important life events
    },

    // Current mental state (updated by thought system)
    currentThought: null,
    lastThoughtTick: 0,

    // Social state
    conversationPartner: null,  // id of dwarf currently talking to
    lastSocialTick: 0,
  };
}

/**
 * Get a dwarf's dominant personality traits (for display/LLM)
 * @param {object} dwarf
 * @returns {Array<string>} Top 3 traits
 */
export function getDominantTraits(dwarf) {
  if (!dwarf.personality) return ['average'];

  const sorted = Object.entries(dwarf.personality)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .filter(([trait, value]) => value > 0.6)
    .map(([trait]) => trait);

  return sorted.length > 0 ? sorted : ['balanced'];
}

/**
 * Add a memory to a dwarf
 * @param {object} dwarf
 * @param {string} type - 'thought' | 'conversation' | 'event'
 * @param {any} content
 * @param {number} tick
 */
export function addMemory(dwarf, type, content, tick) {
  if (!dwarf.memory) {
    dwarf.memory = { recentThoughts: [], recentConversations: [], significantEvents: [] };
  }

  switch (type) {
    case 'thought':
      dwarf.memory.recentThoughts.push({ content, tick });
      if (dwarf.memory.recentThoughts.length > 5) {
        dwarf.memory.recentThoughts.shift();
      }
      break;
    case 'conversation':
      dwarf.memory.recentConversations.push({ content, tick });
      if (dwarf.memory.recentConversations.length > 3) {
        dwarf.memory.recentConversations.shift();
      }
      break;
    case 'event':
      dwarf.memory.significantEvents.push({ content, tick });
      if (dwarf.memory.significantEvents.length > 10) {
        dwarf.memory.significantEvents.shift();
      }
      break;
  }
}

/**
 * Update mood based on various factors
 * @param {object} dwarf
 * @param {number} delta - Change in mood (-100 to 100)
 * @param {string} reason - Optional reason for logging
 */
export function adjustMood(dwarf, delta, reason = null) {
  const oldMood = dwarf.mood;
  dwarf.mood = Math.max(0, Math.min(100, dwarf.mood + delta));

  // Personality affects mood resilience
  if (dwarf.personality) {
    if (dwarf.personality.optimism > 0.7 && delta < 0) {
      // Optimists recover faster from negative events
      dwarf.mood += Math.abs(delta) * 0.2;
    }
    if (dwarf.personality.melancholy > 0.7 && delta > 0) {
      // Melancholic dwarves don't get as happy
      dwarf.mood -= delta * 0.2;
    }
  }

  dwarf.mood = Math.max(0, Math.min(100, dwarf.mood));
}

/**
 * Create a food source (e.g., berry bush)
 */
export function createFoodSource(x, y, amount = 10) {
  return {
    type: ENTITY_TYPES.FOOD,
    id: nextId(),
    x,
    y,
    amount,  // Servings remaining
  };
}

// === DWARF STATE CHECKS ===

/**
 * Is dwarf hungry enough to seek food?
 */
export function isHungry(dwarf) {
  return dwarf.hunger >= HUNGER_SEEK_THRESHOLD;
}

/**
 * Is dwarf critically hungry (makes bad decisions)?
 */
export function isCritical(dwarf) {
  return dwarf.hunger >= HUNGER_CRITICAL;
}

/**
 * Is dwarf dead from starvation?
 */
export function isStarved(dwarf) {
  return dwarf.hunger >= HUNGER_DEATH;
}
