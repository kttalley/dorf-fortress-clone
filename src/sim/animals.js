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
