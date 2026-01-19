/**
 * Race definitions and configurations for external visitors
 */

export const RACE = Object.freeze({
  HUMAN: 'human',
  GOBLIN: 'goblin',
  ELF: 'elf',
});

export const VISITOR_ROLE = Object.freeze({
  MERCHANT: 'merchant',
  CARAVAN_GUARD: 'guard',
  RAIDER: 'raider',
  SCOUT: 'scout',
  MISSIONARY: 'missionary',
  DIPLOMAT: 'diplomat',
});

export const RACE_CONFIG = Object.freeze({
  [RACE.HUMAN]: {
    char: '🧙‍♂️',
    fg: '#ddcc88',
    baseHP: 20,
    baseDamage: 3,
    speed: 1.0,
    defaultDisposition: 0,
    roles: [VISITOR_ROLE.MERCHANT, VISITOR_ROLE.CARAVAN_GUARD],
    groupSize: { min: 2, max: 4 },
  },
  [RACE.GOBLIN]: {
    // char: 'G',
    char: '👹',
    fg: '#88cc44',
    baseHP: 12,
    baseDamage: 4,
    speed: 1.2,
    defaultDisposition: -40,
    roles: [VISITOR_ROLE.RAIDER, VISITOR_ROLE.SCOUT],
    groupSize: { min: 3, max: 6 },
  },
  [RACE.ELF]: {
    char: '🧝🏻‍♀️',
    fg: '#aaddff',
    baseHP: 15,
    baseDamage: 2,
    speed: 1.1,
    defaultDisposition: 10,
    roles: [VISITOR_ROLE.MISSIONARY, VISITOR_ROLE.DIPLOMAT],
    groupSize: { min: 1, max: 3 },
  },
});

export const ROLE_CONFIG = Object.freeze({
  [VISITOR_ROLE.MERCHANT]: {
    goal: 'trade',
    combatBehavior: 'defensive',
    satisfactionThreshold: 100,
    fleeThreshold: 0.4,
  },
  [VISITOR_ROLE.CARAVAN_GUARD]: {
    goal: 'protect',
    combatBehavior: 'protective',
    satisfactionThreshold: null,
    fleeThreshold: 0.25,
  },
  [VISITOR_ROLE.RAIDER]: {
    goal: 'attack',
    combatBehavior: 'aggressive',
    satisfactionThreshold: 80,
    fleeThreshold: 0.3,
  },
  [VISITOR_ROLE.SCOUT]: {
    goal: 'observe',
    combatBehavior: 'avoid',
    satisfactionThreshold: 60,
    fleeThreshold: 0.7,
  },
  [VISITOR_ROLE.MISSIONARY]: {
    goal: 'preach',
    combatBehavior: 'pacifist',
    satisfactionThreshold: 50,
    fleeThreshold: 0.6,
  },
  [VISITOR_ROLE.DIPLOMAT]: {
    goal: 'negotiate',
    combatBehavior: 'pacifist',
    satisfactionThreshold: 40,
    fleeThreshold: 0.5,
  },
});

/**
 * Get the relation key for two races (order-independent)
 */
export function getRelationKey(race1, race2) {
  const sorted = [race1, race2].sort();
  return `${sorted[0]}_${sorted[1]}`;
}
