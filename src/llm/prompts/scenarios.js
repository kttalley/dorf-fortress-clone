/**
 * Scenario Generator Prompt Templates
 * Generates themed starting scenarios with parameter suggestions
 *
 * Design constraints:
 * - Total prompt < 800 tokens
 * - Output: JSON { title, description, parameters, victory_conditions }
 * - Title: 1-4 words
 * - Description: 1-2 sentences (≤30 words)
 * - Parameters must be within safe ranges
 */

import {
  VALID_TERRAINS,
  VALID_DIFFICULTIES,
  VALID_BIOME_EMPHASIS,
  PARAMETER_RANGES,
} from '../../scenarios/scenarioSchema.js';

// === SYSTEM PROMPT ===
export const SYSTEM_SCENARIO_GENERATOR = `You are a creative dwarf fortress scenario designer.
Output valid JSON only. Be imaginative but keep parameters within specified ranges.

JSON format:
{
  "title": "1-4 word scenario name",
  "description": "1-2 sentence flavor text (max 30 words)",
  "parameters": {
    "terrain": "biome|mixed|cave",
    "biomeEmphasis": "balanced|mountain|forest|marsh|desert",
    "difficulty": "peaceful|normal|harsh|brutal",
    "dwarfCount": 3-20,
    "foodSources": 5-30,
    "hungerRate": 0.5-3.0,
    "foodRespawnRate": 0.5-2.0
  },
  "victory_conditions": ["goal 1", "goal 2"]
}`;

// === USER PROMPT TEMPLATE ===
export const USER_SCENARIO_GENERATOR = `Generate a unique dwarf fortress scenario.

Valid parameters:
- terrain: ${VALID_TERRAINS.join(', ')}
- biomeEmphasis: ${VALID_BIOME_EMPHASIS.join(', ')} (only for biome terrain)
- difficulty: ${VALID_DIFFICULTIES.join(', ')}
- dwarfCount: ${PARAMETER_RANGES.dwarfCount.min}-${PARAMETER_RANGES.dwarfCount.max}
- foodSources: ${PARAMETER_RANGES.foodSources.min}-${PARAMETER_RANGES.foodSources.max}
- hungerRate: ${PARAMETER_RANGES.hungerRate.min}-${PARAMETER_RANGES.hungerRate.max} (1.0 = normal)
- foodRespawnRate: ${PARAMETER_RANGES.foodRespawnRate.min}-${PARAMETER_RANGES.foodRespawnRate.max} (1.0 = normal)

Create something thematic. Examples: harsh mountain survival, lush valley commune, deep cave expedition, desert nomads.

Victory conditions should be achievable goals like "survive 50 days", "reach 15 dwarves", "explore 80% of map".

Respond with JSON only.`;

// === THEMED PROMPT VARIANTS ===
// Used to guide LLM toward specific scenario types

export const THEMED_PROMPTS = {
  mountain: `Generate a mountain-themed dwarf fortress scenario.
Focus on: harsh weather, rocky terrain, isolated stronghold, mining.
Use terrain "biome" with biomeEmphasis "mountain".
Higher difficulty, fewer initial dwarves, scarce food.
JSON only.`,

  underground: `Generate a deep underground dwarf fortress scenario.
Focus on: cavern exploration, mushroom farming, crystal mining, darkness.
Use terrain "cave".
Medium difficulty, small hardy group.
JSON only.`,

  valley: `Generate a lush valley dwarf fortress scenario.
Focus on: abundant nature, social harmony, farming, community growth.
Use terrain "biome" with biomeEmphasis "forest" or "balanced".
Lower difficulty, more dwarves, plentiful food.
JSON only.`,

  survival: `Generate a brutal survival dwarf fortress scenario.
Focus on: scarcity, desperate choices, against all odds.
Use terrain "mixed" or "cave".
Harsh/brutal difficulty, few dwarves, minimal food.
JSON only.`,

  expedition: `Generate an expedition dwarf fortress scenario.
Focus on: exploration, mapping unknown terrain, discovery.
Use terrain "mixed".
Normal difficulty, small mobile group.
Victory should involve exploration goals.
JSON only.`,
};

/**
 * Format the complete scenario generation prompt
 * @param {object} options - Prompt options
 * @param {string} options.theme - Optional theme hint (mountain, underground, valley, survival, expedition)
 * @param {string} options.customHint - Optional custom flavor hint
 * @returns {{ system: string, user: string }}
 */
export function formatScenarioPrompt(options = {}) {
  const { theme, customHint } = options;

  let userPrompt = USER_SCENARIO_GENERATOR;

  // Add theme-specific guidance
  if (theme && THEMED_PROMPTS[theme]) {
    userPrompt = THEMED_PROMPTS[theme] + '\n\n' + userPrompt;
  }

  // Add custom hint if provided
  if (customHint) {
    userPrompt = `Theme hint: ${customHint}\n\n` + userPrompt;
  }

  return {
    system: SYSTEM_SCENARIO_GENERATOR,
    user: userPrompt,
  };
}

/**
 * Parse LLM response into structured scenario data
 * @param {string} response - Raw LLM output
 * @returns {object|null} Parsed scenario or null on failure
 */
export function parseScenarioResponse(response) {
  if (!response || typeof response !== 'string') {
    return null;
  }

  try {
    // Try direct JSON parse
    const trimmed = response.trim();
    const parsed = JSON.parse(trimmed);
    return parsed;
  } catch (e) {
    // Try to extract JSON from markdown code block
    const jsonMatch = response.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/);
    if (jsonMatch) {
      try {
        return JSON.parse(jsonMatch[1]);
      } catch (e2) {
        // Fall through
      }
    }

    // Try to find raw JSON object
    const rawMatch = response.match(/\{[\s\S]*"title"[\s\S]*"parameters"[\s\S]*\}/);
    if (rawMatch) {
      try {
        return JSON.parse(rawMatch[0]);
      } catch (e3) {
        // Fall through
      }
    }
  }

  return null;
}

// === RESPONSE SCHEMA (for documentation) ===
export const RESPONSE_SCHEMA = {
  title: 'string (1-4 words, evocative scenario name)',
  description: 'string (1-2 sentences, ≤30 words, flavor text)',
  parameters: {
    terrain: `one of: ${VALID_TERRAINS.join(', ')}`,
    biomeEmphasis: `one of: ${VALID_BIOME_EMPHASIS.join(', ')} (optional, for biome terrain)`,
    difficulty: `one of: ${VALID_DIFFICULTIES.join(', ')}`,
    dwarfCount: `number ${PARAMETER_RANGES.dwarfCount.min}-${PARAMETER_RANGES.dwarfCount.max}`,
    foodSources: `number ${PARAMETER_RANGES.foodSources.min}-${PARAMETER_RANGES.foodSources.max}`,
    hungerRate: `number ${PARAMETER_RANGES.hungerRate.min}-${PARAMETER_RANGES.hungerRate.max}`,
    foodRespawnRate: `number ${PARAMETER_RANGES.foodRespawnRate.min}-${PARAMETER_RANGES.foodRespawnRate.max}`,
  },
  victory_conditions: 'array of strings (1-5 achievable goals)',
};
