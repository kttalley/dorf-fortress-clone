/**
 * Entity utilities
 * Dwarves with personality, skills, aspirations, and fulfillment needs
 */

import { generateSkills, generateAspiration } from './tasks.js';
import { requestNameBio, generateNameBioSync } from '../llm/nameGenerator.js';

// === ENTITY TYPES ===
export const ENTITY_TYPES = {
  DWARF: 'dwarf',
  FOOD: 'food',
  RESOURCE: 'resource',
};

// === HUNGER CONSTANTS ===
// Hunger goes 0 (full) → 95 (capped, never lethal)
// Dwarves are sustained by food production system
export const HUNGER_SEEK_THRESHOLD = 60;  // Start seeking food (raised - less urgent)
export const HUNGER_CRITICAL = 85;        // Desperate, bad decisions (raised)
export const HUNGER_DEATH = 100;          // Hard cap - prevents death from hunger
export const HUNGER_CAP = 95;              // Soft cap - hunger never exceeds this in practice

// === FULFILLMENT SYSTEM ===
// Dwarves seek fulfillment based on their personality traits
// Each need decays over time and is satisfied by different activities
export const FULFILLMENT_NEEDS = {
  social: { decayRate: 0.3, satisfyAmount: 25 },      // Satisfied by conversations
  exploration: { decayRate: 0.2, satisfyAmount: 15 }, // Satisfied by visiting new areas
  creativity: { decayRate: 0.15, satisfyAmount: 20 }, // Satisfied by crafting/building (future)
  tranquility: { decayRate: 0.1, satisfyAmount: 30 }, // Satisfied by peaceful moments
};

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
 * Generate initial fulfillment levels based on personality
 * Higher trait values = higher need for that fulfillment type
 */
function generateFulfillment(personality) {
  return {
    social: 50 + (personality.friendliness > 0.6 ? 20 : 0),      // Friendly dwarves start needing social
    exploration: 50 + (personality.curiosity > 0.6 ? 20 : 0),    // Curious dwarves want to explore
    creativity: 50 + (personality.creativity > 0.6 ? 20 : 0),    // Creative dwarves need outlet
    tranquility: 50 + (personality.melancholy > 0.5 ? 20 : 0),   // Melancholic need peace
  };
}

/**
 * Create a new dwarf entity with personality, skills, aspirations, and fulfillment
 */
export function createDwarf(x, y, name = null) {
  const id = nextId();
  const personality = generatePersonality();

  const dwarf = {
    type: ENTITY_TYPES.DWARF,
    id,
    name: name || nextDwarfName(),  // Fallback name until LLM generates
    x,
    y,

    // Vital stats
    hunger: 0,           // 0 = full, 100 = death
    mood: 70 + Math.floor(Math.random() * 30),  // 0-100, starts happy
    energy: 100,         // For future use

    // Fulfillment needs (0 = unfulfilled, 100 = fully satisfied)
    fulfillment: generateFulfillment(personality),

    // Skills (0.0-1.0, improve with practice)
    skills: generateSkills(personality),

    // Long-term aspiration (drives behavior)
    aspiration: generateAspiration(personality),

    // Current task
    currentTask: null,
    taskQueue: [],

    // Movement state
    momentum: { dx: 0, dy: 0 },

    // Behavioral state
    state: 'idle',
    target: null,

    // Personality (permanent traits, 0.0-1.0)
    personality,

    // Relationships with other dwarves
    relationships: {},

    // Memory of recent events (for LLM context)
    memory: {
      recentThoughts: [],
      recentConversations: [],
      significantEvents: [],
      visitedAreas: new Set(),
      craftedItems: [],        // Items this dwarf has made
    },

    // Current mental state
    currentThought: null,
    lastThoughtTick: 0,

    // Social state
    conversationPartner: null,
    lastSocialTick: 0,

    // Work stats
    itemsCrafted: 0,
    tilesDigged: 0,
    masterworkCount: 0,

    // LLM-generated identity (populated async)
    llm: null,
    generatedName: null,
    generatedBio: null,
  };

  // Generate name/bio immediately with local fallback (sync)
  // This ensures dwarf always has a flavorful name right away
  generateNameBioSync(dwarf);

  // LLM generation will be called batch-wise after all dwarves are spawned
  // (see main.js regenerateWorld -> init -> waitForBatchNameGeneration)

  return dwarf;
}

/**
 * Get dwarf's display name (prefers generated name over fallback)
 * @param {object} dwarf
 * @returns {string}
 */
export function getDisplayName(dwarf) {
  return dwarf.generatedName || dwarf.name;
}

/**
 * Get dwarf's bio for display
 * @param {object} dwarf
 * @returns {string}
 */
