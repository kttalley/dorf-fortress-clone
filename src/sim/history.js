/**
 * World History Generator
 * Generates a timeline of historical events that affect present-day race relations
 */

import { RACE, getRelationKey } from './races.js';

export const HISTORICAL_EVENT = Object.freeze({
  WAR: 'war',
  TREATY: 'treaty',
  TRADE_AGREEMENT: 'trade_agreement',
  RELIGIOUS_CONFLICT: 'religious_conflict',
  ALLIANCE: 'alliance',
  BETRAYAL: 'betrayal',
  MIGRATION: 'migration',
  PLAGUE: 'plague',
  GREAT_BATTLE: 'great_battle',
  CULTURAL_EXCHANGE: 'cultural_exchange',
});

// Event templates with relation effects
const EVENT_TEMPLATES = {
  [HISTORICAL_EVENT.WAR]: {
    weight: 15,
    relationChange: -30,
    bilateral: true,
    descriptions: [
      'The {race1} and {race2} waged a bitter war over the {location}.',
      'Blood was spilled when {race1} armies clashed with {race2} defenders.',
      'The War of {adjective} {noun} left deep scars between {race1} and {race2}.',
    ],
  },
  [HISTORICAL_EVENT.TREATY]: {
    weight: 12,
    relationChange: 25,
    bilateral: true,
    descriptions: [
      'A historic treaty brought peace between {race1} and {race2}.',
      'The {adjective} Accord united {race1} and {race2} in friendship.',
      '{race1} and {race2} signed the Treaty of {location}.',
    ],
  },
  [HISTORICAL_EVENT.TRADE_AGREEMENT]: {
    weight: 18,
    relationChange: 15,
    bilateral: true,
    descriptions: [
      '{race1} merchants opened trade routes with the {race2}.',
      'The {location} Trade Pact enriched both {race1} and {race2}.',
      'Commerce flourished as {race1} and {race2} exchanged goods.',
    ],
  },
  [HISTORICAL_EVENT.RELIGIOUS_CONFLICT]: {
    weight: 10,
    relationChange: -20,
    bilateral: true,
    descriptions: [
      'Religious tensions erupted between {race1} and {race2}.',
      'The {adjective} Heresy divided {race1} from {race2}.',
      '{race1} missionaries were expelled from {race2} lands.',
    ],
  },
  [HISTORICAL_EVENT.ALLIANCE]: {
    weight: 10,
    relationChange: 35,
    bilateral: true,
    descriptions: [
      '{race1} and {race2} forged a mighty alliance.',
      'The {adjective} Alliance bound {race1} and {race2} together.',
      'Against common foes, {race1} and {race2} united.',
    ],
  },
  [HISTORICAL_EVENT.BETRAYAL]: {
    weight: 8,
    relationChange: -40,
    bilateral: true,
    descriptions: [
      'The {race1} betrayed their {race2} allies at {location}.',
      'Trust shattered when {race1} broke their oath to {race2}.',
      'The {adjective} Betrayal poisoned relations between {race1} and {race2}.',
    ],
  },
  [HISTORICAL_EVENT.MIGRATION]: {
    weight: 12,
    relationChange: -10,
    bilateral: true,
    descriptions: [
      '{race1} refugees settled in {race2} territories.',
      'A great migration of {race1} displaced {race2} communities.',
      '{race1} wanderers sought new homes near {race2} lands.',
    ],
  },
  [HISTORICAL_EVENT.PLAGUE]: {
    weight: 6,
    relationChange: -15,
    bilateral: true,
    descriptions: [
      'A plague spread from {race1} lands to {race2} villages.',
      'The {adjective} Plague was blamed on {race1} by the {race2}.',
      'Disease strained relations between {race1} and {race2}.',
    ],
  },
  [HISTORICAL_EVENT.GREAT_BATTLE]: {
    weight: 8,
    relationChange: -25,
    bilateral: true,
    descriptions: [
      'The Battle of {location} saw {race1} triumph over {race2}.',
      '{race1} warriors defeated {race2} at the {adjective} Fields.',
      'A legendary battle between {race1} and {race2} shaped history.',
    ],
  },
  [HISTORICAL_EVENT.CULTURAL_EXCHANGE]: {
    weight: 14,
    relationChange: 20,
    bilateral: true,
    descriptions: [
      '{race1} artisans shared their craft with {race2}.',
      'Cultural festivals brought {race1} and {race2} together.',
      'The exchange of knowledge enriched both {race1} and {race2}.',
    ],
  },
};

