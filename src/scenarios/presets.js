/**
 * Preset Scenarios
 * Hand-crafted fallback scenarios for when LLM is unavailable
 *
 * Each scenario is designed to be fun and playable.
 * Parameters are within safe ranges defined in scenarioSchema.js
 */

/**
 * Array of preset scenarios
 * Used as fallback when LLM generation fails or is unavailable
 */
export const PRESET_SCENARIOS = [
  {
    title: 'Mountain Stronghold',
    description: 'A hardy band establishes a fortress in the frozen peaks. Resources are scarce, but the rock is rich.',
    parameters: {
      terrain: 'biome',
      biomeEmphasis: 'mountain',
      difficulty: 'harsh',
      mapWidth: 64,
      mapHeight: 24,
      dwarfCount: 5,
      initialFood: 1200,
      foodSources: 8,
      hungerRate: 1.3,
      foodRespawnRate: 0.7,
    },
    victory_conditions: [
      'Survive 60 days',
      'Grow population to 12 dwarves',
      'No dwarf starves to death',
    ],
  },

  {
    title: 'Verdant Valley',
    description: 'A peaceful commune in a bountiful forest. Food is plentiful, and the community thrives.',
    parameters: {
      terrain: 'biome',
      biomeEmphasis: 'forest',
      difficulty: 'peaceful',
      mapWidth: 64,
      mapHeight: 24,
      dwarfCount: 10,
      initialFood: 2500,
      foodSources: 25,
      hungerRate: 0.7,
      foodRespawnRate: 1.5,
    },
    victory_conditions: [
      'Reach 20 dwarves',
      'Maintain high morale for 30 days',
      'Build a gathering hall',
    ],
  },

  {
    title: 'Cavern Delvers',
    description: 'Deep beneath the earth, a small expedition seeks fortune in the dark. Mushrooms glow in eternal twilight.',
    parameters: {
      terrain: 'cave',
      biomeEmphasis: 'balanced',
      difficulty: 'normal',
      mapWidth: 64,
      mapHeight: 24,
      dwarfCount: 7,
      initialFood: 1500,
      foodSources: 15,
      hungerRate: 1.0,
      foodRespawnRate: 1.0,
    },
    victory_conditions: [
      'Explore 75% of the cavern',
      'Survive 50 days',
      'Find and harvest crystals',
    ],
  },

  {
    title: 'Desert Nomads',
    description: 'Wanderers in an arid waste seek an oasis. Water is life, and life is precious.',
    parameters: {
      terrain: 'biome',
      biomeEmphasis: 'desert',
      difficulty: 'harsh',
      mapWidth: 80,
      mapHeight: 24,
      dwarfCount: 6,
      initialFood: 1000,
      foodSources: 6,
      hungerRate: 1.5,
      foodRespawnRate: 0.6,
    },
    victory_conditions: [
      'Find water source',
      'Survive 40 days',
      'Establish permanent settlement',
    ],
  },

  {
    title: 'The Last Colony',
    description: 'Three survivors of a great disaster must rebuild civilization from nothing. Every choice matters.',
    parameters: {
      terrain: 'mixed',
      biomeEmphasis: 'balanced',
      difficulty: 'brutal',
      mapWidth: 64,
      mapHeight: 24,
      dwarfCount: 3,
      initialFood: 800,
      foodSources: 5,
      hungerRate: 2.0,
      foodRespawnRate: 0.5,
    },
    victory_conditions: [
      'Survive 30 days',
      'Grow population to 8 dwarves',
      'No deaths in first 20 days',
    ],
  },

  {
    title: 'Marshland Settlers',
    description: 'Brave souls make their home in the misty wetlands. The ground is soft, but spirits are strong.',
    parameters: {
      terrain: 'biome',
      biomeEmphasis: 'marsh',
      difficulty: 'normal',
      mapWidth: 64,
      mapHeight: 24,
      dwarfCount: 8,
      initialFood: 1800,
      foodSources: 18,
      hungerRate: 1.0,
      foodRespawnRate: 1.2,
    },
    victory_conditions: [
      'Build on solid ground',
      'Survive 50 days',
      'Reach 15 dwarves',
    ],
  },

  {
    title: 'Expedition Prime',
    description: 'A well-supplied expedition ventures into uncharted territory. Map the unknown, claim the land.',
    parameters: {
      terrain: 'mixed',
      biomeEmphasis: 'balanced',
      difficulty: 'normal',
      mapWidth: 80,
      mapHeight: 30,
      dwarfCount: 12,
      initialFood: 2000,
      foodSources: 20,
      hungerRate: 0.9,
      foodRespawnRate: 1.0,
    },
    victory_conditions: [
      'Explore entire map',
      'Establish 3 outposts',
      'Survive 100 days',
    ],
  },

  {
    title: 'Fungal Kingdom',
    description: 'In the deepest caves, giant mushrooms tower like trees. A strange new world awaits cultivation.',
    parameters: {
      terrain: 'cave',
      biomeEmphasis: 'balanced',
      difficulty: 'peaceful',
      mapWidth: 64,
      mapHeight: 24,
      dwarfCount: 9,
      initialFood: 2200,
      foodSources: 22,
      hungerRate: 0.8,
      foodRespawnRate: 1.4,
    },
    victory_conditions: [
      'Harvest 100 mushrooms',
      'Reach 18 dwarves',
      'Survive 60 days without surface access',
    ],
  },

  {
    title: 'Frozen Depths',
    description: 'Ice-covered caverns hold ancient secrets. The cold preserves, but also kills the unprepared.',
    parameters: {
      terrain: 'cave',
      biomeEmphasis: 'mountain',
      difficulty: 'harsh',
      mapWidth: 64,
      mapHeight: 24,
      dwarfCount: 5,
      initialFood: 1100,
      foodSources: 7,
      hungerRate: 1.4,
      foodRespawnRate: 0.6,
    },
    victory_conditions: [
      'Find warm shelter',
      'Survive 45 days',
      'Discover ancient artifact',
    ],
  },

  {
    title: 'River Crossing',
    description: 'A fertile valley split by a great river. Control the crossing, control the land.',
    parameters: {
      terrain: 'biome',
      biomeEmphasis: 'balanced',
      difficulty: 'normal',
      mapWidth: 64,
      mapHeight: 24,
      dwarfCount: 8,
      initialFood: 1600,
      foodSources: 16,
      hungerRate: 1.0,
      foodRespawnRate: 1.1,
    },
    victory_conditions: [
      'Build bridge across river',
      'Establish settlements on both banks',
      'Survive 70 days',
    ],
  },
];

