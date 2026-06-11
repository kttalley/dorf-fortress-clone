/**
 * Animal Entity System
 * Animals are first-class simulated entities with drives, perception, and lifecycle
 */

import { nextId } from './entities.js';
import { initializeDrives } from './drives.js';
import { initializePerception } from './perception.js';

// === ANIMAL SPECIES DEFINITIONS ===
export const ANIMAL_SPECIES = {
  deer: {
    diet: 'herbivore',
    size: 'medium',
    baseHp: 15,
    reproductionRate: 0.15,    // Probability per 100 ticks (adult)
    lifespan: 4000,            // Ticks
    hungerDecayRate: 1.2,      // Compared to baseline
    prey: ['grass', 'shrub'],
    predators: ['wolf', 'dwarf'],
    speed: 1.2,
    threatLevel: 'harmless',
  },
  rabbit: {
    diet: 'herbivore',
    size: 'small',
    baseHp: 3,
    reproductionRate: 0.25,    // Fast reproducers
    lifespan: 2000,
    hungerDecayRate: 1.5,      // Fast metabolism
    prey: ['grass'],
    predators: ['wolf', 'eagle', 'dwarf'],
    speed: 1.4,
    threatLevel: 'harmless',
  },
  wolf: {
    diet: 'carnivore',
    size: 'large',
    baseHp: 20,
    reproductionRate: 0.08,
    lifespan: 6000,
    hungerDecayRate: 0.9,      // Slower hunger
    prey: ['deer', 'rabbit'],
    predators: [],
    speed: 1.3,
    threatLevel: 'dangerous',
  },
  boar: {
    diet: 'omnivore',
    size: 'large',
    baseHp: 18,
    reproductionRate: 0.12,
    lifespan: 5000,
    hungerDecayRate: 1.0,
    prey: ['grass', 'rabbit'],
    predators: ['dwarf'],
    speed: 1.0,
    threatLevel: 'dangerous',
  },
  frog: {
    diet: 'carnivore',
    size: 'small',
    baseHp: 2,
    reproductionRate: 0.2,
    lifespan: 3000,
    hungerDecayRate: 1.3,
    prey: ['insect'],
    predators: ['eagle', 'dwarf'],
    speed: 0.8,
    habitat: 'water',
    threatLevel: 'harmless',
  },
  bear: {
    diet: 'omnivore',
    size: 'large',
    baseHp: 30,
    reproductionRate: 0.05,
    lifespan: 8000,
    hungerDecayRate: 0.8,
    prey: ['deer', 'rabbit', 'fish'],
    predators: [],
    speed: 1.1,
    threatLevel: 'lethal',
  },
};

// === ANIMAL FACTORY ===

/**
 * Create a new animal entity
 */
export function createAnimal(x, y, subtype, state = {}) {
  if (!ANIMAL_SPECIES[subtype]) {
    throw new Error(`Unknown animal subtype: ${subtype}`);
  }

  const id = nextId();
  const species = ANIMAL_SPECIES[subtype];

  const animal = {
    type: 'animal',
    subtype,
    id,
    name: null, // Animals unnamed unless player names them

    // Position
    x,
    y,
    momentum: { dx: 0, dy: 0 },

    // Stats
    hp: species.baseHp,
    maxHp: species.baseHp,
    size: species.size,
    speed: species.speed,
    damage: Math.ceil(species.baseHp / 5),

    // Lifecycle
    sex: Math.random() < 0.5 ? 'male' : 'female',
    age: 0.0, // 0 = newborn, 1 = adult/old age
    ageInTicks: 0,
    canReproduce: false,

    // Drives (simplified for animals)
    drives: initializeDrives(
      { type: 'animal', personality: { friendliness: 0.3 } },
      {
        hunger: 50,
        fear: 0,
        territoriality: 50,
        reproduction: 0,
      }
    ),

    // Perception
    perceptionRadius: 8,
    recentlyPerceivedEntities: new Map(),
    recentlyPerceivedLocations: new Map(),
    recentlyPerceivedThreat: null,
    recentlyPerceivedMate: null,
    territoryMarker: null,

    // Simple state machine
    state: 'idle',
    target: null,
    decisionTick: 0,
    decisionInterval: 10, // Reconsider every 10 ticks (faster than dwarves)

    // Species config (readonly reference)
    species,

    // Memory (minimal for animals)
    memory: {
      recentThreats: [],
      territoryMarker: null,
    },
  };

  return animal;
}

/**
 * Create a baby animal (offspring)
 */
export function createAnimalOffspring(parent1, parent2, state) {
  if (parent1.subtype !== parent2.subtype) {
    throw new Error('Cannot breed different animal types');
  }

  // Random spawn offset from parent
  const baseX = parent1.x + (Math.random() < 0.5 ? 1 : -1);
  const baseY = parent1.y + (Math.random() < 0.5 ? 1 : -1);

  const baby = createAnimal(baseX, baseY, parent1.subtype, state);

  // Newborn starts very young
  baby.age = 0;
  baby.ageInTicks = 0;

  return baby;
}

