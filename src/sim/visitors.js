/**
 * Visitor entity factory
 * Creates external visitors (humans, goblins, elves) with appropriate stats
 */

import { nextId, distance } from './entities.js';
import { RACE, RACE_CONFIG, ROLE_CONFIG, VISITOR_ROLE, getRelationKey } from './races.js';

export const VISITOR_STATE = Object.freeze({
  ARRIVING: 'arriving',
  ACTIVE: 'active',
  TRADING: 'trading',
  RAIDING: 'raiding',
  PREACHING: 'preaching',
  FIGHTING: 'fighting',
  FLEEING: 'fleeing',
  LEAVING: 'leaving',
  DEAD: 'dead',
});

/**
 * Calculate visitor disposition based on race defaults and history
 */
function calculateDisposition(race, historyContext) {
  const config = RACE_CONFIG[race];
  let disposition = config.defaultDisposition;

  if (historyContext && historyContext.history) {
    const history = historyContext.history;
    const relationKey = getRelationKey('dwarf', race);
    const relationValue = history.raceRelations?.[relationKey] || 0;

    // Scale relation (-100 to 100) to disposition modifier (-30 to 30)
    disposition += Math.floor(relationValue * 0.3);
  }

  // Add some randomness
  disposition += Math.floor(Math.random() * 20) - 10;

  return Math.max(-100, Math.min(100, disposition));
}

/**
 * Create a new visitor entity
 * @param {number} x - Starting x position
 * @param {number} y - Starting y position
 * @param {string} race - RACE enum value
 * @param {string} role - VISITOR_ROLE enum value
 * @param {object} historyContext - Optional { history } for disposition calculation
 */
export function createVisitor(x, y, race, role, historyContext = {}) {
  const raceConfig = RACE_CONFIG[race];
  const roleConfig = ROLE_CONFIG[role];

  if (!raceConfig) {
    throw new Error(`Unknown race: ${race}`);
  }
  if (!roleConfig) {
    throw new Error(`Unknown role: ${role}`);
  }

  const visitor = {
    type: 'visitor',
    id: nextId(),
    race,
    role,
    x,
    y,

    // Combat stats from race config
    hp: raceConfig.baseHP,
    maxHp: raceConfig.baseHP,
    damage: raceConfig.baseDamage,

    // Movement
    speed: raceConfig.speed,
    momentum: { dx: 0, dy: 0 },
    lastMoveTick: 0,

    // Behavioral state
    state: VISITOR_STATE.ARRIVING,
    disposition: calculateDisposition(race, historyContext),

    // Goals and targets
    goal: roleConfig.goal,
    target: null,
    targetPosition: null,

    // Progress tracking
    satisfaction: 0,
    satisfactionThreshold: roleConfig.satisfactionThreshold || 100,
    interactionCount: 0,

    // Combat behavior from role
    combatBehavior: roleConfig.combatBehavior,
    fleeThreshold: roleConfig.fleeThreshold,
    attackCooldown: 0,

    // Entry tracking for leaving
    entryEdge: null,
    entryPosition: { x, y },

    // Inventory (for merchants/raiders)
    inventory: [],
    loot: [],

    // Group tracking
    groupId: null,
    groupLeader: false,

    // History modifiers
    historyModifiers: historyContext.modifiers || {},

    // Memory
    memory: {
      interactedWith: new Set(),
      visitedTiles: new Set(),
      threatsEncountered: [],
    },

    // Display name
    name: generateVisitorName(race, role),
  };

  return visitor;
}

/**
 * Generate a simple name for a visitor
 */
function generateVisitorName(race, role) {
  const raceNames = {
    [RACE.HUMAN]: ['Marcus', 'Elena', 'Thomas', 'Sarah', 'Henrik', 'Mira', 'Aldric', 'Bess'],
    [RACE.GOBLIN]: ['Grak', 'Snit', 'Vex', 'Zorn', 'Kretch', 'Skab', 'Flink', 'Mord'],
    [RACE.ELF]: ['Aelindra', 'Thalorin', 'Sylwen', 'Caelum', 'Miravel', 'Eldrin', 'Faelyn', 'Orin'],
  };

  const names = raceNames[race] || ['Stranger'];
  const name = names[Math.floor(Math.random() * names.length)];

  const roleTitle = {
    [VISITOR_ROLE.MERCHANT]: 'the Merchant',
    [VISITOR_ROLE.CARAVAN_GUARD]: 'the Guard',
    [VISITOR_ROLE.RAIDER]: 'the Raider',
    [VISITOR_ROLE.SCOUT]: 'the Scout',
    [VISITOR_ROLE.MISSIONARY]: 'the Missionary',
    [VISITOR_ROLE.DIPLOMAT]: 'the Diplomat',
  };

  return `${name} ${roleTitle[role] || ''}`.trim();
}

