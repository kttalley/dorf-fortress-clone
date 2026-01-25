# Entity Behavior Systems — Quick Reference

**Phase 1 (Foundations) Implementation Guide**

---

## File Map

```
src/sim/
  ├── capabilities.js       ← What entities can do
  ├── drives.js             ← Hunger, fear, sociability, etc. (all entities)
  ├── perception.js         ← See nearby world (all entities)
  ├── animals.js            ← Animal factory + species (herbivores, carnivores)
  ├── fishing.js            ← Fishing mechanics (dwarves + animals)
  ├── hunting.js            ← Hunting mechanics (dwarves hunt animals)
  ├── tasks.js              ← SKILL_TREE + professions (EXTENDED)
  ├── entities.js           ← Dwarves (EXTENDED with drives + perception)
  └── world.js              ← Tick loop (UPDATED: perception + drive decay)

src/ai/
  ├── animalAI.js           ← Animal behavior (pure state machine)
  ├── dwarfAI.js            ← (TO BE UPDATED IN PHASE 2)
  └── visitorAI.js          ← (TO BE UPDATED IN PHASE 4)
```

---

## Core Concepts

### 1. **Capabilities** — What entities CAN do
```javascript
import { hasCapability, canPerformAction } from './sim/capabilities.js';

// Check if dwarf can fish
if (hasCapability(dwarf, 'CAN_FISH')) {
  // Can attempt fishing
}

// Or use action-based check
if (canPerformAction(dwarf, 'fish')) {
  // Same thing
}
```

### 2. **Drives** — Why entities DO things
```javascript
import { satisfyDrive, stimulateDrive, getDominantDrive, isDriveCritical } from './sim/drives.js';

// Entity has numeric drives: hunger, fear, sociability, territoriality, exploration, reproduction
dwarf.drives = {
  hunger: 45,           // 0 = full, 100 = starving
  fear: 10,             // 0 = calm, 100 = panicked
  sociability: 60,      // 0 = withdrawn, 100 = desperate for company
  territoriality: 30,
  exploration: 50,
  reproduction: 0,      // Animals only
};

// Find what entity cares about most
const { drive, urgency } = getDominantDrive(dwarf);
// e.g., { drive: 'hunger', urgency: 73 } ← "I'm hungry!"

// Satisfy or stimulate drives
satisfyDrive(dwarf, 'hunger', 30);    // Eating reduces hunger
stimulateDrive(dwarf, 'fear', 50);    // Seeing threat increases fear

// Check if critical
if (isDriveCritical(dwarf, 'hunger')) {
  // Hunger > 85, must eat NOW
}
```

### 3. **Perception** — What entities SEE
```javascript
import { perceiveWorld, getPerceivedThreats, getNearestPerceivedEntity } from './sim/perception.js';

// Called at decision intervals (every 30 ticks for dwarves)
perceiveWorld(dwarf, state);

// Now dwarf knows about nearby entities/locations:
dwarf.recentlyPerceivedEntities;    // Map of {id → {entity, distance, relevance, threatLevel}}
dwarf.recentlyPerceivedLocations;   // Map of {x,y → {type, relevance, ...}}
dwarf.recentlyPerceivedThreat;      // Current threat or null

// Query helpers
const threats = getPerceivedThreats(dwarf);           // Sorted by distance
const nearestFood = getNearestPerceivedEntity(dwarf, 'food');
```

### 4. **Animals** — First-class simulated entities
```javascript
import { createAnimal, ageAnimal, getAnimalLoot } from './sim/animals.js';
import { decideAnimal, actAnimal } from './ai/animalAI.js';

// Create animal
const deer = createAnimal(50, 50, 'deer', state);
state.animals.push(deer);

// Each tick:
// 1. Age animal (triggers maturity, reproduction, death)
ageAnimal(deer, state);

// 2. At decision intervals, decide what to do
if (state.tick % 10 === 0) {  // Every 10 ticks
  decideAnimal(deer, state);
}

// 3. Every tick, execute action
actAnimal(deer, state);

// When hunting kills animal:
const loot = getAnimalLoot(deer);  // [{type: 'meat', amount: 3}, {type: 'hide', quality: 0.7}, ...]
```