/**
 * Age an animal each tick
 * Manages lifecycle events (maturity, reproduction, death)
 */
export function ageAnimal(animal, state) {
  if (animal.hp <= 0) {
    animal.state = 'dead';
    return;
  }

  animal.ageInTicks++;

  // Age as fraction of lifespan
  animal.age = Math.min(1.0, animal.ageInTicks / animal.species.lifespan);

  // Can reproduce once mature (30% of lifespan)
  if (animal.age > 0.3 && !animal.canReproduce) {
    animal.canReproduce = true;
  }

  // Reproduction drive increases for mature animals
  if (animal.canReproduce && animal.state !== 'mating') {
    animal.drives.reproduction += 0.5;
    if (animal.drives.reproduction > 100) {
      animal.drives.reproduction = 100;
    }
  }

  // Death from old age
  if (animal.age >= 1.0) {
    animal.hp = 0;
    animal.state = 'dead';
  }
}

/**
 * Check if two animals can mate
 */
export function canMate(animal1, animal2) {
  if (!animal1 || !animal2) return false;
  if (animal1.subtype !== animal2.subtype) return false;
  if (animal1.sex === animal2.sex) return false;
  if (animal1.hp <= 0 || animal2.hp <= 0) return false;
  if (!animal1.canReproduce || !animal2.canReproduce) return false;

  return true;
}

/**
 * Get food value for an animal (for predators)
 */
export function getAnimalNutrition(animal) {
  return Math.max(1, Math.floor(animal.maxHp / 2));
}

/**
 * Get loot from dead animal
 */
export function getAnimalLoot(animal) {
  const loot = [];

  // Meat (based on size)
  const meatAmount = (() => {
    switch (animal.size) {
      case 'small':
        return 1 + Math.floor(Math.random() * 2);
      case 'medium':
        return 3 + Math.floor(Math.random() * 3);
      case 'large':
        return 5 + Math.floor(Math.random() * 5);
      default:
        return 2;
    }
  })();

  loot.push({
    type: 'meat',
    amount: meatAmount,
    nutrition: 10,
  });

  // Hide (60% chance)
  if (Math.random() < 0.6) {
    loot.push({
      type: 'hide',
      quality: 0.5 + Math.random() * 0.5,
    });
  }

  // Bone (40% chance, more if large)
  const boneChance = animal.size === 'large' ? 0.8 : 0.4;
  if (Math.random() < boneChance) {
    loot.push({
      type: 'bone',
      amount: Math.ceil(animal.size === 'small' ? 1 : animal.size === 'medium' ? 2 : 3),
    });
  }

  // Ivory, fangs, etc. (rare)
  if (Math.random() < 0.1) {
    loot.push({
      type: 'exotic',
      material: animal.subtype + '_part',
      value: 5,
    });
  }

  return loot;
}

/**
 * Check if animal should hunt
 */
export function shouldHunt(animal) {
  return (
    animal.drives?.hunger > 60 &&
    animal.species.diet !== 'herbivore' &&
    animal.hp > animal.maxHp * 0.5
  );
}

/**
 * Check if animal is fleeing threat
 */
export function isFleeing(animal) {
  return animal.state === 'fleeing' && animal.recentlyPerceivedThreat;
}

/**
 * Check if animal is hungry
 */
export function isHungry(animal) {
  return animal.drives?.hunger > 70;
}

// === ECOSYSTEM WIRING (audit WALK R2) ===

// Hard population cap so reproduction can't snowball the tick loop
export const MAX_ANIMALS = 40;

// Species weights per climate band. Herd sizes keep herbivores in visible
// groups while predators stay sparse.
const SPAWN_TABLES = {
  cold: [
    { subtype: 'deer', weight: 4, herd: [2, 4] },
    { subtype: 'rabbit', weight: 3, herd: [2, 3] },
    { subtype: 'wolf', weight: 2, herd: [1, 2] },
    { subtype: 'bear', weight: 1, herd: [1, 1] },
  ],
  temperate: [
    { subtype: 'deer', weight: 4, herd: [3, 5] },
    { subtype: 'rabbit', weight: 4, herd: [2, 4] },
    { subtype: 'boar', weight: 2, herd: [1, 2] },
    { subtype: 'wolf', weight: 1, herd: [1, 2] },
    { subtype: 'bear', weight: 1, herd: [1, 1] },
  ],
  hot: [
    { subtype: 'rabbit', weight: 4, herd: [2, 4] },
    { subtype: 'boar', weight: 3, herd: [1, 3] },
    { subtype: 'deer', weight: 2, herd: [2, 3] },
    { subtype: 'wolf', weight: 1, herd: [1, 1] },
  ],
};

const WALKABLE_SPAWN_TILES = new Set([
  'grass', 'tall_grass', 'dirt', 'forest_floor', 'cave_floor',
  'river_bank', 'sand', 'mountain_slope', 'marsh', 'moss',
  'shrub', 'flower', 'mushroom', 'berry_bush', 'rocky_ground',
  'snow', 'mud',
]);

