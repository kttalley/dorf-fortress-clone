/**
 * Scenario Schema & Validation
 * Defines valid parameter ranges and validates LLM-generated scenarios
 *
 * Agent G ownership: coherent, repeatable scenario generation
 */

/**
 * Valid terrain types that map to existing map generation modes
 */
export const VALID_TERRAINS = Object.freeze([
  'biome',      // Surface world with elevation-based biomes
  'mixed',      // Underground + surface hybrid
  'cave',       // Full underground cavern system
]);

/**
 * Valid difficulty modifiers
 */
export const VALID_DIFFICULTIES = Object.freeze([
  'peaceful',   // Abundant resources, slow hunger
  'normal',     // Default balance
  'harsh',      // Scarce resources, faster hunger
  'brutal',     // Minimal resources, very fast hunger
]);

/**
 * Valid biome emphasis options (for biome terrain type)
 */
export const VALID_BIOME_EMPHASIS = Object.freeze([
  'balanced',   // Default distribution
  'mountain',   // More elevation, rocky terrain
  'forest',     // Dense vegetation
  'marsh',      // Wet lowlands
  'desert',     // Arid plains
]);

/**
 * Parameter ranges for validation
 * Safe bounds to prevent game-breaking configs
 */
export const PARAMETER_RANGES = Object.freeze({
  mapWidth: { min: 40, max: 100, default: 64 },
  mapHeight: { min: 16, max: 40, default: 24 },
  dwarfCount: { min: 3, max: 20, default: 7 },
  initialFood: { min: 500, max: 5000, default: 1500 },
  foodSources: { min: 5, max: 30, default: 15 },
  hungerRate: { min: 0.5, max: 3.0, default: 1.0 },
  foodRespawnRate: { min: 0.5, max: 2.0, default: 1.0 },
});

/**
 * JSON Schema for scenario validation
 * Used to validate LLM output structure
 */
export const SCENARIO_SCHEMA = {
  type: 'object',
  required: ['title', 'description', 'parameters'],
  properties: {
    title: {
      type: 'string',
      minLength: 2,
      maxLength: 40,
      description: 'Short scenario name (1-4 words)',
    },
    description: {
      type: 'string',
      minLength: 10,
      maxLength: 200,
      description: 'Flavor text (1-2 sentences, ≤30 words)',
    },
    parameters: {
      type: 'object',
      required: ['terrain', 'dwarfCount'],
      properties: {
        terrain: {
          type: 'string',
          enum: VALID_TERRAINS,
        },
        biomeEmphasis: {
          type: 'string',
          enum: VALID_BIOME_EMPHASIS,
        },
        difficulty: {
          type: 'string',
          enum: VALID_DIFFICULTIES,
        },
        mapWidth: {
          type: 'number',
          minimum: PARAMETER_RANGES.mapWidth.min,
          maximum: PARAMETER_RANGES.mapWidth.max,
        },
        mapHeight: {
          type: 'number',
          minimum: PARAMETER_RANGES.mapHeight.min,
          maximum: PARAMETER_RANGES.mapHeight.max,
        },
        dwarfCount: {
          type: 'number',
          minimum: PARAMETER_RANGES.dwarfCount.min,
          maximum: PARAMETER_RANGES.dwarfCount.max,
        },
        initialFood: {
          type: 'number',
          minimum: PARAMETER_RANGES.initialFood.min,
          maximum: PARAMETER_RANGES.initialFood.max,
        },
        foodSources: {
          type: 'number',
          minimum: PARAMETER_RANGES.foodSources.min,
          maximum: PARAMETER_RANGES.foodSources.max,
        },
        hungerRate: {
          type: 'number',
          minimum: PARAMETER_RANGES.hungerRate.min,
          maximum: PARAMETER_RANGES.hungerRate.max,
        },
        foodRespawnRate: {
          type: 'number',
          minimum: PARAMETER_RANGES.foodRespawnRate.min,
          maximum: PARAMETER_RANGES.foodRespawnRate.max,
        },
      },
    },
    victory_conditions: {
      type: 'array',
      items: {
        type: 'string',
        minLength: 5,
        maxLength: 100,
      },
      minItems: 1,
      maxItems: 5,
    },
  },
};

