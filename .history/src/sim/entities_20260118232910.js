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
// Hunger goes 0 (full) → 100 (death)
export const HUNGER_SEEK_THRESHOLD = 60;  // Start seeking food (raised - less urgent)
export const HUNGER_CRITICAL = 85;        // Desperate, bad decisions (raised)
export const HUNGER_DEATH = 100;          // Death threshold

// === FULFILLMENT SYSTEM ===
// Dwarves seek fulfillment based on their personality traits
// Each need decays over time and is satisfied by different activities
export const FULFILLMENT_NEEDS = {
  social: { decayRate: 0.3, satisfyAmount: 25 },
  exploration: { decayRate: 0.2, satisfyAmount: 15 },
  creativity: { decayRate: 0.15, satisfyAmount: 20 },
  tranquility: { decayRate: 0.1, satisfyAmount: 30 },
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

function generatePersonality() {
  const personality = {};
  for (const trait of PERSONALITY_TRAITS) {
    personality[trait] =
      0.3 +
      Math.random() * 0.4 +
      (Math.random() > 0.7 ? Math.random() * 0.3 : 0);
  }
  return personality;
}

function generateFulfillment(personality) {
  return {
    social: 50 + (personality.friendliness > 0.6 ? 20 : 0),
    exploration: 50 + (personality.curiosity > 0.6 ? 20 : 0),
    creativity: 50 + (personality.creativity > 0.6 ? 20 : 0),
    tranquility: 50 + (personality.melancholy > 0.5 ? 20 : 0),
  };
}

export function createDwarf(x, y, name = null) {
  const id = nextId();
  const personality = generatePersonality();

  const dwarf = {
    type: ENTITY_TYPES.DWARF,
    id,
    name: name || nextDwarfName(),
    x,
    y,

    hunger: 0,
    mood: 70 + Math.floor(Math.random() * 30),
    energy: 100,

    fulfillment: generateFulfillment(personality),
    skills: generateSkills(personality),
    aspiration: generateAspiration(personality),

    currentTask: null,
    taskQueue: [],

    momentum: { dx: 0, dy: 0 },

    state: 'idle',
    target: null,

    personality,
    relationships: {},

    memory: {
      recentThoughts: [],
      recentConversations: [],
      significantEvents: [],
      visitedAreas: new Set(),
      craftedItems: [],
    },

    currentThought: null,
    lastThoughtTick: 0,

    conversationPartner: null,
    lastSocialTick: 0,

    itemsCrafted: 0,
    tilesDigged: 0,
    masterworkCount: 0,

    llm: null,
    generatedName: null,
    generatedBio: null,
  };

  generateNameBioSync(dwarf);

  requestNameBio(dwarf).catch(() => {});

  return dwarf;
}

export function getDisplayName(dwarf) {
  return dwarf.generatedName || dwarf.name;
}

export function getDisplayBio(dwarf) {
  return dwarf.generatedBio || 'A dwarf of quiet determination.';
}

export function getDominantTraits(dwarf) {
  if (!dwarf.personality) return ['average'];

  const sorted = Object.entries(dwarf.personality)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .filter(([_, value]) => value > 0.6)
    .map(([trait]) => trait);

  return sorted.length > 0 ? sorted : ['balanced'];
}

export function addMemory(dwarf, type, content, tick) {
  if (!dwarf.memory) {
    dwarf.memory = {
      recentThoughts: [],
      recentConversations: [],
      significantEvents: [],
    };
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

export function adjustMood(dwarf, delta, reason = null) {
  dwarf.mood = Math.max(0, Math.min(100, dwarf.mood + delta));

  if (dwarf.personality) {
    if (dwarf.personality.optimism > 0.7 && delta < 0) {
      dwarf.mood += Math.abs(delta) * 0.2;
    }
    if (dwarf.personality.melancholy > 0.7 && delta > 0) {
      dwarf.mood -= delta * 0.2;
    }
  }

  dwarf.mood = Math.max(0, Math.min(100, dwarf.mood));
}

export function createFoodSource(x, y, amount = 10) {
  return {
    type: ENTITY_TYPES.FOOD,
    id: nextId(),
    x,
    y,
    amount,
  };
}

// === DWARF STATE CHECKS ===

export function isHungry(dwarf) {
  return dwarf.hunger >= HUNGER_SEEK_THRESHOLD;
}

export function isCritical(dwarf) {
  return dwarf.hunger >= HUNGER_CRITICAL;
}

export function isStarved(dwarf) {
  return dwarf.hunger >= HUNGER_DEATH;
}

// === FULFILLMENT SYSTEM FUNCTIONS ===

export function applyFulfillmentDecay(dwarf) {
  if (!dwarf.fulfillment) return;

  const p = dwarf.personality || {};

  dwarf.fulfillment.social = Math.max(
    0,
    dwarf.fulfillment.social -
      FULFILLMENT_NEEDS.social.decayRate *
        (p.friendliness > 0.6 ? 1.5 : 1)
  );

  dwarf.fulfillment.exploration = Math.max(
    0,
    dwarf.fulfillment.exploration -
      FULFILLMENT_NEEDS.exploration.decayRate *
        (p.curiosity > 0.6 ? 1.5 : 1)
  );

  dwarf.fulfillment.creativity = Math.max(
    0,
    dwarf.fulfillment.creativity -
      FULFILLMENT_NEEDS.creativity.decayRate *
        (p.creativity > 0.6 ? 1.5 : 1)
  );

  dwarf.fulfillment.tranquility = Math.max(
    0,
    dwarf.fulfillment.tranquility -
      FULFILLMENT_NEEDS.tranquility.decayRate *
        (p.melancholy > 0.5 ? 1.5 : 1)
  );
}

export function satisfyFulfillment(dwarf, needType, multiplier = 1) {
  if (!dwarf.fulfillment || !FULFILLMENT_NEEDS[needType]) return;

  const amount = FULFILLMENT_NEEDS[needType].satisfyAmount * multiplier;
  dwarf.fulfillment[needType] = Math.min(
    100,
    dwarf.fulfillment[needType] + amount
  );

  adjustMood(dwarf, Math.floor(amount * 0.3), `fulfilled ${needType}`);
}

export function getMostPressingNeed(dwarf) {
  if (!dwarf.fulfillment || !dwarf.personality) return null;

  const p = dwarf.personality;
  const f = dwarf.fulfillment;

  const needs = [
    { type: 'social', urgency: (100 - f.social) * (0.5 + p.friendliness) },
    { type: 'exploration', urgency: (100 - f.exploration) * (0.5 + p.curiosity) },
    { type: 'creativity', urgency: (100 - f.creativity) * (0.5 + p.creativity) },
    {
      type: 'tranquility',
      urgency: (100 - f.tranquility) * (0.5 + (p.melancholy || 0.3)),
    },
  ];

  needs.sort((a, b) => b.urgency - a.urgency);

  return needs[0].urgency > 30 ? needs[0] : null;
}

export function needsSocial(dwarf) {
  if (!dwarf.fulfillment) return false;
  const threshold = dwarf.personality?.friendliness > 0.6 ? 50 : 35;
  return dwarf.fulfillment.social < threshold;
}

export function needsExploration(dwarf) {
  if (!dwarf.fulfillment) return false;
  const threshold = dwarf.personality?.curiosity > 0.6 ? 50 : 35;
  return dwarf.fulfillment.exploration < threshold;
}

/* ------------------------------------------------------------------ */
/* ----------------------- ADDITIVE IMPROVEMENTS --------------------- */
/* ------------------------------------------------------------------ */

/**
 * Increment hunger safely per tick
 */
export function applyHunger(dwarf, amount = 0.1) {
  dwarf.hunger = Math.min(HUNGER_DEATH, dwarf.hunger + amount);
}

/**
 * Unified per-tick update helper
 * Safe to call inside agent inference loops
 */
export function updateDwarfTick(dwarf, tick) {
  applyHunger(dwarf);
  applyFulfillmentDecay(dwarf);

  if (isStarved(dwarf)) {
    adjustMood(dwarf, -100, 'starvation');
  }
}

/**
 * Compact snapshot for LLM context (no circular refs / Sets)
 */
export function serializeDwarfForLLM(dwarf) {
  return {
    id: dwarf.id,
    name: getDisplayName(dwarf),
    mood: dwarf.mood,
    hunger: dwarf.hunger,
    state: dwarf.state,
    aspiration: dwarf.aspiration,
    dominantTraits: getDominantTraits(dwarf),
    fulfillment: dwarf.fulfillment,
    recentThoughts: dwarf.memory?.recentThoughts?.slice(-3) || [],
  };
}

/**
 * Convert needs into readable intent string
 */
export function getDwarfIntentSummary(dwarf) {
  if (isCritical(dwarf)) return 'Desperately seeking food';

  const need = getMostPressingNeed(dwarf);
  if (!need) return 'Content and idle';

  return `Seeking ${need.type} fulfillment`;
}
