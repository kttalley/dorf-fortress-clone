/**
 * Unified Drive System
 * All entities (dwarves, animals, factions) use the same drive mechanics
 * Drives are floating-point values 0-100 that decay over time
 */

// === DRIVE CONFIGURATION ===
export const DRIVE_CONFIG = {
  hunger: {
    decayRate: 0.8,           // Per tick when not eating (0-1)
    decayRatePerTick: 1.0,    // Units per tick
    satisfyAmount: 50,        // Amount reduced by eating food
    satisfyAmountPerWork: 5,  // Minor satisfaction from active work
    criticalThreshold: 85,    // Point of desperation
    maxValue: 100,
    minValue: 0,
  },

  fear: {
    decayRate: 0.95,          // Slow decay (threats persist in memory)
    decayRatePerTick: 0.5,
    satisfyAmount: 100,       // Fully satisfied by reaching safe distance
    criticalThreshold: 75,
    maxValue: 100,
    minValue: 0,
  },

  sociability: {
    decayRate: 0.98,          // Very slow decay (social needs are long-term)
    decayRatePerTick: 0.3,
    satisfyAmount: 25,        // Per social interaction
    criticalThreshold: 90,    // Driven to seek company
    maxValue: 100,
    minValue: -100,           // Can be negative (avoid others)
  },

  territoriality: {
    decayRate: 0.99,          // Extremely slow decay
    decayRatePerTick: 0.2,
    satisfyAmount: 50,        // By marking/defending territory
    criticalThreshold: 80,
    maxValue: 100,
    minValue: 0,
  },

  exploration: {
    decayRate: 0.9,
    decayRatePerTick: 0.6,
    satisfyAmount: 30,        // By visiting new area
    criticalThreshold: 70,
    maxValue: 100,
    minValue: 0,
  },

  reproduction: {
    decayRate: 0.97,          // Slower than hunger, faster than social
    decayRatePerTick: 0.4,
    satisfyAmount: 100,       // Reset by mating
    criticalThreshold: 85,
    maxValue: 100,
    minValue: 0,
  },
};

// === DRIVE NAMES ===
export const DRIVE_NAMES = Object.keys(DRIVE_CONFIG);

/**
 * Initialize drives for an entity
 * Respects entity-specific drive availability
 */
export function initializeDrives(entity, startingValues = {}) {
  const drives = {};

  // All entities get hunger if they can eat
  if (entity.type === 'dwarf' || entity.type === 'animal' || ['human', 'elf', 'goblin'].includes(entity.type)) {
    drives.hunger = startingValues.hunger ?? 30;  // Start somewhat fed
  }

  // All entities get fear
  drives.fear = startingValues.fear ?? 0;

  // Social drives for most entities
  if (entity.type !== 'resource' && entity.type !== 'food') {
    const trait = entity.personality?.friendliness ?? 0.5;
    drives.sociability = startingValues.sociability ?? (trait > 0.6 ? 40 : 20);
  }

  // Territoriality for animals and territorial entities
  if (entity.type === 'animal' || ['human', 'elf', 'goblin'].includes(entity.type)) {
    drives.territoriality = startingValues.territoriality ?? 30;
  }

  // Exploration for intelligent entities
  if (entity.type === 'dwarf' || ['human', 'elf', 'goblin'].includes(entity.type)) {
    const trait = entity.personality?.curiosity ?? 0.5;
    drives.exploration = startingValues.exploration ?? (trait > 0.6 ? 50 : 30);
  }

  // Reproduction for animals
  if (entity.type === 'animal') {
    drives.reproduction = startingValues.reproduction ?? 0;
  }

  return drives;
}

/**
 * Decay all drives for an entity each tick
 * Call once per tick in the world loop
 */
export function decayDrives(entity, state) {
  if (!entity.drives) return;

  for (const [driveName, value] of Object.entries(entity.drives)) {
    if (value === undefined) continue;

    const config = DRIVE_CONFIG[driveName];
    if (!config) continue;

    // Decay: multiply by decay rate, then subtract per-tick amount
    const decayed = (value * (1 - config.decayRate / 1000)) - (config.decayRatePerTick / 10);

    // Clamp to valid range
    entity.drives[driveName] = Math.max(
      config.minValue,
      Math.min(config.maxValue, decayed)
    );
  }
}

/**
 * Satisfy a drive by reducing it
 */
export function satisfyDrive(entity, driveName, amount) {
  if (!entity.drives || !entity.drives[driveName]) return;

  const config = DRIVE_CONFIG[driveName];
  if (!config) return;

  entity.drives[driveName] = Math.max(
    config.minValue,
    entity.drives[driveName] - amount
  );
}

/**
 * Increase a drive (e.g., after seeing a threat)
 */
export function stimulateDrive(entity, driveName, amount) {
  if (!entity.drives || !entity.drives[driveName]) return;

  const config = DRIVE_CONFIG[driveName];
  if (!config) return;

  entity.drives[driveName] = Math.min(
    config.maxValue,
    entity.drives[driveName] + amount
  );
}

/**
 * Get the currently dominant drive
 * Returns { drive: string, urgency: 0-100 }
 */
export function getDominantDrive(entity) {
  if (!entity.drives) return { drive: null, urgency: 0 };

  let maxDrive = null;
  let maxValue = -Infinity;

  for (const [name, value] of Object.entries(entity.drives)) {
    if (value > maxValue) {
      maxValue = value;
      maxDrive = name;
    }
  }

  return { drive: maxDrive, urgency: Math.max(0, maxValue) };
}

/**
 * Get all drives ranked by urgency
 */
export function rankDrives(entity) {
  if (!entity.drives) return [];

  return Object.entries(entity.drives)
    .map(([name, value]) => ({ drive: name, urgency: Math.max(0, value) }))
    .sort((a, b) => b.urgency - a.urgency);
}

/**
 * Check if a drive is critical (above threshold)
 */
export function isDriveCritical(entity, driveName) {
  if (!entity.drives || !entity.drives[driveName]) return false;

  const config = DRIVE_CONFIG[driveName];
  if (!config) return false;

  return entity.drives[driveName] > config.criticalThreshold;
}

/**
 * Get summary of entity's current drive state
 */
export function getDriveSummary(entity) {
  if (!entity.drives) return {};

  const summary = {};
  for (const [name, value] of Object.entries(entity.drives)) {
    const config = DRIVE_CONFIG[name];
    if (!config) continue;

    summary[name] = {
      value: Math.round(value * 10) / 10,
      critical: value > config.criticalThreshold,
      percentage: Math.round((value / config.maxValue) * 100),
    };
  }

  return summary;
}