// Word pools for generating descriptions
const ADJECTIVES = [
  'Iron', 'Golden', 'Silver', 'Crimson', 'Verdant', 'Obsidian', 'Crystal',
  'Ancient', 'Forgotten', 'Sacred', 'Cursed', 'Eternal', 'Broken', 'Silent',
];

const NOUNS = [
  'Crown', 'Throne', 'Gate', 'Bridge', 'Mountain', 'River', 'Forest',
  'Stone', 'Flame', 'Shadow', 'Dawn', 'Dusk', 'Winter', 'Thunder',
];

const LOCATIONS = [
  'Iron Peak', 'the Misty Vale', 'Thornwood', 'the Grey Marshes',
  'Stoneholm', 'the Amber Coast', 'Ravensreach', 'the Sundered Plains',
  'Frostgate', 'the Emerald Depths', 'Shadowmere', 'the Copper Hills',
];

/**
 * Seeded random number generator
 */
function seededRandom(seed) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

/**
 * Pick a random item from array using seed
 */
function seededPick(array, seed) {
  return array[Math.floor(seededRandom(seed) * array.length)];
}

/**
 * Get race display name
 */
function getRaceName(race) {
  const names = {
    [RACE.HUMAN]: 'humans',
    [RACE.GOBLIN]: 'goblins',
    [RACE.ELF]: 'elves',
    dwarf: 'dwarves',
  };
  return names[race] || race;
}

/**
 * Generate a description from template
 */
function generateDescription(template, race1, race2, seed) {
  const descriptions = template.descriptions;
  let desc = seededPick(descriptions, seed);

  desc = desc.replace(/{race1}/g, getRaceName(race1));
  desc = desc.replace(/{race2}/g, getRaceName(race2));
  desc = desc.replace(/{adjective}/g, seededPick(ADJECTIVES, seed + 1));
  desc = desc.replace(/{noun}/g, seededPick(NOUNS, seed + 2));
  desc = desc.replace(/{location}/g, seededPick(LOCATIONS, seed + 3));

  return desc;
}

/**
 * Select an event type based on weights and current relations
 */
function selectEventType(history, seed) {
  // Build weighted list
  const weights = [];
  let totalWeight = 0;

  for (const [eventType, template] of Object.entries(EVENT_TEMPLATES)) {
    let weight = template.weight;

    // Modify weight based on recent events (avoid repetition)
    const recentOfType = history.events.filter(e => e.type === eventType).length;
    weight = Math.max(1, weight - recentOfType * 3);

    weights.push({ eventType, weight });
    totalWeight += weight;
  }

  // Select based on weight
  let roll = seededRandom(seed) * totalWeight;
  for (const { eventType, weight } of weights) {
    roll -= weight;
    if (roll <= 0) {
      return eventType;
    }
  }

  return HISTORICAL_EVENT.TRADE_AGREEMENT; // Fallback
}

/**
 * Select two races for an event
 */
function selectRaces(seed) {
  const races = ['dwarf', RACE.HUMAN, RACE.GOBLIN, RACE.ELF];
  const race1 = seededPick(races, seed);
  let race2 = seededPick(races, seed + 100);

  // Ensure different races
  while (race2 === race1) {
    race2 = seededPick(races, seed + Math.random() * 1000);
  }

  return [race1, race2];
}

/**
 * Generate a single historical event
 */
function generateHistoricalEvent(history, seed) {
  const eventType = selectEventType(history, seed);
  const [race1, race2] = selectRaces(seed + 50);
  const template = EVENT_TEMPLATES[eventType];

  const event = {
    type: eventType,
    year: history.year,
    participants: [race1, race2],
    relationChange: template.relationChange,
    description: generateDescription(template, race1, race2, seed),
  };

  return event;
}

/**
 * Apply event effects to history
 */
function applyEventEffects(history, event) {
  const [race1, race2] = event.participants;
  const relationKey = getRelationKey(race1, race2);

  if (!history.raceRelations[relationKey]) {
    history.raceRelations[relationKey] = 0;
  }

  history.raceRelations[relationKey] += event.relationChange;

  // Clamp relations to -100 to 100
  history.raceRelations[relationKey] = Math.max(-100, Math.min(100, history.raceRelations[relationKey]));
}

/**
 * Generate world history with timeline of events
 * @param {number} seed - Random seed for deterministic generation
 * @returns {object} History object with events and race relations
 */
