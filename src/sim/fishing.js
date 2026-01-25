/**
 * Fishing System
 * Fishing is a production activity for dwarves, not a hardcoded job
 * Requirements: adjacent to water, tool/skill level, weather influence
 */

import { getTile, inBounds } from '../map/map.js';
import { getTileDef } from '../map/tiles.js';
import { stimulateDrive, satisfyDrive } from './drives.js';
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
 * Check if dwarf can fish at a location
 */
export function canFishAt(dwarf, x, y, state) {
  if (!dwarf || dwarf.hp <= 0) return false;

  // Must be adjacent to water
  if (!hasWaterAdjacent(x, y, state.map)) {
    return false;
  }

  // Must have fishing tool or decent fishing skill
  const hasFishingRod = dwarf.inventory?.some(item => item.type === 'fishing_rod');
  const fishingSkill = dwarf.skills?.find(s => s.name === 'fishing');

  if (!hasFishingRod && (!fishingSkill || fishingSkill.level < FISHING_CONFIG.MIN_SKILL_TO_FISH)) {
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

  // Get fishing skill
  let fishingSkill = dwarf.skills?.find(s => s.name === 'fishing');
  const skillLevel = fishingSkill?.level ?? 0;
  const proficiency = fishingSkill?.proficiency ?? 0;

  // Weather modifier
  const weather = state.weather?.getWeatherAt(dwarf.x, dwarf.y);
  let weatherMod = 1.0;
  if (weather?.rain || weather?.dominant === 'RAIN') {
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
    if (!inBounds(adj.x, adj.y, map)) continue;

    const tile = getTile(adj.x, adj.y, map);
    if (tile.type === 'water' || tile.type === 'river') {
      return true;
    }
  }

  return false;
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
