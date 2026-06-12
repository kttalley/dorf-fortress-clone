/**
 * Fishing System
 * Fishing is a production activity for dwarves, not a hardcoded job
 * Requirements: adjacent to water, tool/skill level, weather influence
 */

import { getTile, inBounds } from '../map/map.js';
import { emit, EVENTS } from '../events/eventBus.js';

// === FISHING CONFIG ===
export const FISHING_CONFIG = {
  WATER_ADJACENCY_REQUIRED: true,
  BASE_CATCH_PROBABILITY: 0.15,  // 15% base catch rate
  SKILL_MODIFIER: 0.3,            // Skill increases chance by up to 30%
  WEATHER_RAIN_BONUS: 1.2,        // Rain increases catch rate
  MIN_SKILL_TO_FISH: 0.1,         // Can fish with 10% skill (basic)
  FISH_AMOUNT_BASE: 1,
  FISH_AMOUNT_BONUS: 3,           // Up to 4 fish with skill
  XP_PER_ATTEMPT: 1,
  XP_PER_CATCH: 5,
};

/**
 * Effective fishing ability: trained skill, or raw patience for the
 * untrained. No dwarf spawns with the fishing skill (generateSkills), so a
 * pure skill-level gate would make fishing unreachable — patience substitutes
 * until practice builds the real skill (awardFishingXP seeds it the same way).
 */
export function getFishingAbility(dwarf) {
  // Patience is a floor, not just a fallback: a freshly-seeded skill starts
  // at proficiency patience*0.3 (awardFishingXP), BELOW untrained patience —
  // without the floor, the first cast would weaken the next one
  const calm = (dwarf.personality?.patience ?? 0.5) * 0.5;
  // Tolerate the legacy object-map skills shape (real dwarves use arrays)
  const skill = Array.isArray(dwarf.skills)
    ? dwarf.skills.find(s => s.name === 'fishing')
    : null;
  if (!skill) return calm;
  return Math.max(skill.level, skill.proficiency, calm);
}

/**
 * Check if dwarf can fish at a location
 */
export function canFishAt(dwarf, x, y, state) {
  if (!dwarf || dwarf.hp <= 0) return false;

  // Must be adjacent to water
  if (!hasWaterAdjacent(x, y, state.map)) {
    return false;
  }

  // Must have fishing tool or enough ability for basic hand-line fishing
  const hasFishingRod = dwarf.inventory?.some(item => item.type === 'fishing_rod');
  if (!hasFishingRod && getFishingAbility(dwarf) < FISHING_CONFIG.MIN_SKILL_TO_FISH) {
    return false;
  }

  return true;
}

/**
 * Attempt to fish (called each tick while fishing)
 */