/**
 * Get a random preset scenario
 * @returns {object} Random preset scenario with seed
 */
export function getRandomPreset() {
  const index = Math.floor(Math.random() * PRESET_SCENARIOS.length);
  const preset = PRESET_SCENARIOS[index];

  return {
    ...preset,
    seed: Date.now(),
    isPreset: true,
  };
}

/**
 * Get preset by title (case-insensitive partial match)
 * @param {string} title - Title to search for
 * @returns {object|null} Matching preset or null
 */
export function getPresetByTitle(title) {
  const lower = title.toLowerCase();
  const preset = PRESET_SCENARIOS.find(p =>
    p.title.toLowerCase().includes(lower)
  );

  if (preset) {
    return {
      ...preset,
      seed: Date.now(),
      isPreset: true,
    };
  }

  return null;
}

/**
 * Get all preset titles for UI display
 * @returns {string[]} Array of preset titles
 */
export function getPresetTitles() {
  return PRESET_SCENARIOS.map(p => p.title);
}

/**
 * Get preset by index
 * @param {number} index - Index into PRESET_SCENARIOS array
 * @returns {object|null} Preset at index or null if out of bounds
 */
export function getPresetByIndex(index) {
  if (index < 0 || index >= PRESET_SCENARIOS.length) {
    return null;
  }

  return {
    ...PRESET_SCENARIOS[index],
    seed: Date.now(),
    isPreset: true,
  };
}