/**
 * Create a group of visitors (e.g., merchant caravan, raiding party)
 */
export function createVisitorGroup(x, y, race, historyContext = {}) {
  const config = RACE_CONFIG[race];
  const groupSize = config.groupSize.min + Math.floor(Math.random() * (config.groupSize.max - config.groupSize.min + 1));
  const groupId = `group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  const visitors = [];
  const roles = config.roles;

  for (let i = 0; i < groupSize; i++) {
    // First visitor gets primary role, rest are secondary/guards
    let role;
    if (i === 0) {
      role = roles[0]; // Primary role (merchant, raider, missionary)
    } else if (roles.length > 1 && Math.random() > 0.5) {
      role = roles[1]; // Secondary role (guard, scout, diplomat)
    } else {
      role = roles[0];
    }

    // Spread out spawn positions slightly
    const offsetX = (i % 3) - 1;
    const offsetY = Math.floor(i / 3) - 1;

    const visitor = createVisitor(x + offsetX, y + offsetY, race, role, historyContext);
    visitor.groupId = groupId;
    visitor.groupLeader = i === 0;

    visitors.push(visitor);
  }

  return visitors;
}

/**
 * Check if visitor should flee
 */
export function shouldFlee(visitor) {
  if (!visitor.maxHp) return false;
  const hpRatio = visitor.hp / visitor.maxHp;
  return hpRatio < visitor.fleeThreshold;
}

/**
 * Check if visitor is satisfied and ready to leave
 */
export function isSatisfied(visitor) {
  if (visitor.satisfactionThreshold === null) return false;
  return visitor.satisfaction >= visitor.satisfactionThreshold;
}

/**
 * Check if visitor is hostile
 */
export function isHostile(visitor) {
  return visitor.disposition < -20 || visitor.combatBehavior === 'aggressive';
}

/**
 * Check if visitor is friendly
 */
export function isFriendly(visitor) {
  return visitor.disposition > 20 && visitor.combatBehavior !== 'aggressive';
}

/**
 * Get visitor display color based on disposition
 */
export function getVisitorColor(visitor) {
  const baseColor = RACE_CONFIG[visitor.race]?.fg || '#ffffff';

  if (visitor.disposition < -20) {
    // Hostile tint (reddish)
    return blendColors(baseColor, '#ff4444', 0.3);
  }
  if (visitor.disposition > 20) {
    // Friendly tint (greenish)
    return blendColors(baseColor, '#44ff44', 0.2);
  }

  return baseColor;
}

/**
 * Blend two hex colors
 */
function blendColors(color1, color2, ratio) {
  const hex = (c) => parseInt(c.slice(1), 16);
  const r = (c) => (c >> 16) & 255;
  const g = (c) => (c >> 8) & 255;
  const b = (c) => c & 255;

  const c1 = hex(color1);
  const c2 = hex(color2);

  const rr = Math.round(r(c1) * (1 - ratio) + r(c2) * ratio);
  const gg = Math.round(g(c1) * (1 - ratio) + g(c2) * ratio);
  const bb = Math.round(b(c1) * (1 - ratio) + b(c2) * ratio);

  return `#${((rr << 16) | (gg << 8) | bb).toString(16).padStart(6, '0')}`;
}

/**
 * Increase visitor satisfaction
 */
export function addSatisfaction(visitor, amount) {
  visitor.satisfaction = Math.min(visitor.satisfaction + amount, 200);
}

/**
 * Get the group members for a visitor
 */
export function getGroupMembers(visitor, allVisitors) {
  if (!visitor.groupId) return [visitor];
  return allVisitors.filter(v => v.groupId === visitor.groupId && v.state !== VISITOR_STATE.DEAD);
}

/**
 * Get the group leader for a visitor
 */
export function getGroupLeader(visitor, allVisitors) {
  if (!visitor.groupId) return visitor;
  return allVisitors.find(v => v.groupId === visitor.groupId && v.groupLeader) || visitor;
}
