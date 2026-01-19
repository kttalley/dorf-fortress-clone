/**
 * entities.js
 *
 * Full entity module for dwarves, food, resources
 * - No death from hunger (regular feasts / farming)
 * - Fulfillment system (social, exploration, creativity, tranquility)
 * - Skills, aspirations
 * - LLM-backed name/bio generation with fallback
 */

import { generateSkills, generateAspiration } from './tasks.js';
import { requestNameBio, generateNameBioSync } from './nameGenerator.js';

/* ============================
   ENTITY TYPES
   ============================ */
export const ENTITY_TYPES = {
  DWARF: 'dwarf',
  FOOD: 'food',
  RESOURCE: 'resource',
};

/* ============================
   HUNGER / FEEDING
   ============================ */
export const HUNGER_SEEK_THRESHOLD = 60;  // Start seeking food
export const HUNGER_CRITICAL = 85;        // Desperate threshold
export const HUNGER_DEATH = 100;          // DEPRECATED, dwarves no longer die

// Override death behavior
export function isStarved(dwarf) {
  return false; // dwarves cannot die from hunger
}

export function isHungry(dwarf) {
  return dwarf.hunger >= HUNGER_SEEK_THRESHOLD;
}

export function isCritical(dwarf) {
  return dwarf.hunger >= HUNGER_CRITICAL;
}

/* ============================
   FULFILLMENT SYSTEM
   ============================ */
export const FULFILLMENT_NEEDS = {
  social: { decayRate: 0.3, satisfyAmount: 25 },
  exploration: { decayRate: 0.2, satisfyAmount: 15 },
  creativity: { decayRate: 0.15, satisfyAmount: 20 },
  tranquility: { decayRate: 0.1, satisfyAmount: 30 },
};

/* ============================
   NAMES / IDs
   ============================ */
const DWARF_NAMES = [
  'Urist','Bomrek','Fikod','Kadol','Morul','Thikut','Zefon','Datan','Erith','Aban',
  'Lokum','Ingiz','Asob','Eshtan','Dodok','Rigoth','Litast','Sibrek','Zasit','Tholtig'
];

const PERSONALITY_TRAITS = [
  'curiosity','friendliness','bravery','humor','melancholy',
  'patience','creativity','loyalty','stubbornness','optimism'
];

let nameIndex = 0;
let idCounter = 0;

export function nextDwarfName() {
  const name = DWARF_NAMES[nameIndex % DWARF_NAMES.length];
  nameIndex++;
  return name;
}

export function nextId() {
  return idCounter++;
}

export function resetIds() {
  idCounter = 0;
  nameIndex = 0;
}

/* ============================
   UTILITY FUNCTIONS
   ============================ */