/**
 * Validate a scenario object against the schema
 * @param {object} scenario - Scenario object to validate
 * @returns {{ valid: boolean, errors: string[], sanitized: object|null }}
 */
export function validateScenario(scenario) {
  const errors = [];

  // Check required top-level fields
  if (!scenario || typeof scenario !== 'object') {
    return { valid: false, errors: ['Scenario must be an object'], sanitized: null };
  }

  // Validate title
  if (typeof scenario.title !== 'string') {
    errors.push('Title must be a string');
  } else if (scenario.title.length < 2 || scenario.title.length > 40) {
    errors.push('Title must be 2-40 characters');
  }

  // Validate description
  if (typeof scenario.description !== 'string') {
    errors.push('Description must be a string');
  } else if (scenario.description.length < 10 || scenario.description.length > 200) {
    errors.push('Description must be 10-200 characters');
  }

  // Validate parameters
  if (!scenario.parameters || typeof scenario.parameters !== 'object') {
    errors.push('Parameters must be an object');
  } else {
    const params = scenario.parameters;

    // Required: terrain
    if (!VALID_TERRAINS.includes(params.terrain)) {
      errors.push(`Terrain must be one of: ${VALID_TERRAINS.join(', ')}`);
    }

    // Required: dwarfCount
    if (typeof params.dwarfCount !== 'number') {
      errors.push('dwarfCount must be a number');
    } else if (!isInRange(params.dwarfCount, PARAMETER_RANGES.dwarfCount)) {
      errors.push(`dwarfCount must be ${PARAMETER_RANGES.dwarfCount.min}-${PARAMETER_RANGES.dwarfCount.max}`);
    }

    // Optional: validate if present
    if (params.biomeEmphasis !== undefined && !VALID_BIOME_EMPHASIS.includes(params.biomeEmphasis)) {
      errors.push(`biomeEmphasis must be one of: ${VALID_BIOME_EMPHASIS.join(', ')}`);
    }

    if (params.difficulty !== undefined && !VALID_DIFFICULTIES.includes(params.difficulty)) {
      errors.push(`difficulty must be one of: ${VALID_DIFFICULTIES.join(', ')}`);
    }

    if (params.mapWidth !== undefined && !isInRange(params.mapWidth, PARAMETER_RANGES.mapWidth)) {
      errors.push(`mapWidth must be ${PARAMETER_RANGES.mapWidth.min}-${PARAMETER_RANGES.mapWidth.max}`);
    }

    if (params.mapHeight !== undefined && !isInRange(params.mapHeight, PARAMETER_RANGES.mapHeight)) {
      errors.push(`mapHeight must be ${PARAMETER_RANGES.mapHeight.min}-${PARAMETER_RANGES.mapHeight.max}`);
    }

    if (params.initialFood !== undefined && !isInRange(params.initialFood, PARAMETER_RANGES.initialFood)) {
      errors.push(`initialFood must be ${PARAMETER_RANGES.initialFood.min}-${PARAMETER_RANGES.initialFood.max}`);
    }

    if (params.foodSources !== undefined && !isInRange(params.foodSources, PARAMETER_RANGES.foodSources)) {
      errors.push(`foodSources must be ${PARAMETER_RANGES.foodSources.min}-${PARAMETER_RANGES.foodSources.max}`);
    }

    if (params.hungerRate !== undefined && !isInRange(params.hungerRate, PARAMETER_RANGES.hungerRate)) {
      errors.push(`hungerRate must be ${PARAMETER_RANGES.hungerRate.min}-${PARAMETER_RANGES.hungerRate.max}`);
    }

    if (params.foodRespawnRate !== undefined && !isInRange(params.foodRespawnRate, PARAMETER_RANGES.foodRespawnRate)) {
      errors.push(`foodRespawnRate must be ${PARAMETER_RANGES.foodRespawnRate.min}-${PARAMETER_RANGES.foodRespawnRate.max}`);
    }
  }

  // Validate victory_conditions (optional but recommended)
  if (scenario.victory_conditions !== undefined) {
    if (!Array.isArray(scenario.victory_conditions)) {
      errors.push('victory_conditions must be an array');
    } else if (scenario.victory_conditions.length > 5) {
      errors.push('victory_conditions cannot exceed 5 items');
    } else {
      for (let i = 0; i < scenario.victory_conditions.length; i++) {
        const cond = scenario.victory_conditions[i];
        if (typeof cond !== 'string' || cond.length < 5 || cond.length > 100) {
          errors.push(`victory_conditions[${i}] must be a string (5-100 chars)`);
        }
      }
    }
  }

  if (errors.length > 0) {
    return { valid: false, errors, sanitized: null };
  }

  // Return sanitized scenario with defaults applied
  return {
    valid: true,
    errors: [],
    sanitized: sanitizeScenario(scenario),
  };
}

