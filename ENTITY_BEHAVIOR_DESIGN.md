# Entity Behavior System Design
## Comprehensive Guide to Emergent Behavior, Professions, Animals, and Factions

**Version:** 1.0  
**Author:** Simulation Architect  
**Date:** January 2026  
**Scope:** Replaces idle ping-ponging with goal-directed movement, emergent professions, and faction behavior

---

## Table of Contents

1. [Core Architecture](#core-architecture)
2. [Entity Taxonomy](#entity-taxonomy)
3. [Shared Systems](#shared-systems)
4. [Dwarf Profession & Crafting](#dwarf-profession--crafting)
5. [Animal Entity System](#animal-entity-system)
6. [External Factions](#external-factions)
7. [Integration Points](#integration-points)
8. [Implementation Roadmap](#implementation-roadmap)

---

## Core Architecture

### Design Principles

1. **Capabilities + Drives, Not Inheritance**
   - All entities are objects with capability flags and drive vectors
   - No class hierarchies; composition over inheritance
   - Behaviors are selected by presence of capabilities + current drive state

2. **Shared Movement & Perception Layer**
   - All entities use the same pathfinding, scent system, and perception rules
   - Deterministic, no per-tick randomness (use seeded PRNG if needed)
   - LLMs inform intent only; physics and state changes are deterministic

3. **Bounded Decision Intervals**
   - Heavy computations (LLM calls) happen at decision boundaries, not every tick
   - Most entities reconsider goals every N ticks (e.g., 20-50 ticks)
   - Tick loop remains fast; cognition is amortized

4. **Invariants & Constraints**
   - Entities never teleport
   - No direct state mutation from LLM output
   - Scent map and perception are canonical; intent is advisory
   - All entities degrade gracefully if LLM is unavailable

---

## Entity Taxonomy

### Core Entity Structure

Every entity shares this minimal schema:

```javascript
{
  // Identity & type
  id: number,
  type: 'dwarf' | 'animal' | 'human' | 'elf' | 'goblin',
  name: string,

  // Position & physics
  x: number,
  y: number,
  momentum: { dx: number, dy: number },
  speed: number, // Tiles per N ticks; default 1

  // Perception & cognition
  perceptionRadius: number,
  recentlyPerceivedEntities: Map<id, { entity, tick, distance }>,
  recentlyPerceivedLocations: Map<key, { x, y, type, tick, relevance }>,
  memory: {
    shortTerm: [...], // Last 10 significant events
    locations: {...}, // Named places (food source, threat)
  },

  // Drives & goals
  drives: {
    hunger: 0-100,       // Primary drive for all living things
    fear: 0-100,         // Threat response
    sociability: -50–50, // + = seeks others, - = avoids
    territoriality: 0-100, // Defend area
    exploration: 0-100,  // Seek new areas
  },
  currentGoal: null, // { type: string, target: {x, y} | entity, urgency: 0-100 }
  goalStack: [], // LIFO goal planning

  // Combat & threat
  hp: number,
  maxHp: number,
  damage: number,
  combatSkill: 0-1,
  threatLevel: 'harmless' | 'dangerous' | 'lethal',

  // AI state
  state: string, // 'idle' | 'moving' | 'fighting' | 'working' | etc.
  decisionTick: number, // Last tick this entity made a decision
  decisionInterval: number, // Ticks between decisions (20-50)
}
```

### Entity Capabilities Map

Capabilities determine what behaviors are available:

```javascript
const CAPABILITIES = {
  CAN_MOVE: true,              // All entities
  CAN_PERCEIVE: true,          // All entities
  CAN_EAT: true,               // Dwarves, animals
  CAN_SPEAK: ['dwarf', 'human', 'elf', 'goblin'], // LLM-consultable
  CAN_CRAFT: ['dwarf'],        // Requires workshop
  CAN_BUILD: ['dwarf'],        // Requires materials
  CAN_REPRODUCE: ['animal'],   // Animals only
  CAN_HUNT: ['dwarf', 'animal'], // Predators
  CAN_SWIM: ['animal'], // Some animals
  CAN_CLAIM_TERRITORY: ['animal', 'human', 'elf', 'goblin'],
  CAN_USE_TOOLS: ['dwarf', 'human', 'elf', 'goblin'],
};

// Runtime capability check:
function hasCapability(entity, capabilityName) {
  const cap = CAPABILITIES[capabilityName];
  if (Array.isArray(cap)) return cap.includes(entity.type);
  return cap;
}
```

---

## Shared Systems

### 1. Unified Perception System

All entities perceive via the same mechanism:

```javascript
/**
 * Entity perceives nearby world state
 * Called once per decision interval (not every tick)
 */
export function perceiveWorld(entity, state) {
  const { perceptionRadius, recentlyPerceivedEntities, recentlyPerceivedLocations } = entity;
  
  // Clear stale perceptions (older than 60 ticks)
  const now = state.tick;
  for (const [id, data] of recentlyPerceivedEntities.entries()) {
    if (now - data.tick > 60) recentlyPerceivedEntities.delete(id);
  }

  // 1. Scan nearby entities
  const nearby = state.allEntities.filter(e => 
    e.id !== entity.id &&
    distance(e, entity) <= perceptionRadius
  );

  for (const other of nearby) {
    const dist = distance(entity, other);
    const relevance = calculateRelevance(entity, other);
    recentlyPerceivedEntities.set(other.id, {
      entity: other,
      tick: now,
      distance: dist,
      relevance, // 0-1 scale
    });
  }

  // 2. Scan nearby locations (from memory, tiles, etc.)
  // Update location memory with current perceptions
  for (const loc of nearbyLocations(entity, state)) {
    const key = `${loc.x},${loc.y}`;
    recentlyPerceivedLocations.set(key, {
      x: loc.x,
      y: loc.y,
      type: loc.type, // 'food', 'threat', 'structure', 'water', etc.
      tick: now,
      relevance: calculateLocationRelevance(entity, loc),
    });
  }

  // 3. Update memory
  updateEntityMemory(entity, state);
}

/**
 * Calculate relevance score (0-1) for another entity
 */
function calculateRelevance(entity, other) {
  // Threats are most relevant
  if (isThreat(entity, other)) return 0.95;
  
  // Food sources are relevant to hungry entities
  if (other.type === 'food' && entity.drives.hunger > 40) return 0.80;
  
  // Social: relevant if entity is sociable and other is compatible
  if (entity.sociability > 0 && isSocial(other)) return 0.60;
  
  // Mates are very relevant to animals during mating season
  if (entity.type === 'animal' && isMate(entity, other)) return 0.85;
  
  return 0.20; // Background noise
}
```

### 2. Unified Drive System

Drives are floating-point values (0-100) that decay and are satisfied by actions:

```javascript
const DRIVE_CONFIG = {
  hunger: {
    decayRate: 0.8, // Per tick (when not eating/producing food)
    satisfyAmount: 50, // Amount satisfied by eating food
    satisfyAmount_work: 5, // Minor satisfaction from active work
    criticalThreshold: 85,
  },
  fear: {
    decayRate: 0.95, // Slow decay (threats last in memory)
    satisfyAmount: 100, // Fully satisfied by reaching safe distance
    criticalThreshold: 75,
  },
  sociability: {
    decayRate: 0.98, // Very slow (social needs are long-term)
    satisfyAmount: 25, // Per social interaction
    criticalThreshold: 90, // Driven to seek company
  },
  territoriality: {
    decayRate: 0.99, // Extremely slow
    satisfyAmount: 50, // By marking/defending territory
    criticalThreshold: 80,
  },
  exploration: {
    decayRate: 0.9,
    satisfyAmount: 30, // By visiting new area
    criticalThreshold: 70,
  },
};

/**
 * Decay all drives for an entity each tick
 */
export function decayDrives(entity, state) {
  for (const [driveName, config] of Object.entries(DRIVE_CONFIG)) {
    entity.drives[driveName] *= (1 - config.decayRate / 1000);
    entity.drives[driveName] = Math.max(0, Math.min(100, entity.drives[driveName]));
  }
}

/**
 * Get the currently dominant drive
 */
export function getDominantDrive(entity) {
  let maxDrive = null;
  let maxValue = -Infinity;
  
  for (const [name, value] of Object.entries(entity.drives)) {
    if (value > maxValue) {
      maxValue = value;
      maxDrive = name;
    }
  }
  
  return { drive: maxDrive, urgency: maxValue };
}
```

### 3. Unified Goal Stack & Decision Model

```javascript
/**
 * Entity reconsiders its goal (called at decision intervals)
 * Returns new goal or null to continue current goal
 */
export function evaluateGoals(entity, state) {
  const { hunger, fear } = entity.drives;
  const { currentGoal } = entity;
  
  // PRIORITY 1: IMMEDIATE THREATS
  if (fear > 70) {
    const safeDest = findSafePosition(entity, state);
    return {
      type: 'flee_threat',
      target: safeDest,
      urgency: 95,
      timeout: 30,
    };
  }

  // PRIORITY 2: CRITICAL HUNGER
  if (hunger > 85) {
    const foodSource = findNearestFood(entity, state);
    if (foodSource) {
      return {
        type: 'seek_food',
        target: foodSource,
        urgency: 90,
        timeout: 60,
      };
    }
  }

  // PRIORITY 3: CURRENT GOAL STILL VALID?
  if (currentGoal && isGoalValid(currentGoal, entity, state)) {
    return null; // Continue current goal
  }

  // PRIORITY 4: ENTITY-SPECIFIC GOAL SELECTION
  if (hasCapability(entity, 'CAN_SPEAK')) {
    // LLM-consultable entities decide via cognition
    return consultLLMForGoal(entity, state);
  }

  // For animals: pure drive-based goal
  if (entity.type === 'animal') {
    return selectAnimalGoal(entity, state);
  }

  // For external factions: faction-specific logic
  if (['human', 'elf', 'goblin'].includes(entity.type)) {
    return selectFactionGoal(entity, state);
  }

  // Fallback: explore
  return {
    type: 'explore',
    urgency: 30,
    timeout: 100,
  };
}

/**
 * Move entity one step toward goal
 * Uses scent, momentum, and pathfinding
 */
export function executeGoal(entity, goal, state) {
  // If goal has no target, it's abstract (e.g., 'take a break')
  if (!goal.target) {
    entity.state = 'idle';
    return;
  }

  // Calculate best next tile using movement system
  const nextTile = calculateNextMovement(entity, goal.target, state);
  
  if (nextTile) {
    entity.x = nextTile.x;
    entity.y = nextTile.y;
    entity.momentum = { dx: nextTile.x - entity.x, dy: nextTile.y - entity.y };
    entity.state = 'moving';
  } else {
    entity.state = 'stuck'; // Can't reach goal
  }

  // Check if goal is complete
  if (isGoalComplete(entity, goal, state)) {
    entity.currentGoal = null;
    satisfyDrive(entity, goal.type, DRIVE_CONFIG[correspondingDrive(goal.type)].satisfyAmount);
  }
}
```

---

## Dwarf Profession & Crafting

### Design: Professions Are Emergent

Dwarves do not have hardcoded professions. Instead, professions emerge from:
- **Skills acquired** (hours spent on activity)
- **Tools available** (workshops, materials)
- **Settlement needs** (what jobs are created)
- **Personality traits** (inclinations)

### Skill System

```javascript
const SKILL_TREE = {
  // Combat
  'melee': { category: 'combat', baseDifficulty: 0.4 },
  
  // Production
  'hunting': { category: 'production', baseDifficulty: 0.6, requires: ['perception', 'melee'] },
  'fishing': { category: 'production', baseDifficulty: 0.5, requires: ['patience', 'perception'] },
  'farming': { category: 'production', baseDifficulty: 0.3 },
  'cooking': { category: 'production', baseDifficulty: 0.4, requires: ['farming'] },
  'brewing': { category: 'production', baseDifficulty: 0.5, requires: ['cooking'] },
  
  // Crafting
  'carpentry': { category: 'crafting', baseDifficulty: 0.5, requires: ['melee'] },
  'metalworking': { category: 'crafting', baseDifficulty: 0.7, requires: ['carpentry'] },
  'masonry': { category: 'crafting', baseDifficulty: 0.4 },
  'leatherworking': { category: 'crafting', baseDifficulty: 0.6 },
  
  // Support
  'hauling': { category: 'support', baseDifficulty: 0.1 },
  'perception': { category: 'perception', baseDifficulty: 0.3 },
  'patience': { category: 'will', baseDifficulty: 0.2 },
};

/**
 * Dwarf skill object
 */
{
  name: 'fishing',
  level: 0.35, // 0.0-1.0, improves with practice
  experience: 450, // Ticks spent on this activity
  proficiency: 0.45, // How good they are (based on personality + level)
  
  // Derived from tree
  category: 'production',
  prerequisites: ['perception'],
}

/**
 * Award XP to dwarf for skill usage
 */
export function awardSkillXP(dwarf, skillName, amount = 1) {
  let skill = dwarf.skills.find(s => s.name === skillName);
  
  if (!skill) {
    // Create skill if doesn't exist
    const skillDef = SKILL_TREE[skillName];
    skill = {
      name: skillName,
      level: 0,
      experience: 0,
      proficiency: dwarf.personality.creativity * 0.5, // Base proficiency
      category: skillDef.category,
      prerequisites: skillDef.prerequisites || [],
    };
    dwarf.skills.push(skill);
  }

  skill.experience += amount;
  
  // Level up: 100 XP = +0.1 levels
  const levelUp = Math.floor(skill.experience / 100);
  if (levelUp > 0) {
    skill.level = Math.min(1.0, skill.level + levelUp * 0.1);
    skill.experience -= levelUp * 100;
  }
  
  // Proficiency influenced by personality + level
  skill.proficiency = (dwarf.personality.creativity * 0.3) + (skill.level * 0.7);
}

/**
 * Determine dwarf's primary profession based on skills
 */
export function getPrimaryProfession(dwarf) {
  // Find the highest-level skill
  const topSkill = dwarf.skills.reduce((best, skill) => 
    !best || skill.level > best.level ? skill : best
  );
  
  if (!topSkill || topSkill.level < 0.1) return 'Novice'; // No significant skill

  // Map skill to profession name
  const professionMap = {
    'hunting': 'Hunter',
    'fishing': 'Angler',
    'farming': 'Farmer',
    'cooking': 'Cook',
    'carpentry': 'Carpenter',
    'metalworking': 'Smith',
    'masonry': 'Mason',
    'melee': 'Soldier',
    // ... etc
  };
  
  return professionMap[topSkill.name] || 'Specialist';
}
```

### Fishing System

**Fishing is a production activity, not a hardcoded job.**

Conditions:
- Dwarf must be adjacent to water tile
- Dwarf must have fishing rod (created via crafting) or improvised tool
- Skill level affects catch rate and quality
- Success influenced by weather, time of day, season

```javascript
/**
 * Can entity fish at this location?
 */
export function canFishAt(dwarf, x, y, state) {
  // Must have water adjacent
  const waterAdjacent = checkAdjacent(x, y, state.map, t => 
    t.type === 'water' || t.type === 'river'
  );
  
  if (!waterAdjacent) return false;

  // Must have fishing tool or skill > 0.2
  const hasFishingRod = dwarf.inventory?.some(item => item.type === 'fishing_rod');
  const hasFishingSkill = dwarf.skills?.some(s => s.name === 'fishing' && s.level > 0.2);
  
  return hasFishingRod || hasFishingSkill;
}

/**
 * Attempt to fish (called each tick while fishing)
 */
export function attemptFish(dwarf, state) {
  // Water must still be adjacent
  if (!checkAdjacent(dwarf.x, dwarf.y, state.map, t => t.type === 'water')) {
    return { success: false, reason: 'no_water' };
  }

  const skill = dwarf.skills?.find(s => s.name === 'fishing');
  const skillLevel = skill?.proficiency || 0.1;
  
  // Weather modifier
  const weather = state.weather?.getWeatherAt(dwarf.x, dwarf.y);
  const weatherMod = weather?.rain ? 1.2 : 1.0; // Rain increases catches
  
  // Base catch probability
  const catchProb = (skillLevel * 0.3 + 0.1) * weatherMod;
  
  if (Math.random() < catchProb) {
    // Caught something!
    const amount = 1 + Math.floor(skillLevel * 3); // 1-4 food
    createFoodSource(dwarf.x, dwarf.y, amount, state);
    
    // Award XP
    awardSkillXP(dwarf, 'fishing', 5);
    
    return { success: true, amount };
  }
  
  // Tick spent fishing = XP, even without catch
  awardSkillXP(dwarf, 'fishing', 1);
  
  return { success: false, reason: 'no_catch' };
}
```

### Hunting System

**Hunting targets animal entities.**

```javascript
/**
 * Can entity hunt at this location?
 */
export function canHuntAt(dwarf, x, y, state) {
  // Check for animals nearby
  const nearbyAnimals = state.animals.filter(a =>
    distance(dwarf, a) <= 8 && // Hunt range
    isHuntable(a) && // Prey type
    a.hp > 0 // Not already dead
  );
  
  return nearbyAnimals.length > 0;
}

/**
 * Attempt to hunt (called each tick while hunting)
 */
export function attemptHunt(dwarf, targetAnimal, state) {
  const skill = dwarf.skills?.find(s => s.name === 'hunting');
  const skillLevel = skill?.proficiency || 0.1;
  
  // Distance to animal
  const dist = distance(dwarf, targetAnimal);
  
  // 1. CHASE phase: move toward animal
  if (dist > 1) {
    const nextTile = calculateNextMovement(dwarf, targetAnimal, state);
    if (nextTile) {
      dwarf.x = nextTile.x;
      dwarf.y = nextTile.y;
    }
    
    // Award tracking XP
    awardSkillXP(dwarf, 'hunting', 1);
    return { success: false, phase: 'chasing' };
  }
  
  // 2. ATTACK phase: in range
  const hitProb = skillLevel * 0.6; // 0-60% hit chance
  
  if (Math.random() < hitProb) {
    // Hit! Deal damage
    const damage = 2 + Math.floor(skillLevel * 3);
    targetAnimal.hp -= damage;
    
    awardSkillXP(dwarf, 'hunting', 10); // Big XP for hit
    
    if (targetAnimal.hp <= 0) {
      // Kill! Loot resources
      const loot = getAnimalLoot(targetAnimal); // meat, hides, bones
      for (const item of loot) {
        dwarf.inventory?.push(item);
      }
      
      awardSkillXP(dwarf, 'hunting', 20); // Huge XP for kill
      
      return { success: true, killed: true, loot };
    }
    
    return { success: false, phase: 'attacking', hit: true };
  }
  
  // Miss
  awardSkillXP(dwarf, 'hunting', 2);
  return { success: false, phase: 'attacking', hit: false };
}

function isHuntable(animal) {
  return ['deer', 'rabbit', 'boar', 'cow'].includes(animal.subtype);
}

function getAnimalLoot(animal) {
  const loot = [];
  
  loot.push({
    type: 'meat',
    amount: animal.maxHp / 5, // Scale with size
    nutrition: 10,
  });
  
  if (Math.random() < 0.6) {
    loot.push({
      type: 'hide',
      quality: 0.5 + Math.random() * 0.5,
    });
  }
  
  if (Math.random() < 0.3) {
    loot.push({
      type: 'bone',
      amount: 2 + Math.floor(Math.random() * 3),
    });
  }
  
  return loot;
}
```

---

## Animal Entity System

### Design: Animals Are First-Class Entities

Animals are **not** resources or decorations. They are:
- Simulated entities with drives, movement, and perception
- Potential threats or food sources
- Reproducers affecting settlement ecology
- Responsive to environmental conditions

### Animal Data Schema

```javascript
{
  type: 'animal',
  subtype: 'deer' | 'rabbit' | 'boar' | 'wolf' | 'eagle' | 'frog' | 'fish' | etc.
  id: number,
  name: null, // Animals unnamed unless named by player
  
  // Position
  x: number,
  y: number,
  momentum: { dx: number, dy: number },
  
  // Stats (vary by subtype)
  hp: number,
  maxHp: number,
  size: 'small' | 'medium' | 'large', // Affects diet, threat level
  speed: 0.8, // Faster than dwarves typically
  
  // Drives (same system as entities, but simpler)
  drives: {
    hunger: 0-100,
    fear: 0-100,
    territory: 0-100,
    reproduction: 0-100, // Animals only
  },
  
  // Reproduction
  sex: 'male' | 'female',
  age: 0.0-1.0, // 0 = newborn, 1 = adult
  ageInTicks: number,
  canReproduce: boolean,
  
  // Simple state machine
  state: 'idle' | 'grazing' | 'fleeing' | 'hunting' | 'mating' | 'dead',
  
  // Perception (simpler than entity perception)
  recentlyPerceivedThreat: null | { entity, distance, tick },
  recentlyPerceivedMate: null | { entity, distance, tick },
  territoryMarker: { x: number, y: number } | null,
  
  // Species config (readonly)
  species: {
    diet: 'herbivore' | 'carnivore' | 'omnivore',
    reproductionRate: 0.1, // Probability per 100 ticks (adult)
    lifespan: 3000, // Ticks
    hungerDecayRate: 1.2, // Compared to dwarves
    predators: ['wolf', 'dwarf'], // Who eats this
    prey: ['grass', 'rabbit'], // What it eats
  },
}
```

### Animal Behavior

Animals use a simple **state machine** without LLM:

```javascript
/**
 * Decide what animal should do (called every 10-20 ticks)
 */
export function decideAnimal(animal, state) {
  const { hunger, fear, territory } = animal.drives;
  
  // PRIORITY 1: IMMEDIATE THREAT
  if (fear > 60) {
    const threat = animal.recentlyPerceivedThreat;
    if (threat && distance(animal, threat.entity) < animal.perceptionRadius) {
      return {
        state: 'fleeing',
        target: findSafePosition(animal, threat.entity, state),
      };
    }
  }

  // PRIORITY 2: HUNGER
  if (hunger > 70 && animal.species.diet !== 'none') {
    const food = findNearestFood(animal, state);
    if (food) {
      return { state: 'grazing', target: food };
    }
  }

  // PRIORITY 3: REPRODUCTION (adult animals)
  if (animal.canReproduce && animal.drives.reproduction > 80) {
    const mate = findNearestMate(animal, state);
    if (mate && distance(animal, mate) < 4) {
      return { state: 'mating', target: mate };
    } else if (mate) {
      return { state: 'seeking_mate', target: mate };
    }
  }

  // PRIORITY 4: TERRITORY
  if (territory > 50 && animal.territoryMarker) {
    const distToTerritory = distance(animal, animal.territoryMarker);
    if (distToTerritory > 10) {
      return { state: 'returning_territory', target: animal.territoryMarker };
    }
  }

  // DEFAULT: WANDER / GRAZE
  return { state: 'idle', target: null };
}

/**
 * Act on animal decision (called every tick)
 */
export function actAnimal(animal, state) {
  // Decrement hunger and other drives
  animal.drives.hunger += 0.8; // Faster hunger than dwarves
  animal.drives.fear *= 0.97; // Threats fade from memory
  
  switch (animal.state) {
    case 'grazing':
      return actGrazing(animal, state);
    case 'fleeing':
      return actFleeing(animal, state);
    case 'hunting':
      return actHunting(animal, state);
    case 'mating':
      return actMating(animal, state);
    case 'idle':
      return actIdle(animal, state);
  }
}

/**
 * Animal grazes on nearby vegetation or forage
 */
function actGrazing(animal, state) {
  // Check if there's grass here
  const tile = getTile(animal.x, animal.y, state.map);
  
  if (tile.type === 'grass') {
    animal.drives.hunger -= 3; // Quick hunger satisfaction
    animal.drives.hunger = Math.max(0, animal.drives.hunger);
  }
  
  // If no grass, move toward it
  if (animal.drives.hunger > 40) {
    const grassTile = findNearestTile(animal, state.map, t => t.type === 'grass');
    if (grassTile) {
      executeSmartMovement(animal, grassTile, state);
    }
  }
}

/**
 * Animal reproduction
 */
function actMating(animal, state) {
  const mate = state.animals.find(a => 
    a.id === animal._mateTarget?.id && distance(animal, a) < 2
  );
  
  if (!mate || !canMate(animal, mate)) {
    animal.state = 'idle';
    return;
  }

  // Mate nearby dwarves: small probability per tick in range
  if (distance(animal, mate) < 2) {
    if (Math.random() < 0.01) { // 1% per tick = ~1% chance per second
      // Spawn offspring
      const baby = createAnimal(
        animal.x + (Math.random() < 0.5 ? 1 : -1),
        animal.y + (Math.random() < 0.5 ? 1 : -1),
        animal.subtype,
        state
      );
      baby.age = 0;
      state.animals.push(baby);
      
      // Both parents' reproduction drive reset
      animal.drives.reproduction = 0;
      mate.drives.reproduction = 0;
      
      emit(EVENTS.ANIMAL_BORN, { offspring: baby, parents: [animal, mate] });
    }
  }
}

/**
 * Animal ages each tick; lifecycle management
 */
export function ageAnimal(animal, state) {
  animal.age = Math.min(1.0, animal.age + 1 / animal.species.lifespan);
  animal.ageInTicks++;

  // Adult animals can reproduce
  if (animal.age > 0.3) {
    animal.canReproduce = true;
  }

  // Increment reproduction drive
  if (animal.canReproduce && animal.state !== 'mating') {
    animal.drives.reproduction += 0.5; // Slow increase
  }

  // Death from old age
  if (animal.age >= 1.0) {
    animal.hp = 0;
    animal.state = 'dead';
    emit(EVENTS.ANIMAL_DEATH, { animal, cause: 'old_age' });
  }
}
```

### Herbivore, Carnivore, Omnivore Distribution

```javascript
const ANIMAL_SPECIES = {
  deer: {
    diet: 'herbivore',
    size: 'medium',
    reproductionRate: 0.15,
    lifespan: 4000,
    prey: ['grass', 'shrub'],
    predators: ['wolf', 'dwarf'],
  },
  rabbit: {
    diet: 'herbivore',
    size: 'small',
    reproductionRate: 0.25, // Fast reproducers
    lifespan: 2000,
    prey: ['grass'],
    predators: ['wolf', 'eagle', 'dwarf'],
  },
  wolf: {
    diet: 'carnivore',
    size: 'large',
    reproductionRate: 0.08,
    lifespan: 6000,
    prey: ['deer', 'rabbit'],
    predators: [], // Top predator
    threatLevel: 'dangerous',
  },
  boar: {
    diet: 'omnivore',
    size: 'large',
    reproductionRate: 0.12,
    lifespan: 5000,
    prey: ['grass', 'rabbit'],
    predators: ['dwarf'],
    threatLevel: 'dangerous', // Will attack
  },
  frog: {
    diet: 'carnivore',
    size: 'small',
    reproductionRate: 0.2,
    lifespan: 3000,
    habitat: 'water',
    prey: ['insect', 'fly'],
    predators: ['eagle'],
  },
};
```

---

## External Factions

### Design: Factions as Simulated Actors

Factions (Humans, Elves, Goblins) are not scripted NPCs. They:
- Perceive dwarf settlement state (prosperity, threats, etc.)
- Make independent movement and decision choices
- Retain memory of past interactions
- Respond to current conditions, not predetermined paths

### Common Faction Entity Schema

```javascript
{
  type: 'human' | 'elf' | 'goblin',
  subtype: 'merchant' | 'settler' | 'scout' | 'missionary' | 'raider' | etc.
  id: number,
  name: string, // Generated by LLM
  bio: string, // Short background (LLM)
  
  // Identity
  faction: {
    id: string,      // Merchant caravan, elf tribe, goblin horde
    size: number,    // How many in this group
    cohesion: 0.5,   // How united (1.0 = army, 0.1 = loose group)
  },
  
  // Position & movement
  x: number, y: number,
  entryPoint: { x, y }, // Where they entered map
  exitPoint: { x, y },  // Where they leave from
  
  // Combat
  hp: number, maxHp: number,
  damage: number,
  combatSkill: 0.5,
  fleeThreshold: 0.3,
  
  // Drives & personality (LLM informs, not generates action)
  personality: {
    aggression: 0-1,
    greed: 0-1,
    caution: 0-1,
    honor: 0-1,
  },
  drives: {
    hunger: 0-100,
    fear: 0-100,
    greed: 0-100, // Desire for loot/resources
    idealism: 0-100, // Purpose-driven
  },
  
  // Perception of settlement
  settlementKnowledge: {
    prosperity: 0-100, // How rich they think dwarves are
    military: 0-100,   // How well defended
    threat: 0-100,     // Danger level
    lastUpdated: tick,
  },
  
  // Memory of interactions
  history: {
    pastTradesMade: number,
    dwarvesMet: [{ id, name, interaction, tick }],
    priorCombats: [{ tick, outcome, dwarvesKilled }],
    trustLevel: -100–100, // Per settlement
  },
  
  // Goals
  currentGoal: { type: string, target: null | {x, y} | entity },
  state: 'arriving' | 'active' | 'trading' | 'raiding' | 'fleeing' | 'leaving',
}
```

### HUMANS — Merchants & Settlers

**Behavior:**
- Attracted to dwarf prosperity signals (finished structures, wealth items)
- Seek trade or settlement opportunity
- Travel along edges (enter/exit predictably)
- Remember past relationships; disposition changes based on history

```javascript
const HUMAN_SUBTYPES = {
  merchant: {
    goal: 'trade',
    greedThreshold: 50,
    combatBehavior: 'flee_first', // Only fight if cornered
    satisfactionDrives: ['trade', 'profit'],
  },
  trader_caravan: {
    goal: 'trade',
    groupSize: 5-10, // Travel in groups
    weaponry: 'light',
  },
  settler: {
    goal: 'settle_nearby',
    groupSize: 10-20,
    weaponry: 'basic',
    stayDuration: 500-2000, // Ticks
  },
};

/**
 * Humans decide based on settlement prosperity signals
 */
export function decideHuman(human, state) {
  // Gather settlement intelligence
  const settlementSignals = assessSettlementSignals(state);
  
  // Update human's knowledge
  human.settlementKnowledge = settlementSignals;
  
  // Greed-based decision
  if (human.drives.greed > 70 && settlementSignals.prosperity > 60) {
    // Rush toward center to loot
    return {
      state: 'raiding',
      goal: { type: 'raid_settlement', target: findSettlementCenter(state) },
    };
  }
  
  // Safety check: if military threat too high, flee
  if (human.drives.fear > 70 || settlementSignals.military > 80) {
    return {
      state: 'fleeing',
      goal: { type: 'flee_settlement', target: human.exitPoint },
    };
  }
  
  // Otherwise, trade if close enough
  if (distance(human, findSettlementCenter(state)) < 8) {
    return {
      state: 'trading',
      goal: { type: 'trade', target: findSettlementCenter(state) },
    };
  }
  
  // Approach settlement
  return {
    state: 'approaching',
    goal: { type: 'approach_settlement', target: findSettlementCenter(state) },
  };
}

/**
 * Assess settlement state for external faction perception
 */
function assessSettlementSignals(state) {
  return {
    prosperity: calculateProsperitySignal(state),
    military: calculateMilitaryThreat(state),
    threat: calculateGeneralThreatLevel(state),
  };
}

function calculateProsperitySignal(state) {
  // Signals: number of structures, visible food, items on ground
  const structures = getPlayerStructures(state).length;
  const visibleFood = state.foodSources?.length || 0;
  
  // Scale 0-100
  return Math.min(100, (structures * 2) + (visibleFood * 5));
}

function calculateMilitaryThreat(state) {
  const dwarves = state.dwarves.length;
  const equippedDwarves = state.dwarves.filter(d => d.combatSkill > 0.3).length;
  
  return Math.min(100, (dwarves * 10) + (equippedDwarves * 20));
}
```

### ELVES — Missionaries & Observers

**Behavior:**
- Seek dwarf settlements for observation
- Prefer non-violence; leave if displeased
- Judge settlement ethics (are we over-hunting? cutting forests?)
- Leave negative/positive impression affecting future relations

```javascript
const ELF_SUBTYPES = {
  missionary: {
    goal: 'proselytize',
    combatBehavior: 'never', // Flee, never attack
    stayDuration: 300-1000,
    satisfactionDrives: ['harmony', 'conversion'],
  },
  scout: {
    goal: 'observe',
    combatBehavior: 'flee',
    stayDuration: 100-500,
  },
  diplomat: {
    goal: 'negotiate',
    combatBehavior: 'flee',
    stayDuration: 200-800,
  },
};

/**
 * Elves decide based on settlement ethics
 */
export function decideElf(elf, state) {
  // Assess settlement ethics
  const ethicsScore = assessSettlementEthics(state);
  
  // High forest destruction? Leave
  if (ethicsScore.forestDestruction > 70) {
    elf.state = 'displeased';
    return {
      state: 'leaving',
      goal: { type: 'leave_settlement', target: elf.exitPoint },
    };
  }
  
  // Respect nature? Stay longer
  if (ethicsScore.harmony > 60) {
    elf.drives.idealism -= 10; // Satisfied
    if (elf.subtype === 'missionary') {
      // Try to convert nearby dwarves
      const nearbyDwarf = findNearestDwarf(elf, state);
      if (nearbyDwarf && distance(elf, nearbyDwarf) < 3) {
        return {
          state: 'preaching',
          goal: { type: 'preach', target: nearbyDwarf },
        };
      }
    }
  }
  
  // Default: observe
  return {
    state: 'observing',
    goal: { type: 'observe', target: findSettlementCenter(state) },
  };
}

function assessSettlementEthics(state) {
  // Penalties: tree count lost, animal population
  const treesCut = calculateTreesCut(state);
  const animalHunted = calculateAnimalsHunted(state);
  
  return {
    forestDestruction: Math.min(100, treesCut * 2),
    animalCruelty: Math.min(100, animalHunted * 3),
    harmony: 100 - Math.max(...),
  };
}
```

### GOBLINS — Hostile Raiders

**Behavior:**
- Actively seek destruction
- Home in on non-goblin entities (prioritize targets)
- Escalate violence over time (learn from failures)
- No trade; no mercy

```javascript
const GOBLIN_SUBTYPES = {
  raider: {
    goal: 'destroy',
    combatBehavior: 'aggressive',
    tactics: 'overwhelm',
  },
  assassin: {
    goal: 'kill_target',
    combatBehavior: 'sneak_attack',
    tactics: 'ambush',
  },
  siege_leader: {
    goal: 'conquer_fort',
    combatBehavior: 'coordinated',
    tactics: 'siege',
  },
};

/**
 * Goblins decide via pure aggression & target priority
 */
export function decideGoblin(goblin, state) {
  // Priority 1: Attack nearby dwarf
  const nearbyDwarf = findNearestDwarf(goblin, state);
  if (nearbyDwarf && distance(goblin, nearbyDwarf) < 15) {
    goblin.drives.aggression = 100;
    return {
      state: 'attacking',
      goal: { type: 'kill', target: nearbyDwarf },
    };
  }

  // Priority 2: Attack structures
  const targetStructure = findValueableStructure(goblin, state);
  if (targetStructure) {
    return {
      state: 'raiding',
      goal: { type: 'destroy', target: targetStructure },
    };
  }

  // Priority 3: Siege settlement center
  return {
    state: 'advancing',
    goal: { type: 'advance_to_center', target: findSettlementCenter(state) },
  };
}

/**
 * Goblins learn from encounters
 */
export function goblinLearning(goblin, state) {
  // If goblin was defeated before, remember
  const priorDefeat = goblin.history.priorCombats.find(c => c.outcome === 'lost');
  
  if (priorDefeat) {
    // Increase caution, but maintain aggression
    goblin.drives.fear += 20;
    goblin.personality.caution += 0.2;
  }
  
  // Each successful kill increases aggression
  const kills = goblin.history.priorCombats.filter(c => c.outcome === 'won').length;
  goblin.drives.aggression = Math.min(100, 70 + kills * 5);
}
```

---

## Perception & Movement Model

### Unified Perception Radius

All entities perceive via the same system:

```javascript
const PERCEPTION_CONFIG = {
  dwarf: 10,      // Tiles
  animal: 8,
  human: 12,
  elf: 10,
  goblin: 12,
};

/**
 * Entity perceives world at decision interval
 */
export function perceiveWorld(entity, state) {
  const radius = PERCEPTION_CONFIG[entity.type];
  
  // 1. Find nearby entities
  const nearby = state.allEntities.filter(e =>
    e.type !== entity.type && // Don't perceive own type easily
    distance(entity, e) <= radius
  );
  
  // 2. Update threat perception
  for (const other of nearby) {
    if (isThreat(entity, other)) {
      entity.recentlyPerceivedThreat = { entity: other, distance: distance(entity, other), tick: state.tick };
    }
  }
  
  // 3. Scent gradients (shared system)
  const scentGradient = getScentGradient(entity.x, entity.y);
  if (magnitude(scentGradient) > 0.1) {
    entity.lastScentDirection = scentGradient;
  }
}
```

### Deterministic Movement

**No teleportation. All movement is step-by-step.**

Movement algorithm:

```javascript
/**
 * Calculate best next tile for entity
 * Uses: scent, momentum, pathfinding, obstacle avoidance
 */
export function calculateNextMovement(entity, targetOrGoal, state) {
  const { x, y, momentum } = entity;
  
  // 1. Check scent gradient
  const scentGrad = getScentGradient(x, y);
  const scentWeight = 0.3;
  
  // 2. Momentum (inertia)
  const momentumWeight = 0.4;
  
  // 3. Direct path to target
  let pathWeight = 0.3;
  let targetDirection = null;
  
  if (targetOrGoal) {
    const tgt = targetOrGoal.x !== undefined ? targetOrGoal : targetOrGoal.target;
    if (tgt) {
      targetDirection = normalize({
        dx: tgt.x - x,
        dy: tgt.y - y,
      });
      pathWeight = 0.5; // Increase if close to target
    }
  }
  
  // 4. Avoid obstacles
  const tilesAround = getAdjacentWalkableTiles(x, y, state.map);
  
  // Score each adjacent tile
  let bestTile = null;
  let bestScore = -Infinity;
  
  for (const tile of tilesAround) {
    let score = 0;
    
    // Scent attraction
    const scent = getScent(tile.x, tile.y);
    score += scent * scentWeight;
    
    // Momentum (continue in same direction)
    if (momentum.dx !== 0 || momentum.dy !== 0) {
      const momentumAlignment = 
        (tile.x - x) * momentum.dx + (tile.y - y) * momentum.dy;
      score += momentumAlignment * momentumWeight;
    }
    
    // Target direction
    if (targetDirection) {
      const pathAlignment =
        (tile.x - x) * targetDirection.dx + (tile.y - y) * targetDirection.dy;
      score += pathAlignment * pathWeight;
    }
    
    // Random wander (break ties)
    score += Math.random() * 0.1;
    
    if (score > bestScore) {
      bestScore = score;
      bestTile = tile;
    }
  }
  
  return bestTile;
}
```

---

## Integration Points

### 1. World Tick Loop

Order is critical. Current loop:

```
0. Decay scent map
1. Apply hunger pressure (all entities)
2. Perceive world (entities at decision interval)
3. Decide (each entity)
4. Act (each entity)
5. Process combat
6. Age animals, process death
7. Spawn events (births, etc.)
```

**New additions:**

```
3.5 Decay animal drives & age animals
4.5 Teach animals, update faction memory
5.5 LLM batch calls for entity cognition (async, non-blocking)
6.5 Process faction long-term relationships
```

### 2. Inspector Panel Integration

Inspector must display:

```
Entity: [type, name, profession (if dwarf)]
Position: (x, y)
Health: hp/maxHp
Drives: [hunger, fear, sociability, territory, exploration] (bars)
Memory: [last 3 significant events]
Skills (if dwarf): [top 3 skills, levels]
Faction (if external): [faction name, disposition toward settlement]
```

### 3. Event Bus Integration

New events to emit:

```javascript
EVENTS = {
  ENTITY_CHANGED_GOAL,
  DWARF_ACQUIRED_SKILL,
  DWARF_FISHING,
  DWARF_HUNTING,
  ANIMAL_BORN,
  ANIMAL_DEATH,
  FACTION_ARRIVED,
  FACTION_DISPOSITION_CHANGED,
  FACTION_LEFT,
  FISHING_SUCCESS,
  HUNTING_SUCCESS,
  HUNTING_FAILURE,
};
```

### 4. LLM Boundaries

LLM is consulted **only at decision intervals** and **only for cogitation**, not action:

```javascript
/**
 * LLM consultation for dwarf next action
 * Called once per 50 ticks, not every tick
 */
export async function consultLLMForGoal(dwarf, state) {
  const prompt = buildDwarfCognitionPrompt(dwarf, state);
  
  const response = await llmClient.generate(prompt);
  
  // Parse response: what does dwarf want to do?
  const intent = parseIntentFromResponse(response);
  
  // Intent is advisory; actual action is determined by rules engine
  // E.g., if LLM suggests "explore forest" but there's no forest,
  // system finds nearest unexplored area instead
  
  return applyIntentWithinConstraints(dwarf, intent, state);
}

/**
 * Build prompt minimally
 */
function buildDwarfCognitionPrompt(dwarf, state) {
  const contextSize = buildWorldContext(dwarf, state);
  
  return `
You are ${dwarf.name}, a ${getPrimaryProfession(dwarf)}.
Recent thoughts: ${dwarf.memory.shortTerm.slice(-3).join('; ')}
Current mood: ${dwarf.mood}

What do you want to do next? (Choose: explore, craft, socialize, rest, work)
  `;
}
```

---

## Implementation Roadmap

### Phase 1: Foundations (Week 1)
- [ ] Refactor entity schema to support capabilities map
- [ ] Implement shared drives system
- [ ] Implement shared perception system
- [ ] Add unified decision interval for all entities

### Phase 2: Dwarves (Week 2)
- [ ] Migrate dwarf AI to use new perception/decision system
- [ ] Implement skill acquisition system
- [ ] Add fishing mechanics
- [ ] Add hunting mechanics (basic)

### Phase 3: Animals (Week 3)
- [ ] Create animal entity system
- [ ] Implement simple animal AI (state machine)
- [ ] Add reproduction & lifecycle
- [ ] Integrate herbivore/carnivore dynamics

### Phase 4: External Factions (Week 4)
- [ ] Extend visitor system to use new perception/goal model
- [ ] Implement human merchant/settler logic
- [ ] Implement elf missionary/observer logic
- [ ] Implement goblin raider logic

### Phase 5: Polish & Integration (Week 5)
- [ ] Update inspector to display new entity info
- [ ] Add event narration for profession changes, etc.
- [ ] Stress test performance
- [ ] Fix edge cases

---

## Hard Constraints (Never Break These)

1. **No LLM Calls in Tick Loop**
   - Cognition happens at decision intervals only
   - Responses are cached/amortized

2. **No Teleportation**
   - Pathfinding always returns adjacent tile
   - Movement is continuous, not instantaneous

3. **Determinism**
   - Given same seed + input state, simulation always produces same tick
   - All randomness uses seeded RNG

4. **ASCII Readability**
   - Entity counts never hide information
   - Inspector always shows enough detail to understand entity state

5. **Graceful Degradation**
   - If LLM unavailable, dwarves use fallback behavior
   - Simulation runs without LLM (slower cognition, but works)

6. **LLM Cannot Mutate World**
   - LLM output is **suggestion only**
   - Rules engine validates and executes actions
   - Constraints (physics, world state) always apply

---

## Next Steps

1. **Implement Phase 1** (foundations)
2. **Integrate Phase 2** (dwarves with new system)
3. **Test with animals** (Phase 3)
4. **Validate faction behavior** (Phase 4)
5. **Performance tuning** (Phase 5)

All code should follow existing patterns:
- ES modules
- Pure functions where possible
- Emit events for UI updates
- No tight coupling between systems