export function attemptFish(dwarf, state) {
  if (!dwarf || dwarf.hp <= 0) {
    return { success: false, reason: 'incapacitated' };
  }

  // Water must still be adjacent
  if (!hasWaterAdjacent(dwarf.x, dwarf.y, state.map)) {
    return { success: false, reason: 'no_water' };
  }

  // Effective ability (untrained dwarves fish on patience — see getFishingAbility)
  const proficiency = getFishingAbility(dwarf);

  // Weather modifier
  const weather = state.weather?.getWeatherAt(dwarf.x, dwarf.y);
  let weatherMod = 1.0;
  // Field ids are lowercase; rain density > 0.05 means it's actually raining here
  if ((weather?.rain || 0) > 0.05 || weather?.type === 'rain') {
    weatherMod = FISHING_CONFIG.WEATHER_RAIN_BONUS;
  }

  // Calculate catch probability
  const baseProbability = FISHING_CONFIG.BASE_CATCH_PROBABILITY;
  const skillBonus = proficiency * FISHING_CONFIG.SKILL_MODIFIER;
  const catchProb = (baseProbability + skillBonus) * weatherMod;

  // Award XP regardless of success
  awardFishingXP(dwarf, FISHING_CONFIG.XP_PER_ATTEMPT);

  // Attempt catch
  if (Math.random() < catchProb) {
    // Caught something!
    const baseAmount = FISHING_CONFIG.FISH_AMOUNT_BASE;
    const skillAmount = Math.floor(proficiency * FISHING_CONFIG.FISH_AMOUNT_BONUS);
    const totalAmount = baseAmount + skillAmount;

    // Create food at fishing location
    const food = {
      id: Math.random(),
      type: 'food',
      subtype: 'fish',
      x: dwarf.x,
      y: dwarf.y,
      amount: totalAmount,
      nutrition: 12,
    };

    state.foodSources?.push(food);

    // Award XP bonus for successful catch
    awardFishingXP(dwarf, FISHING_CONFIG.XP_PER_CATCH);

    emit(EVENTS.FISHING_SUCCESS, {
      dwarf,
      amount: totalAmount,
      location: { x: dwarf.x, y: dwarf.y },
    });

    return { success: true, amount: totalAmount };
  }

  // No catch this tick, but XP awarded
  emit(EVENTS.FISHING_ATTEMPT, {
    dwarf,
    success: false,
  });

  return { success: false, reason: 'no_catch' };
}

/**
 * Award fishing skill XP
 */
export function awardFishingXP(dwarf, amount) {
  if (!dwarf.skills) dwarf.skills = [];

  let skill = dwarf.skills.find(s => s.name === 'fishing');

  if (!skill) {
    // Create skill if doesn't exist
    skill = {
      name: 'fishing',
      level: 0,
      experience: 0,
      proficiency: (dwarf.personality?.patience ?? 0.5) * 0.5,
      category: 'production',
      prerequisites: ['perception'],
    };
    dwarf.skills.push(skill);
  }

  skill.experience += amount;

  // Level up: 100 XP = +0.1 levels
  const levelUp = Math.floor(skill.experience / 100);
  if (levelUp > 0) {
    skill.level = Math.min(1.0, skill.level + levelUp * 0.1);
    skill.experience -= levelUp * 100;

    // Emit skill leveled event
    emit(EVENTS.SKILL_LEVELED, {
      dwarf,
      skill: 'fishing',
      newLevel: skill.level,
    });
  }

  // Update proficiency based on level + personality
  skill.proficiency = ((dwarf.personality?.patience ?? 0.5) * 0.3) + (skill.level * 0.7);
}

/**
 * Check if location has water adjacent
 */
function hasWaterAdjacent(x, y, map) {
  const adjacentTiles = [
    { x: x + 1, y: y },
    { x: x - 1, y: y },
    { x: x, y: y + 1 },
    { x: x, y: y - 1 },
    { x: x + 1, y: y + 1 },
    { x: x - 1, y: y + 1 },
    { x: x + 1, y: y - 1 },
    { x: x - 1, y: y - 1 },
  ];

  for (const adj of adjacentTiles) {
    if (!inBounds(map, adj.x, adj.y)) continue;

    const tile = getTile(map, adj.x, adj.y);
    if (isWaterTile(tile?.type)) {
      return true;
    }
  }

  return false;
}

/**
 * Water tile check matching the real tile ids (water_shallow / water_deep /
 * river — there is no plain 'water' type in tiles.js)
 */
export function isWaterTile(type) {
  return type === 'river' || type === 'water_shallow' || type === 'water_deep';
}

/**
 * Get fishing proficiency for display
 */
export function getFishingProficiency(dwarf) {
  const skill = dwarf.skills?.find(s => s.name === 'fishing');
  if (!skill) return 0;

  return Math.round(skill.proficiency * 100);
}

/**
 * Check if dwarf is good enough at fishing
 */
export function isFishingExpert(dwarf) {
  const skill = dwarf.skills?.find(s => s.name === 'fishing');
  return skill && skill.level > 0.7;
}
