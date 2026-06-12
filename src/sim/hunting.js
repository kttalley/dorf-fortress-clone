/**
 * Hunting System
 * Hunting targets animal entities, requires tracking and pursuit
 * Produces meat, hides, bones based on prey type
 */

import { distance } from './entities.js';
import { emit, EVENTS } from '../events/eventBus.js';
import { getAnimalLoot } from './animals.js';

// === HUNTING CONFIG ===
export const HUNTING_CONFIG = {
  HUNT_RANGE: 12,                 // Can detect prey this far away
  CLOSE_RANGE: 1,                 // Adjacent for melee attack
  BASE_HIT_CHANCE: 0.4,           // 40% base hit chance
  SKILL_HIT_MODIFIER: 0.4,        // Skill increases hit chance by up to 40%
  LARGE_PREY_PENALTY: 0.9,        // Harder to hit large animals
  SMALL_PREY_BONUS: 1.2,          // Easier to hit small animals
  MIN_SKILL_TO_HUNT: 0.2,         // Need 20% skill to attempt hunting
  XP_PER_CHASE_TICK: 1,
  XP_PER_HIT: 10,
  XP_PER_KILL: 25,
};

/**
 * Effective hunting ability: trained skill, or raw nerve for the untrained.
 * No dwarf spawns with the hunting skill (generateSkills), so a pure
 * skill-level gate would make hunting unreachable — bravery substitutes
 * until practice builds the real skill (awardHuntingXP seeds it the same way).
 */
export function getHuntingAbility(dwarf) {
  // Nerve is a floor, not just a fallback: a freshly-seeded skill starts at
  // proficiency bravery*0.3 (awardHuntingXP), BELOW untrained nerve — without
  // the floor, the first practice swing would lock the dwarf back out
  const nerve = (dwarf.personality?.bravery ?? 0.5) * 0.5;
  // Tolerate the legacy object-map skills shape (real dwarves use arrays)
  const skill = Array.isArray(dwarf.skills)
    ? dwarf.skills.find(s => s.name === 'hunting')
    : null;
  if (!skill) return nerve;
  return Math.max(skill.level, skill.proficiency, nerve);
}

/**
 * Check if dwarf can hunt at this location
 */
export function canHuntAt(dwarf, x, y, state) {
  if (!dwarf || dwarf.hp <= 0) return false;
  if (getHuntingAbility(dwarf) < HUNTING_CONFIG.MIN_SKILL_TO_HUNT) return false;

  // Check for huntable animals nearby
  const nearbyAnimals = state.animals?.filter(a =>
    distance(dwarf, a) <= HUNTING_CONFIG.HUNT_RANGE &&
    isHuntable(a) &&
    a.hp > 0
  );

  return nearbyAnimals && nearbyAnimals.length > 0;
}

/**
 * Find nearest huntable prey
 */
export function findNearestPrey(dwarf, state) {
  let nearest = null;
  let nearestDist = Infinity;

  if (!state.animals) return null;

  for (const animal of state.animals) {
    if (!isHuntable(animal) || animal.hp <= 0) continue;

    const dist = distance(dwarf, animal);
    if (dist < Math.min(nearestDist, HUNTING_CONFIG.HUNT_RANGE)) {
      nearest = animal;
      nearestDist = dist;
    }
  }

  return nearest;
}

/**
 * Attempt to hunt a specific animal target.
 * Called each tick while hunting. Does NOT move the dwarf — movement is
 * owned by decide() via movement.js (single mover); the caller chases when
 * this reports { phase: 'chasing' }.
 */