function tileTypeAt(map, x, y) {
  if (x < 0 || x >= map.width || y < 0 || y >= map.height) return null;
  return map.tiles[y * map.width + x]?.type || null;
}

/**
 * Random walkable position, optionally near a predicate-matching tile
 * (frogs want water). Returns null when the map offers nothing.
 */
function findSpawnPosition(map, nearTileType = null) {
  for (let attempt = 0; attempt < 80; attempt++) {
    const x = Math.floor(Math.random() * map.width);
    const y = Math.floor(Math.random() * map.height);
    const type = tileTypeAt(map, x, y);
    if (!type || !WALKABLE_SPAWN_TILES.has(type)) continue;

    if (nearTileType) {
      let nearMatch = false;
      for (let dy = -3; dy <= 3 && !nearMatch; dy++) {
        for (let dx = -3; dx <= 3 && !nearMatch; dx++) {
          if (tileTypeAt(map, x + dx, y + dy) === nearTileType) nearMatch = true;
        }
      }
      if (!nearMatch) continue;
    }

    return { x, y };
  }
  return null;
}

function pickWeighted(table) {
  const total = table.reduce((sum, e) => sum + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of table) {
    roll -= entry.weight;
    if (roll <= 0) return entry;
  }
  return table[table.length - 1];
}

/**
 * Populate state.animals at worldgen with a climate-appropriate species mix
 * (audit WALK R2). Herbivores arrive in herds with shared territory markers,
 * frogs cling to water in wet biomes, predators stay rare.
 *
 * @param {object} state - World state (map with optional biome.climate)
 * @param {object} [options]
 * @param {number} [options.targetPopulation] - Animals to spawn (default scales with map)
 * @returns {Array} The animals that were spawned
 */
export function spawnAnimalsForBiome(state, options = {}) {
  const map = state.map;
  if (!map?.tiles?.length) return [];

  const climate = map.biome?.climate || {};
  const temp = typeof climate.avgTemperature === 'number' ? climate.avgTemperature : 0.5;
  const moisture = typeof climate.avgMoisture === 'number' ? climate.avgMoisture : 0.5;

  const band = temp < 0.35 ? 'cold' : temp > 0.65 ? 'hot' : 'temperate';
  const table = SPAWN_TABLES[band].slice();

  // Wet biomes croak
  if (moisture > 0.55) {
    table.push({ subtype: 'frog', weight: 3, herd: [2, 4], nearTile: 'river' });
  }

  const target = options.targetPopulation
    ?? Math.min(MAX_ANIMALS - 10, Math.max(12, Math.floor((map.width * map.height) / 250)));

  const spawned = [];
  let guard = 0;
  while (spawned.length < target && guard++ < 60) {
    const entry = pickWeighted(table);
    const herdSize = entry.herd[0] + Math.floor(Math.random() * (entry.herd[1] - entry.herd[0] + 1));
    const anchor = findSpawnPosition(map, entry.nearTile || null);
    if (!anchor) continue;

    for (let i = 0; i < herdSize && spawned.length < target; i++) {
      const x = Math.max(0, Math.min(map.width - 1, anchor.x + Math.floor(Math.random() * 5) - 2));
      const y = Math.max(0, Math.min(map.height - 1, anchor.y + Math.floor(Math.random() * 5) - 2));
      const animal = createAnimal(x, y, entry.subtype, state);
      // Herd members share a territory anchor so they drift back together
      animal.territoryMarker = { x: anchor.x, y: anchor.y };
      animal.memory.territoryMarker = animal.territoryMarker;
      // Stagger ages so the population doesn't mature/die in lockstep
      animal.ageInTicks = Math.floor(Math.random() * animal.species.lifespan * 0.5);
      animal.age = animal.ageInTicks / animal.species.lifespan;
      animal.canReproduce = animal.age > 0.3;
      spawned.push(animal);
    }
  }

  state.animals = state.animals || [];
  state.animals.push(...spawned);
  return spawned;
}

/**
 * Raise fear from perceived predators (species.predators — includes 'dwarf'
 * for prey species). Call at decision intervals after perceiveWorld; the
 * fear drive then powers decideAnimal's flee priority.
 */
export function updateAnimalFear(animal) {
  const threat = animal.recentlyPerceivedThreat;
  if (!threat?.entity) return;

  const predators = animal.species?.predators || [];
  const kind = threat.entity.subtype || threat.entity.type;
  if (!predators.includes(kind) && (threat.threatLevel || 0) < 0.5) return;

  // Closer threats are scarier; a predator inside half the perception radius
  // must clear the flee threshold (60) in one perception pass
  const proximity = Math.max(0, 1 - (threat.distance || 0) / (animal.perceptionRadius || 8));
  animal.drives.fear = Math.min(100, (animal.drives.fear || 0) + 35 + proximity * 45);
}

/**
 * Get display name for animal
 */
export function getAnimalDisplayName(animal) {
  if (animal.name) return animal.name;

  return `${capitalize(animal.subtype)} ${animal.sex === 'male' ? '♂' : '♀'}`;
}

function capitalize(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}