export function getDisplayBio(dwarf) {
  return dwarf.generatedBio || 'A dwarf of quiet determination.';
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
 * Dwarves no longer die from hunger - food production keeps them alive
 */
export function isStarved(dwarf) {
  // Never true - hunger is capped and non-lethal
  return false;
}

// === FULFILLMENT SYSTEM FUNCTIONS ===

/**
 * Apply fulfillment decay based on personality
 * Called each tick - fulfillment slowly decreases
 */
export function applyFulfillmentDecay(dwarf) {
  if (!dwarf.fulfillment) return;

  const p = dwarf.personality || {};

  // Decay rates modified by personality
  dwarf.fulfillment.social = Math.max(0, dwarf.fulfillment.social -
    FULFILLMENT_NEEDS.social.decayRate * (p.friendliness > 0.6 ? 1.5 : 1));

  dwarf.fulfillment.exploration = Math.max(0, dwarf.fulfillment.exploration -
    FULFILLMENT_NEEDS.exploration.decayRate * (p.curiosity > 0.6 ? 1.5 : 1));

  dwarf.fulfillment.creativity = Math.max(0, dwarf.fulfillment.creativity -
    FULFILLMENT_NEEDS.creativity.decayRate * (p.creativity > 0.6 ? 1.5 : 1));

  dwarf.fulfillment.tranquility = Math.max(0, dwarf.fulfillment.tranquility -
    FULFILLMENT_NEEDS.tranquility.decayRate * (p.melancholy > 0.5 ? 1.5 : 1));
}

/**
 * Satisfy a fulfillment need
 * @param {object} dwarf
 * @param {string} needType - 'social' | 'exploration' | 'creativity' | 'tranquility'
 * @param {number} multiplier - Optional multiplier for satisfaction amount
 */
export function satisfyFulfillment(dwarf, needType, multiplier = 1) {
  if (!dwarf.fulfillment || !FULFILLMENT_NEEDS[needType]) return;

  const amount = FULFILLMENT_NEEDS[needType].satisfyAmount * multiplier;
  dwarf.fulfillment[needType] = Math.min(100, dwarf.fulfillment[needType] + amount);

  // Fulfillment boosts mood
  adjustMood(dwarf, Math.floor(amount * 0.3), `fulfilled ${needType}`);
}

/**
 * Get the dwarf's most pressing unfulfilled need
 * Returns the need type with lowest fulfillment, weighted by personality
 * @param {object} dwarf
 * @returns {{ type: string, urgency: number } | null}
 */
export function getMostPressingNeed(dwarf) {
  if (!dwarf.fulfillment || !dwarf.personality) return null;

  const p = dwarf.personality;
  const f = dwarf.fulfillment;

  // Calculate urgency for each need (lower fulfillment + higher trait = more urgent)
  const needs = [
    { type: 'social', urgency: (100 - f.social) * (0.5 + p.friendliness) },
    { type: 'exploration', urgency: (100 - f.exploration) * (0.5 + p.curiosity) },
    { type: 'creativity', urgency: (100 - f.creativity) * (0.5 + p.creativity) },
    { type: 'tranquility', urgency: (100 - f.tranquility) * (0.5 + (p.melancholy || 0.3)) },
  ];

  // Sort by urgency, return highest
  needs.sort((a, b) => b.urgency - a.urgency);

  // Only return if urgency is significant
  if (needs[0].urgency > 30) {
    return needs[0];
  }

  return null;
}

/**
 * Check if dwarf needs social interaction
 * @param {object} dwarf
 * @returns {boolean}
 */
export function needsSocial(dwarf) {
  if (!dwarf.fulfillment) return false;
  const threshold = dwarf.personality?.friendliness > 0.6 ? 50 : 35;
  return dwarf.fulfillment.social < threshold;
}

/**
 * Check if dwarf wants to explore
 * @param {object} dwarf
 * @returns {boolean}
 */
export function needsExploration(dwarf) {
  if (!dwarf.fulfillment) return false;
  const threshold = dwarf.personality?.curiosity > 0.6 ? 50 : 35;
  return dwarf.fulfillment.exploration < threshold;
}

// === BATCH LLM NAME GENERATION ===

import { waitForBatchNameGeneration } from '../llm/nameGenerator.js';

/**
 * Batch-generate names and bios for an array of dwarves using LLM
 * Updates each dwarf in place (generatedName, generatedBio)
 * Falls back to local names if LLM fails
 * @param {Array} dwarves
 */
export async function generateNamesAndBios(dwarves) {
  if (!dwarves || dwarves.length === 0) return;

  try {
    await waitForBatchNameGeneration(dwarves);
  } catch (err) {
    console.warn('LLM batch name generation failed, using local names:', err);

    // fallback: assign local names/bios if something goes wrong
    for (const dwarf of dwarves) {
      dwarf.generatedName = dwarf.generatedName || nextDwarfName();
      dwarf.generatedBio = dwarf.generatedBio || 'A dwarf of quiet determination.';
    }
  }
}