### 5. **Fishing** — Production activity for dwarves
```javascript
import { canFishAt, attemptFish, awardFishingXP } from './sim/fishing.js';

// Check if dwarf can fish
if (canFishAt(dwarf, dwarf.x, dwarf.y, state)) {
  // Each tick while fishing:
  const result = attemptFish(dwarf, state);
  
  if (result.success) {
    // result.amount = 1-4 fish created
    // XP awarded automatically
    // Event emitted: FISHING_SUCCESS
  }
}

// Skills improve automatically on use
dwarf.skills.find(s => s.name === 'fishing').level  // 0.0-1.0
```

### 6. **Hunting** — Combat-based production activity
```javascript
import { canHuntAt, findNearestPrey, attemptHunt } from './sim/hunting.js';

// Check if dwarves can hunt
if (canHuntAt(dwarf, dwarf.x, dwarf.y, state)) {
  // Find target
  const prey = findNearestPrey(dwarf, state);
  
  if (prey) {
    // Each tick:
    const result = attemptHunt(dwarf, prey, state);
    
    if (result.killed) {
      // Prey dead, loot obtained
      // XP awarded (chase: 1, hit: 10, kill: 25)
    } else if (result.hit) {
      // Hit but alive, keep attacking
    } else if (result.phase === 'chasing') {
      // Moving closer
    }
  }
}
```

### 7. **Skills & Professions** — Emergent specialization
```javascript
import { 
  awardSkillXP, 
  getPrimaryProfession, 
  getSecondaryProfessions,
  SKILL_TREE 
} from './sim/tasks.js';

// Skills improve by use
awardSkillXP(dwarf, 'fishing', 5);    // +5 XP
dwarf.skills.find(s => s.name === 'fishing').level // 0.0-1.0

// Professions emerge automatically
getPrimaryProfession(dwarf);   // "Angler" if fishing > highest other skill
getSecondaryProfessions(dwarf);  // ["Miner", "Hauler"] if those skills 0.4-0.8

// Skill tree shows prerequisites
SKILL_TREE['hunting'];  // { category, baseDifficulty, requires: ['perception', 'melee'] }

// Check if dwarf can learn skill
if (hasSkillPrerequisites(dwarf, 'metalworking')) {
  // Knows carpentry already, can learn smithing
}
```

---

## World Tick Order (Updated)

```javascript
// src/sim/world.js - tick(state) function

0. Update weather
0.5. Decay scent map
0.75. Decay ALL entity drives ← NEW
1. Apply legacy hunger pressure
1.5. Perceive world (at decision intervals) ← NEW
2. Each dwarf decides what to do (still calls dwarfAI.decide)
3. Execute actions (still calls dwarfAI.act)
3.5. Process visitors
3.6. Process combat
4. Age dwarves/animals, process death ← UPDATE: add ageAnimal() for all animals
5. Spawn events
```

---

## Common Patterns

### Pattern 1: Entity wants to do something
```javascript
// In dwarfAI.decide()
const { drive, urgency } = getDominantDrive(dwarf);

if (drive === 'hunger' && urgency > 70) {
  // Find food and move toward it
  const food = getNearestPerceivedEntity(dwarf, 'food');
  if (food) {
    dwarf.currentGoal = { type: 'seek_food', target: food, urgency };
  }
}
```

### Pattern 2: Animal hunts
```javascript
// In animalAI.actHunting()
const prey = state.animals.find(a => a.id === animal.target.id);
const dist = distance(animal, prey);

if (dist > 1) {
  // Chase
  executeSmartMovement(animal, prey, state);
} else {
  // Attack
  if (Math.random() < hitChance) {
    prey.hp -= damage;
    if (prey.hp <= 0) {
      satisfyDrive(animal, 'hunger', getAnimalNutrition(prey));
    }
  }
}
```

### Pattern 3: Dwarf fishes
```javascript
// In dwarfAI.decide()
if (dwarf.state === 'fishing') {
  const result = attemptFish(dwarf, state);
  if (!result.success && dwarf.drives.hunger < 40) {
    // Try something else
    dwarf.state = 'idle';
  }
}
```

### Pattern 4: Dwarf hunts
```javascript
// In dwarfAI.decide()
const prey = findNearestPrey(dwarf, state);
if (prey && canHuntAt(dwarf, dwarf.x, dwarf.y, state)) {
  dwarf.state = 'hunting';
  dwarf.target = prey;
}

// In dwarfAI.act()
if (dwarf.state === 'hunting') {
  const result = attemptHunt(dwarf, dwarf.target, state);
  if (result.killed || result.success === false) {
    dwarf.state = 'idle';
  }
}
```