/**
 * Sanitize and apply defaults to a valid scenario
 * @param {object} scenario - Validated scenario object
 * @returns {object} Sanitized scenario with defaults
 */
export function sanitizeScenario(scenario) {
  const params = scenario.parameters;

  return {
    title: scenario.title.trim().substring(0, 40),
    description: scenario.description.trim().substring(0, 200),
    parameters: {
      terrain: params.terrain,
      biomeEmphasis: params.biomeEmphasis || 'balanced',
      difficulty: params.difficulty || 'normal',
      mapWidth: clampToRange(params.mapWidth, PARAMETER_RANGES.mapWidth),
      mapHeight: clampToRange(params.mapHeight, PARAMETER_RANGES.mapHeight),
      dwarfCount: clampToRange(params.dwarfCount, PARAMETER_RANGES.dwarfCount),
      initialFood: clampToRange(params.initialFood, PARAMETER_RANGES.initialFood),
      foodSources: clampToRange(params.foodSources, PARAMETER_RANGES.foodSources),
      hungerRate: clampToRange(params.hungerRate, PARAMETER_RANGES.hungerRate),
      foodRespawnRate: clampToRange(params.foodRespawnRate, PARAMETER_RANGES.foodRespawnRate),
    },
    victory_conditions: scenario.victory_conditions || ['Survive 50 days'],
    seed: scenario.seed || Date.now(),
  };
}

/**
 * Check if value is within range
 */
function isInRange(value, range) {
  if (typeof value !== 'number' || isNaN(value)) return false;
  return value >= range.min && value <= range.max;
}

/**
 * Clamp value to range, using default if undefined
 */
function clampToRange(value, range) {
  if (value === undefined || typeof value !== 'number' || isNaN(value)) {
    return range.default;
  }
  return Math.max(range.min, Math.min(range.max, Math.round(value * 100) / 100));
}

/**
 * Get difficulty modifiers for game state
 * @param {string} difficulty - Difficulty level
 * @returns {object} Modifier values
 */
export function getDifficultyModifiers(difficulty) {
  const modifiers = {
    peaceful: {
      hungerMultiplier: 0.5,
      foodSpawnMultiplier: 1.5,
      initialFoodMultiplier: 1.5,
    },
    normal: {
      hungerMultiplier: 1.0,
      foodSpawnMultiplier: 1.0,
      initialFoodMultiplier: 1.0,
    },
    harsh: {
      hungerMultiplier: 1.5,
      foodSpawnMultiplier: 0.7,
      initialFoodMultiplier: 0.7,
    },
    brutal: {
      hungerMultiplier: 2.0,
      foodSpawnMultiplier: 0.5,
      initialFoodMultiplier: 0.5,
    },
  };

  return modifiers[difficulty] || modifiers.normal;
}
