/**
 * Combat System
 * Simple HP/damage combat for dwarves and visitors
 */

import { distance } from './entities.js';
import { emit, EVENTS } from '../events/eventBus.js';

export const COMBAT_CONFIG = Object.freeze({
  ATTACK_RANGE: 1,           // Must be adjacent
  ATTACK_COOLDOWN: 4,        // Ticks between attacks
  FLEE_HP_THRESHOLD: 0.3,    // Flee when HP below 30%
  BASE_DWARF_DAMAGE: 3,      // Base damage for dwarves
  DAMAGE_VARIANCE: 0.4,      // +/- 40% damage variance
});

/**
 * Check if two entities are in attack range
 */
export function inAttackRange(attacker, defender) {
  return distance(attacker, defender) <= COMBAT_CONFIG.ATTACK_RANGE;
}

/**
 * Calculate damage for an attack
 */
function calculateDamage(attacker) {
  const baseDamage = attacker.damage || COMBAT_CONFIG.BASE_DWARF_DAMAGE;
  const skillMod = attacker.combatSkill || 0.5;

  // Variance between (1 - variance) and (1 + variance)
  const variance = 1 - COMBAT_CONFIG.DAMAGE_VARIANCE + Math.random() * COMBAT_CONFIG.DAMAGE_VARIANCE * 2;

  return Math.max(1, Math.floor(baseDamage * skillMod * variance));
}

/**
 * Attempt an attack from attacker to defender
 * @returns {{ success: boolean, damage?: number, killed?: boolean, reason?: string }}
 */
export function attemptAttack(attacker, defender, state) {
  // Check range
  if (!inAttackRange(attacker, defender)) {
    return { success: false, reason: 'out_of_range' };
  }

  // Check cooldown
  if (attacker.attackCooldown && attacker.attackCooldown > 0) {
    return { success: false, reason: 'cooldown' };
  }

  // Calculate and apply damage
  const damage = calculateDamage(attacker);
  defender.hp -= damage;

  // Set cooldown
  attacker.attackCooldown = COMBAT_CONFIG.ATTACK_COOLDOWN;

  // Emit combat event
  emit(EVENTS.COMBAT_HIT, {
    attacker,
    defender,
    damage,
    remainingHp: defender.hp,
  });

  // Check for death
  if (defender.hp <= 0) {
    handleDeath(defender, attacker, state);
    return { success: true, damage, killed: true };
  }

  return { success: true, damage, killed: false };
}

/**
 * Handle entity death
 */
function handleDeath(victim, killer, state) {
  victim.hp = 0;

  if (victim.type === 'dwarf') {
    victim.state = 'dead';
    emit(EVENTS.DWARF_DEATH, {
      dwarf: victim,
      killer,
      cause: 'combat',
    });
  } else if (victim.type === 'visitor') {
    victim.state = 'dead';
    emit(EVENTS.VISITOR_DEATH, {
      visitor: victim,
      killer,
    });
  }
}

/**
 * Check if entity should flee based on HP
 */
export function shouldFlee(entity) {
  if (!entity.maxHp || entity.maxHp <= 0) return false;

  const threshold = entity.fleeThreshold || COMBAT_CONFIG.FLEE_HP_THRESHOLD;
  return (entity.hp / entity.maxHp) < threshold;
}

/**
 * Reduce attack cooldowns each tick
 */
export function tickCooldowns(entities) {
  for (const entity of entities) {
    if (entity.attackCooldown && entity.attackCooldown > 0) {
      entity.attackCooldown--;
    }
  }
}

/**
 * Find the nearest hostile entity to a dwarf
 */
export function findNearestThreat(dwarf, state) {
  if (!state.visitors || state.visitors.length === 0) return null;

  let nearestThreat = null;
  let nearestDist = Infinity;

  for (const visitor of state.visitors) {
    // Skip dead or non-hostile visitors
    if (visitor.state === 'dead') continue;
    if (visitor.disposition >= -20 && visitor.combatBehavior !== 'aggressive') continue;

    const dist = distance(dwarf, visitor);

    // Only consider nearby threats (within 8 tiles)
    if (dist < nearestDist && dist <= 8) {
      nearestDist = dist;
      nearestThreat = visitor;
    }
  }

  return nearestThreat;
}