export function attemptHunt(dwarf, targetAnimal, state) {
  if (!dwarf || !targetAnimal) {
    return { success: false, reason: 'no_target' };
  }

  if (dwarf.hp <= 0 || targetAnimal.hp <= 0) {
    return { success: false, reason: 'incapacitated' };
  }

  if (getHuntingAbility(dwarf) < HUNTING_CONFIG.MIN_SKILL_TO_HUNT) {
    return { success: false, reason: 'insufficient_skill' };
  }

  const proficiency = getHuntingAbility(dwarf);

  const dist = distance(dwarf, targetAnimal);

  // PHASE 1: CHASE (distance > 1) — caller moves, tracking XP accrues
  if (dist > HUNTING_CONFIG.CLOSE_RANGE) {
    awardHuntingXP(dwarf, HUNTING_CONFIG.XP_PER_CHASE_TICK);
    return { success: false, phase: 'chasing', distance: dist };
  }

  // PHASE 2: ATTACK (in melee range)
  const hitChance = calculateHitChance(dwarf, targetAnimal, proficiency);

  if (Math.random() < hitChance) {
    // Hit! Deal damage
    const damage = calculateHuntingDamage(dwarf, targetAnimal, proficiency);
    targetAnimal.hp -= damage;

    // Award hit XP
    awardHuntingXP(dwarf, HUNTING_CONFIG.XP_PER_HIT);

    emit(EVENTS.HUNTING_HIT, {
      dwarf,
      prey: targetAnimal,
      damage,
      remainingHp: targetAnimal.hp,
    });

    // Check if killed
    if (targetAnimal.hp <= 0) {
      // Prey is dead - loot it
      const loot = getAnimalLoot(targetAnimal);
      dwarf.hunting_loot = (dwarf.hunting_loot || []).concat(loot);

      // Award kill XP
      awardHuntingXP(dwarf, HUNTING_CONFIG.XP_PER_KILL);

      emit(EVENTS.HUNTING_SUCCESS, {
        dwarf,
        prey: targetAnimal,
        loot,
      });

      return { success: true, killed: true, loot };
    }

    return { success: false, phase: 'attacking', hit: true };
  }

  // Miss
  awardHuntingXP(dwarf, 1);

  emit(EVENTS.HUNTING_MISS, {
    dwarf,
    prey: targetAnimal,
  });

  return { success: false, phase: 'attacking', hit: false };
}

/**
 * Calculate hit chance for hunting
 */
function calculateHitChance(dwarf, targetAnimal, proficiency) {
  let baseChance = HUNTING_CONFIG.BASE_HIT_CHANCE;

  // Skill modifier
  baseChance += proficiency * HUNTING_CONFIG.SKILL_HIT_MODIFIER;

  // Size modifier
  if (targetAnimal.size === 'large') {
    baseChance *= HUNTING_CONFIG.LARGE_PREY_PENALTY;
  } else if (targetAnimal.size === 'small') {
    baseChance *= HUNTING_CONFIG.SMALL_PREY_BONUS;
  }

  // Clamp to 5%-95% chance
  return Math.max(0.05, Math.min(0.95, baseChance));
}

/**
 * Calculate damage from hunting attack
 */
function calculateHuntingDamage(dwarf, targetAnimal, proficiency) {
  // Base damage from dwarf's combat skill
  const baseDamage = dwarf.damage ?? 3;
  const skillMultiplier = 1 + proficiency * 0.5;
  const variance = 0.8 + Math.random() * 0.4; // 80-120%

  return Math.max(1, Math.floor(baseDamage * skillMultiplier * variance));
}

/**
 * Award hunting skill XP
 */
export function awardHuntingXP(dwarf, amount) {
  if (!dwarf.skills) dwarf.skills = [];

  let skill = dwarf.skills.find(s => s.name === 'hunting');

  if (!skill) {
    // Create skill if doesn't exist
    skill = {
      name: 'hunting',
      level: 0,
      experience: 0,
      proficiency: (dwarf.personality?.bravery ?? 0.5) * 0.5,
      category: 'production',
      prerequisites: ['perception', 'melee'],
    };
    dwarf.skills.push(skill);
  }

  skill.experience += amount;

  // Level up: 150 XP = +0.1 levels (hunting is harder than fishing)
  const levelUp = Math.floor(skill.experience / 150);
  if (levelUp > 0) {
    skill.level = Math.min(1.0, skill.level + levelUp * 0.1);
    skill.experience -= levelUp * 150;

    emit(EVENTS.SKILL_LEVELED, {
      dwarf,
      skill: 'hunting',
      newLevel: skill.level,
    });
  }

  // Update proficiency based on level + personality (bravery helps)
  skill.proficiency = ((dwarf.personality?.bravery ?? 0.5) * 0.3) + (skill.level * 0.7);
}

/**
 * Check if animal is huntable
 */
function isHuntable(animal) {
  const huntableTypes = ['deer', 'rabbit', 'boar', 'bear', 'wolf'];
  return huntableTypes.includes(animal.subtype);
}

/**
 * Get hunting proficiency for display
 */
export function getHuntingProficiency(dwarf) {
  const skill = dwarf.skills?.find(s => s.name === 'hunting');
  if (!skill) return 0;

  return Math.round(skill.proficiency * 100);
}

/**
 * Check if dwarf is expert hunter
 */
export function isHuntingExpert(dwarf) {
  const skill = dwarf.skills?.find(s => s.name === 'hunting');
  return skill && skill.level > 0.6;
}

/**
 * Get tracking difficulty (for future advanced tracking system)
 */
export function getTrackingDifficulty(animal) {
  return {
    deer: 0.5,
    rabbit: 0.3,
    boar: 0.6,
    bear: 0.7,
    wolf: 0.8,
  }[animal.subtype] || 0.5;
}