export function distance(a, b) {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

export function isAt(entity, x, y) {
  return entity.x === x && entity.y === y;
}

/* ============================
   PERSONALITY / FULFILLMENT
   ============================ */
function generatePersonality() {
  const personality = {};
  for (const trait of PERSONALITY_TRAITS) {
    personality[trait] = 0.3 + Math.random() * 0.4 + (Math.random() > 0.7 ? Math.random() * 0.3 : 0);
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

export function applyFulfillmentDecay(dwarf) {
  if (!dwarf.fulfillment) return;
  const p = dwarf.personality || {};

  dwarf.fulfillment.social = Math.max(0, dwarf.fulfillment.social -
    FULFILLMENT_NEEDS.social.decayRate * (p.friendliness > 0.6 ? 1.5 : 1));
  dwarf.fulfillment.exploration = Math.max(0, dwarf.fulfillment.exploration -
    FULFILLMENT_NEEDS.exploration.decayRate * (p.curiosity > 0.6 ? 1.5 : 1));
  dwarf.fulfillment.creativity = Math.max(0, dwarf.fulfillment.creativity -
    FULFILLMENT_NEEDS.creativity.decayRate * (p.creativity > 0.6 ? 1.5 : 1));
  dwarf.fulfillment.tranquility = Math.max(0, dwarf.fulfillment.tranquility -
    FULFILLMENT_NEEDS.tranquility.decayRate * (p.melancholy > 0.5 ? 1.5 : 1));
}

export function satisfyFulfillment(dwarf, needType, multiplier = 1) {
  if (!dwarf.fulfillment || !FULFILLMENT_NEEDS[needType]) return;
  const amount = FULFILLMENT_NEEDS[needType].satisfyAmount * multiplier;
  dwarf.fulfillment[needType] = Math.min(100, dwarf.fulfillment[needType] + amount);
  adjustMood(dwarf, Math.floor(amount * 0.3), `fulfilled ${needType}`);
}

/* ============================
   MOOD
   ============================ */
export function adjustMood(dwarf, delta, reason = null) {
  dwarf.mood = Math.max(0, Math.min(100, (dwarf.mood ?? 70) + delta));
  const p = dwarf.personality || {};
  if (p.optimism > 0.7 && delta < 0) dwarf.mood += Math.abs(delta) * 0.2;
  if (p.melancholy > 0.7 && delta > 0) dwarf.mood -= delta * 0.2;
  dwarf.mood = Math.max(0, Math.min(100, dwarf.mood));
}

/* ============================
   MEMORIES
   ============================ */
export function addMemory(dwarf, type, content, tick) {
  if (!dwarf.memory) dwarf.memory = { recentThoughts: [], recentConversations: [], significantEvents: [] };
  switch(type) {
    case 'thought':
      dwarf.memory.recentThoughts.push({ content, tick });
      if(dwarf.memory.recentThoughts.length > 5) dwarf.memory.recentThoughts.shift();
      break;
    case 'conversation':
      dwarf.memory.recentConversations.push({ content, tick });
      if(dwarf.memory.recentConversations.length > 3) dwarf.memory.recentConversations.shift();
      break;
    case 'event':
      dwarf.memory.significantEvents.push({ content, tick });
      if(dwarf.memory.significantEvents.length > 10) dwarf.memory.significantEvents.shift();
      break;
  }
}

/* ============================
   DWARF CREATION
   ============================ */
export function createDwarf(x, y, name = null) {
  const id = nextId();
  const personality = generatePersonality();
  const dwarf = {
    type: ENTITY_TYPES.DWARF,
    id,
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
    memory: { recentThoughts: [], recentConversations: [], significantEvents: [], visitedAreas: new Set(), craftedItems: [] },
    currentThought: null,
    lastThoughtTick: 0,
    conversationPartner: null,
    lastSocialTick: 0,
    itemsCrafted: 0,
    tilesDigged: 0,
    masterworkCount: 0,
    llm: null,
    generatedName: null,
    generatedBio: null
  };

  // Sync fallback for immediate flavor
  generateNameBioSync(dwarf);

  // Async LLM update
  requestNameBio(dwarf).catch(()=>{});

  return dwarf;
}

export function getDisplayName(dwarf) { return dwarf.generatedName || dwarf.name; }
export function getDisplayBio(dwarf) { return dwarf.generatedBio || 'A dwarf of quiet determination.'; }
export function getDominantTraits(dwarf) {
  if(!dwarf.personality) return ['average'];
  const sorted = Object.entries(dwarf.personality)
    .sort((a,b)=>b[1]-a[1])
    .slice(0,3)
    .filter(([trait,value])=>value>0.6)
    .map(([trait])=>trait);
  return sorted.length>0 ? sorted : ['balanced'];
}

/* ============================
   FOOD / RESOURCES
   ============================ */
let foodIdCounter = 0;

export function createFoodSource({ x=0, y=0, amount=10 }={}) {
  return {
    type: ENTITY_TYPES.FOOD,
    id: `food-${foodIdCounter++}`,
    x, y,
    amount
  };
}

/* ============================
   DOMAINS / CHECKS
   ============================ */
export function needsSocial(dwarf) {
  if(!dwarf.fulfillment) return false;
  return dwarf.fulfillment.social < ((dwarf.personality?.friendliness>0.6)?50:35);
}
export function needsExploration(dwarf) {
  if(!dwarf.fulfillment) return false;
  return dwarf.fulfillment.exploration < ((dwarf.personality?.curiosity>0.6)?50:35);
}

export function getMostPressingNeed(dwarf) {
  if(!dwarf.fulfillment||!dwarf.personality) return null;
  const p = dwarf.personality;
  const f = dwarf.fulfillment;
  const needs = [
    { type:'social', urgency:(100-f.social)*(0.5+p.friendliness) },
    { type:'exploration', urgency:(100-f.exploration)*(0.5+p.curiosity) },
    { type:'creativity', urgency:(100-f.creativity)*(0.5+p.creativity) },
    { type:'tranquility', urgency:(100-f.tranquility)*(0.5+(p.melancholy||0.3)) },
  ];
  needs.sort((a,b)=>b.urgency-a.urgency);
  return needs[0].urgency>30 ? needs[0] : null;
}