---

## Important Constants

### Perception Radii
- Dwarf: 10 tiles
- Animal: 8 tiles
- Human/Goblin: 12 tiles
- Elf: 10 tiles

### Decision Intervals
- Dwarf: 30 ticks (perceive/decide every 30 ticks)
- Animal: 10 ticks
- Visitor: 20 ticks (to be implemented)

### Drive Critical Thresholds
- Hunger: > 85 (desperate)
- Fear: > 75 (panicked)
- Sociability: > 90 (lonely)
- Territoriality: > 80 (angry)
- Exploration: > 70 (restless)
- Reproduction: > 85 (in heat)

### Animal Species Properties
```javascript
ANIMAL_SPECIES = {
  'deer':   { diet: 'herbivore', size: 'medium', hp: 15, lifespan: 4000 },
  'rabbit': { diet: 'herbivore', size: 'small',  hp: 3,  lifespan: 2000 },
  'wolf':   { diet: 'carnivore', size: 'large',  hp: 20, lifespan: 6000 },
  'boar':   { diet: 'omnivore',  size: 'large',  hp: 18, lifespan: 5000 },
  'frog':   { diet: 'carnivore', size: 'small',  hp: 2,  lifespan: 3000 },
  'bear':   { diet: 'omnivore',  size: 'large',  hp: 30, lifespan: 8000 },
};
```

---

## Events Emitted

New events (see src/events/eventBus.js):
- `ENTITY_CHANGED_GOAL`
- `DWARF_ACQUIRED_SKILL`
- `DWARF_FISHING` (ongoing)
- `DWARF_HUNTING` (ongoing)
- `ANIMAL_BORN`
- `ANIMAL_DEATH`
- `ANIMAL_ATTACKED`
- `ANIMAL_KILLED`
- `FISHING_SUCCESS`
- `FISHING_ATTEMPT`
- `HUNTING_SUCCESS`
- `HUNTING_HIT`
- `HUNTING_MISS`
- `SKILL_LEVELED`

---

## Migration Checklist (Phase 2)

When updating dwarfAI.js to use new system:

- [ ] Replace `dwarf.hunger` with `dwarf.drives.hunger`
- [ ] Replace `isCritical(dwarf)` with `isDriveCritical(dwarf, 'hunger')`
- [ ] Call `perceiveWorld(dwarf, state)` at decision intervals
- [ ] Use `getDominantDrive(dwarf)` to set priorities
- [ ] Replace hardcoded goals with `dwarf.currentGoal`
- [ ] Integrate `attemptFish()` into fishing behavior
- [ ] Integrate `attemptHunt()` into hunting behavior
- [ ] Remove old movement-only logic; use perception-based targeting
- [ ] Test all changes incrementally

---

## Debugging Tips

```javascript
// Check entity state
console.log('Drives:', getDriveSummary(dwarf));
console.log('Goal:', dwarf.currentGoal);
console.log('Threats:', getPerceivedThreats(dwarf));
console.log('Profession:', getPrimaryProfession(dwarf));
console.log('Skills:', dwarf.skills.map(s => `${s.name}:${s.level.toFixed(2)}`));

// Check animal state
console.log('Animal state:', animal.state);
console.log('Animal drives:', getDriveSummary(animal));
console.log('Can hunt?', shouldHunt(animal));
console.log('Is hungry?', isHungry(animal));

// Check fishing
import { getFishingProficiency } from './sim/fishing.js';
console.log('Fishing:', getFishingProficiency(dwarf) + '%');

// Check hunting
import { getHuntingProficiency } from './sim/hunting.js';
console.log('Hunting:', getHuntingProficiency(dwarf) + '%');
```

---

## What's NOT Included (Future Phases)

❌ Dwarf AI integration (Phase 2)  
❌ World animal spawning (Phase 3)  
❌ Faction perception & goals (Phase 4)  
❌ Inspector UI updates (Phase 5)  
❌ Advanced pathfinding  
❌ Cooperative hunting  
❌ Territory warfare  
❌ Trade/barter system  

---

**Ready to proceed to Phase 2!** 🚀