/**
 * Find the nearest dwarf for a hostile visitor
 */
export function findNearestDwarf(visitor, state) {
  if (!state.dwarves || state.dwarves.length === 0) return null;

  let nearest = null;
  let nearestDist = Infinity;

  for (const dwarf of state.dwarves) {
    if (dwarf.hp <= 0 || dwarf.state === 'dead') continue;

    const dist = distance(visitor, dwarf);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = dwarf;
    }
  }

  return nearest;
}

/**
 * Find a safe position away from threats
 */
export function findSafePosition(entity, state, threats = []) {
  // If no specific threats provided, find all threats
  if (threats.length === 0) {
    if (entity.type === 'dwarf' && state.visitors) {
      threats = state.visitors.filter(v =>
        v.state !== 'dead' && (v.disposition < -20 || v.combatBehavior === 'aggressive')
      );
    } else if (entity.type === 'visitor' && state.dwarves) {
      threats = state.dwarves.filter(d => d.hp > 0 && d.state !== 'dead');
    }
  }

  if (threats.length === 0) return null;

  // Calculate center of threats
  const threatCenter = {
    x: threats.reduce((sum, t) => sum + t.x, 0) / threats.length,
    y: threats.reduce((sum, t) => sum + t.y, 0) / threats.length,
  };

  // Move away from threat center
  const dx = entity.x - threatCenter.x;
  const dy = entity.y - threatCenter.y;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;

  // Normalize and scale to desired flee distance
  const fleeDistance = 10;
  return {
    x: Math.round(entity.x + (dx / dist) * fleeDistance),
    y: Math.round(entity.y + (dy / dist) * fleeDistance),
  };
}

/**
 * Process all combat for a tick
 * Resolves attacks between adjacent hostile entities
 */
export function processCombat(state) {
  if (!state.visitors || state.visitors.length === 0) return;

  const allEntities = [
    ...state.dwarves.filter(d => d.hp > 0),
    ...state.visitors.filter(v => v.state !== 'dead'),
  ];

  // Tick cooldowns
  tickCooldowns(allEntities);

  // Find and resolve combat pairs
  for (const visitor of state.visitors) {
    if (visitor.state === 'dead') continue;
    if (visitor.state !== 'fighting' && visitor.state !== 'raiding') continue;

    // Aggressive visitors attack adjacent dwarves
    if (visitor.combatBehavior === 'aggressive' || visitor.state === 'fighting') {
      for (const dwarf of state.dwarves) {
        if (dwarf.hp <= 0) continue;

        if (inAttackRange(visitor, dwarf)) {
          attemptAttack(visitor, dwarf, state);
        }
      }
    }
  }

  // Dwarves in fighting state attack back
  for (const dwarf of state.dwarves) {
    if (dwarf.hp <= 0 || dwarf.state !== 'fighting') continue;

    if (dwarf.target && dwarf.target.type === 'visitor') {
      const target = dwarf.target;
      if (target.state !== 'dead' && inAttackRange(dwarf, target)) {
        attemptAttack(dwarf, target, state);
      }
    }
  }
}

/**
 * Clean up dead entities from state
 */
export function cleanupDeadEntities(state) {
  // Remove dead dwarves
  state.dwarves = state.dwarves.filter(d => d.hp > 0);

  // Remove dead visitors
  if (state.visitors) {
    state.visitors = state.visitors.filter(v => v.state !== 'dead');
  }
}

/**
 * Get combat status description for an entity
 */
export function getCombatStatus(entity) {
  if (!entity.maxHp) return null;

  const hpPercent = entity.hp / entity.maxHp;

  if (hpPercent >= 1) return 'uninjured';
  if (hpPercent >= 0.7) return 'lightly wounded';
  if (hpPercent >= 0.4) return 'wounded';
  if (hpPercent >= 0.2) return 'badly wounded';
  return 'near death';
}
