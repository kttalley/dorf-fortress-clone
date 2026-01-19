/**
 * Entity utilities
 * Dwarves with personality, skills, aspirations, and fulfillment needs
 * Hunger is non-lethal and resolved socially through feasts
 */

import { generateSkills, generateAspiration } from './tasks.js';
import { requestNameBio, generateNameBioSync } from '../llm/nameGenerator.js';

// === ENTITY TYPES ===
export const ENTITY_TYPES = {
  DWARF: 'dwarf',
  FOOD: 'food',
  RESOURCE: 'resource',
  MEETING_HALL: 'meeting_hall',
  FARM: 'farm',
  BREWERY: 'brewery',
  FISHING: 'fishing',
  HUNTING: 'hunting',
};

// === HUNGER SYSTEM ===
// Hunger is pressure, not death
export const HUNGER_SEEK_THRESHOLD = 55;
export const HUNGER_CRITICAL = 80;
export const HUNGER_MAX = 95;

// === FULFILLMENT SYSTEM ===
export const FULFILLMENT_NEEDS = {
  social: { decayRate: 0.3, satisfyAmount: 25 },
  exploration: { decayRate: 0.2, satisfyAmount: 15 },
  creativity: { decayRate: 0.15, satisfyAmount: 20 },
  tranquility: { decayRate: 0.1, satisfyAmount: 30 },
};

// === DWARF NAMING ===
const DWARF_NAMES = [
  'Urist','Bomrek','Fikod','Kadol','Morul',
  'Thikut','Zefon','Datan','Erith','Aban',
  'Lokum','Ingiz','Asob','Eshtan','Dodok',
  'Rigoth','Litast','Sibrek','Zasit','Tholtig'
];

const PERSONALITY_TRAITS = [
  'curiosity','friendliness','bravery','humor','melancholy',
  'patience','creativity','loyalty','stubbornness','optimism'
];

let idCounter = 0;
let nameIndex = 0;

// === UTILS ===
export function nextId() { return idCounter++; }
export function resetIds() { idCounter = 0; nameIndex = 0; }
export function nextDwarfName() {
  const name = DWARF_NAMES[nameIndex % DWARF_NAMES.length];
  nameIndex++;
  return name;
}

export function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isAt(entity, x, y) {
  return entity.x === x && entity.y === y;
}

// === PERSONALITY ===
function generatePersonality() {
  const p = {};
  for (const trait of PERSONALITY_TRAITS) {
    p[trait] = 0.3 + Math.random() * 0.4 + (Math.random() > 0.7 ? Math.random() * 0.3 : 0);
  }
  return p;
}

function generateFulfillment(personality) {
  return {
    social: 50 + (personality.friendliness > 0.6 ? 20 : 0),
    exploration: 50 + (personality.curiosity > 0.6 ? 20 : 0),
    creativity: 50 + (personality.creativity > 0.6 ? 20 : 0),
    tranquility: 50 + (personality.melancholy > 0.5 ? 20 : 0),
  };
}

// === DWARF FACTORY ===
export function createDwarf(x, y, name = null) {
  const personality = generatePersonality();

  const dwarf = {
    type: ENTITY_TYPES.DWARF,
    id: nextId(),
    name: name || nextDwarfName(),
    x, y,

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

    conversationPartner: null,
    itemsCrafted: 0,

    llm: null,
    generatedName: null,
    generatedBio: null,
  };

  generateNameBioSync(dwarf);
  requestNameBio(dwarf).catch(() => {});

  return dwarf;
}

// === DISPLAY HELPERS ===
export function getDisplayName(d) {
  return d.generatedName || d.name;
}

export function getDisplayBio(d) {
  return d.generatedBio || 'A dwarf of quiet determination.';
}

export function getDominantTraits(d) {
  return Object.entries(d.personality)
    .sort((a,b) => b[1]-a[1])
    .slice(0,3)
    .filter(([,v]) => v > 0.6)
    .map(([k]) => k) || ['balanced'];
}

// === MOOD ===
export function adjustMood(dwarf, delta) {
  dwarf.mood = Math.max(0, Math.min(100, dwarf.mood + delta));

  if (dwarf.personality.optimism > 0.7 && delta < 0) {
    dwarf.mood += Math.abs(delta) * 0.2;
  }
  if (dwarf.personality.melancholy > 0.7 && delta > 0) {
    dwarf.mood -= delta * 0.2;
  }

  dwarf.mood = Math.max(0, Math.min(100, dwarf.mood));
}

// === HUNGER LOGIC ===
export function isHungry(dwarf) {
  return dwarf.hunger >= HUNGER_SEEK_THRESHOLD;
}

export function isCritical(dwarf) {
  return dwarf.hunger >= HUNGER_CRITICAL;
}

export function applyHungerEffects(dwarf) {
  dwarf.hunger = Math.min(HUNGER_MAX, dwarf.hunger);

  if (isCritical(dwarf)) {
    dwarf.energy = Math.max(0, dwarf.energy - 0.5);
    adjustMood(dwarf, -0.3);
  }

  if (dwarf.hunger > 60) {
    dwarf.fulfillment.social -= 0.4;
    dwarf.fulfillment.tranquility -= 0.3;
  }
}

// === FOOD INFRASTRUCTURE ===
export function createFoodProducer(type, x, y, stock = 40) {
  return {
    type,
    id: nextId(),
    x, y,
    stock,
    regenRate: 0.05,
    feastEligible: true,
  };
}

// === MEETING HALL ===
export function createMeetingHall(x, y) {
  return {
    type: ENTITY_TYPES.MEETING_HALL,
    id: nextId(),
    x, y,
    foodStock: 120,
    feastCooldown: 200,
    lastFeastTick: 0,
  };
}

export function canHoldFeast(hall, tick) {
  return (
    hall.foodStock >= 30 &&
    tick - hall.lastFeastTick > hall.feastCooldown
  );
}

export function holdFeast(hall, dwarves, tick) {
  hall.foodStock -= 30;
  hall.lastFeastTick = tick;

  for (const dwarf of dwarves) {
    dwarf.hunger = Math.max(0, dwarf.hunger - 40);
    satisfyFulfillment(dwarf, 'social', 1.5);
    adjustMood(dwarf, +15);

    dwarf.memory.significantEvents.push({
      content: 'Attended a grand feast',
      tick,
    });
  }
}

// === FULFILLMENT ===
export function applyFulfillmentDecay(dwarf) {
  const p = dwarf.personality;
  dwarf.fulfillment.social -= FULFILLMENT_NEEDS.social.decayRate * (p.friendliness > 0.6 ? 1.5 : 1);
  dwarf.fulfillment.exploration -= FULFILLMENT_NEEDS.exploration.decayRate * (p.curiosity > 0.6 ? 1.5 : 1);
  dwarf.fulfillment.creativity -= FULFILLMENT_NEEDS.creativity.decayRate * (p.creativity > 0.6 ? 1.5 : 1);
  dwarf.fulfillment.tranquility -= FULFILLMENT_NEEDS.tranquility.decayRate * (p.melancholy > 0.5 ? 1.5 : 1);

  for (const key in dwarf.fulfillment) {
    dwarf.fulfillment[key] = Math.max(0, Math.min(100, dwarf.fulfillment[key]));
  }
}

export function satisfyFulfillment(dwarf, type, multiplier = 1) {
  const amount = FULFILLMENT_NEEDS[type].satisfyAmount * multiplier;
  dwarf.fulfillment[type] = Math.min(100, dwarf.fulfillment[type] + amount);
  adjustMood(dwarf, amount * 0.3);
}