export function generateWorldHistory(seed = Date.now()) {
  const history = {
    seed,
    year: 0,
    events: [],
    raceRelations: {
      // Initial relations (somewhat historical defaults)
      [getRelationKey('dwarf', RACE.HUMAN)]: 30,   // Dwarves and humans: trade partners
      [getRelationKey('dwarf', RACE.GOBLIN)]: -40, // Dwarves and goblins: ancestral enemies
      [getRelationKey('dwarf', RACE.ELF)]: 10,     // Dwarves and elves: cautious respect
      [getRelationKey(RACE.HUMAN, RACE.GOBLIN)]: -30, // Humans and goblins: hostile
      [getRelationKey(RACE.HUMAN, RACE.ELF)]: 20,     // Humans and elves: friendly
      [getRelationKey(RACE.GOBLIN, RACE.ELF)]: -50,   // Goblins and elves: bitter enemies
    },
    currentYear: 0,
  };

  // Generate 5-15 historical events
  const eventCount = 5 + Math.floor(seededRandom(seed) * 11);

  for (let i = 0; i < eventCount; i++) {
    const eventSeed = seed + i * 1000;
    const event = generateHistoricalEvent(history, eventSeed);
    history.events.push(event);
    applyEventEffects(history, event);

    // Advance time between events (10-50 years)
    history.year += 10 + Math.floor(seededRandom(eventSeed + 500) * 40);
  }

  // Set current year to after all events
  history.currentYear = history.year + 10 + Math.floor(seededRandom(seed + 9999) * 20);

  return history;
}

/**
 * Get the relation score between dwarves and another race
 */
export function getDwarfRelation(history, race) {
  if (!history || !history.raceRelations) return 0;
  const key = getRelationKey('dwarf', race);
  return history.raceRelations[key] || 0;
}

/**
 * Get recent events involving a specific race
 */
export function getRecentEventsForRace(history, race, count = 3) {
  if (!history || !history.events) return [];

  return history.events
    .filter(e => e.participants.includes(race) || e.participants.includes('dwarf'))
    .slice(-count);
}

/**
 * Generate a history summary for display
 */
export function getHistorySummary(history) {
  if (!history) return 'No recorded history.';

  const lines = [];
  lines.push(`Year ${history.currentYear} of the Age`);
  lines.push('');

  // Summarize race relations
  const relations = [];
  for (const [key, value] of Object.entries(history.raceRelations)) {
    const [race1, race2] = key.split('_');
    if (race1 === 'dwarf' || race2 === 'dwarf') {
      const otherRace = race1 === 'dwarf' ? race2 : race1;
      let stance;
      if (value >= 50) stance = 'allied with';
      else if (value >= 20) stance = 'friendly with';
      else if (value >= -20) stance = 'neutral toward';
      else if (value >= -50) stance = 'hostile toward';
      else stance = 'at war with';

      relations.push(`Dwarves are ${stance} the ${getRaceName(otherRace)} (${value})`);
    }
  }

  lines.push(...relations);

  // Most recent significant event
  if (history.events.length > 0) {
    lines.push('');
    lines.push('Recent history:');
    const recent = history.events.slice(-3);
    for (const event of recent) {
      lines.push(`  Year ${event.year}: ${event.description}`);
    }
  }

  return lines.join('\n');
}

/**
 * Calculate spawn weight modifier for a race based on history
 */
export function getSpawnWeightModifier(history, race) {
  if (!history) return 1.0;

  const relation = getDwarfRelation(history, race);

  // Recent events matter more
  const recentEvents = getRecentEventsForRace(history, race, 3);
  let recentModifier = 0;

  for (const event of recentEvents) {
    if (event.type === HISTORICAL_EVENT.WAR || event.type === HISTORICAL_EVENT.BETRAYAL) {
      recentModifier -= 0.2;
    } else if (event.type === HISTORICAL_EVENT.TRADE_AGREEMENT || event.type === HISTORICAL_EVENT.ALLIANCE) {
      recentModifier += 0.2;
    }
  }

  // Base modifier from overall relation
  let modifier = 1.0;

  if (race === RACE.GOBLIN) {
    // Goblins more likely to attack when relations are bad
    modifier = relation < -30 ? 1.5 : relation < 0 ? 1.2 : 0.8;
  } else if (race === RACE.HUMAN) {
    // Humans trade more when relations are good
    modifier = relation > 30 ? 1.3 : relation > 0 ? 1.1 : 0.7;
  } else if (race === RACE.ELF) {
    // Elves visit more during times of cultural openness
    modifier = relation > 20 ? 1.2 : relation < -20 ? 0.5 : 1.0;
  }

  return Math.max(0.1, modifier + recentModifier);
}
