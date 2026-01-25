# Phase 1 Implementation Complete
## Foundations for Entity Behavior Systems

**Status:** ✅ Complete  
**Date:** January 24, 2026  
**Author:** Simulation Architect

---

## Summary

Phase 1 (Foundations) has been successfully implemented. All core systems for unified entity behavior are now in place and ready for integration with dwarves, animals, and factions.

---

## Files Created

### 1. **src/sim/capabilities.js** ✅
**Purpose:** Define what each entity type can do

- `CAPABILITIES` constant: All capability names (CAN_MOVE, CAN_SPEAK, CAN_FISH, CAN_HUNT, etc.)
- `CAPABILITY_MAP`: Matrix showing which capabilities each entity type has
- `hasCapability(entity, capability)`: Runtime check
- `getCapabilities(entityType)`: Get all caps for a type
- `canPerformAction(entity, actionType)`: Check if entity can perform action

**Key Features:**
- All entity types covered: dwarf, animal, human, elf, goblin, food, resource
- Enables AI to query: "Can I fish?" → `canPerformAction(dwarf, 'fish')`
- Avoids hardcoded class hierarchies; composition-based design

---

### 2. **src/sim/drives.js** ✅
**Purpose:** Unified drive system for all entities

- `DRIVE_CONFIG`: Configuration for all drives (hunger, fear, sociability, territoriality, exploration, reproduction)
- `initializeDrives(entity, startingValues)`: Create drive object for any entity
- `decayDrives(entity, state)`: Decay all drives each tick
- `satisfyDrive(entity, driveName, amount)`: Reduce drive (e.g., eating satisfies hunger)
- `stimulateDrive(entity, driveName, amount)`: Increase drive (e.g., threat increases fear)
- `getDominantDrive(entity)`: Get most urgent drive + urgency value
- `rankDrives(entity)`: Get all drives sorted by urgency
- `isDriveCritical(entity, driveName)`: Check if above threshold
- `getDriveSummary(entity)`: Get formatted drive state

**Key Features:**
- All drives have: `decayRate`, `decayRatePerTick`, `satisfyAmount`, `criticalThreshold`, `maxValue`, `minValue`
- Drives naturally decay over time (no static state)
- Works with all entity types (dwarves, animals, visitors, factions)
- Enables behavior: "If hunger > 85, seek food urgently"

---

### 3. **src/sim/perception.js** ✅
**Purpose:** Unified perception for all entities

- `PERCEPTION_CONFIG`: Perception radius by entity type
- `initializePerception(entity)`: Create perception structures
- `perceiveWorld(entity, state)`: Called at decision intervals to update entity's knowledge
- `scanNearbyEntities(entity, state, radius)`: Find nearby dwarves, animals, visitors
- `scanNearbyLocations(entity, state, radius)`: Find nearby tiles (water, vegetation, food, etc.)
- `calculateRelevance(entity, other, state)`: Relevance score (0-1) for another entity
- `calculateThreatLevel(entity, other)`: Threat score (0-1)
- `calculateLocationRelevance(entity, loc, state)`: Relevance of a location
- Helper queries: `getPerceivedEntity()`, `getPerceivedThreats()`, `getNearestPerceivedEntity()`

**Key Features:**
- Called only at decision intervals (every 30 ticks for dwarves, 10 for animals) → performance efficient
- Entities track: `recentlyPerceivedEntities` (Map), `recentlyPerceivedLocations` (Map), `recentlyPerceivedThreat`
- Perception fades over time: entities older than 60 ticks are forgotten
- Threat detection: goblins = 0.9 threat, wolves = 0.7, etc.
- Location types: water, vegetation, food, obstacle
- All entities share same algorithm

---

### 4. **src/sim/entities.js (Extended)** ✅
**Purpose:** Extended dwarf entity schema

- Dwarves now initialized with:
  - `drives`: Unified drive system (hunger, fear, sociability, territoriality, exploration)
  - `perceptionRadius`: 10 tiles
  - `recentlyPerceivedEntities`: Map of nearby entities
  - `recentlyPerceivedLocations`: Map of nearby locations
  - `recentlyPerceivedThreat`: Current threat reference
  - `currentGoal`: Current goal object {type, target, urgency, timeout}
  - `goalStack`: LIFO goal planning
  - `decisionTick` / `decisionInterval`: For perception at intervals
  - `memory.shortTerm`: Last 10 significant events
  - `memory.locations`: Named places discovered
  - `memory.knownEntities`: IDs of entities met

**Key Features:**
- Calls `initializePerception(dwarf)` on creation
- Calls `initializeDrives(dwarf, ...)` with sensible defaults
- Backward compatible: old `hunger` field can coexist during transition
- Seeds dwarves with `decisionInterval: 30` (perceive every 30 ticks)

---

### 5. **src/sim/world.js (Updated)** ✅
**Purpose:** Integrated perception into main tick loop

**New tick loop order:**
```
0. Update weather
0.5. Decay scent map
0.75. Decay all entity drives ← NEW
1. Apply legacy hunger pressure
1.5. Perceive world (at decision intervals) ← NEW
2. Each dwarf decides what to do
3. Execute actions
3.5. Process visitors
3.6. Process combat
4. Age/death handling
5. Spawn events
```

**Key Changes:**
- `decayDrives(dwarf, state)` called for all dwarves each tick
- `perceiveWorld(dwarf, state)` called only when `state.tick % dwarf.decisionInterval === 0`
- Imports: `decayDrives`, `perceiveWorld` from new modules

**Performance Impact:** ✅ Low
- Perception happens only 1/30 of the time for dwarves
- Drive decay is O(6) per dwarf (6 drives max)

---

### 6. **src/sim/animals.js** ✅
**Purpose:** Animal entity system

- `ANIMAL_SPECIES`: Species definitions (deer, rabbit, wolf, boar, frog, bear)
- `createAnimal(x, y, subtype, state)`: Factory for new animals
- `createAnimalOffspring(parent1, parent2, state)`: Create babies
- `ageAnimal(animal, state)`: Age mechanics, maturity, death
- `canMate(animal1, animal2)`: Check if two can breed
- `getAnimalLoot(animal)`: What loot drops from corpse (meat, hides, bones)
- Helper queries: `shouldHunt()`, `isFleeing()`, `isHungry()`, `getAnimalDisplayName()`

**Species Details:**
| Type | Diet | Size | HP | Reproduction | Lifespan | Notes |
|------|------|------|-----|--------------|----------|-------|
| Deer | Herbivore | Medium | 15 | 0.15 | 4000 | Prey for wolves, dwarves |
| Rabbit | Herbivore | Small | 3 | 0.25 | 2000 | Fast reproducers |
| Wolf | Carnivore | Large | 20 | 0.08 | 6000 | Top predator |
| Boar | Omnivore | Large | 18 | 0.12 | 5000 | Dangerous |
| Frog | Carnivore | Small | 2 | 0.20 | 3000 | Water habitat |
| Bear | Omnivore | Large | 30 | 0.05 | 8000 | Lethal threat |

**Key Features:**
- Animals initialized with drives: hunger, fear, territoriality, reproduction
- Reproduction rate is probability per 100 ticks (animals don't reproduce constantly)
- Animals age from 0.0 (newborn) to 1.0 (old/death)
- Can reproduce only after 30% of lifespan (maturity)
- Loot system: meat (guaranteed), hide (60%), bone (40%), exotic (10%)

---

### 7. **src/ai/animalAI.js** ✅
**Purpose:** Animal behavior logic (pure state machine, no LLM)

- `ANIMAL_STATE`: idle, wandering, grazing, fleeing, hunting, seeking_mate, mating, dead
- `decideAnimal(animal, state)`: What should animal do? (called at decision intervals)
- `actAnimal(animal, state)`: Execute animal action (called every tick)
- State-specific actions: `actGrazing()`, `actHunting()`, `actFleeing()`, `actMating()`, `actWandering()`, `actIdle()`

**Priority Decision Tree:**
```
1. Threat (fear > 60) → FLEEING
2. Hunt (if carnivore & hungry) → HUNTING
3. Hunger (hunger > 70) → GRAZING or WANDERING
4. Reproduce (if adult & reproduction > 80) → SEEKING_MATE or MATING
5. Territory (if > 12 tiles away) → WANDERING back
6. Default → IDLE
```

**Key Actions:**
- **Grazing**: Eat grass (satisfies hunger), move to grass if hungry
- **Hunting**: Chase prey (move closer), attack (50-70% hit), loot on kill
- **Fleeing**: Move away from threat, reduce fear over time
- **Mating**: 1% per tick chance to produce offspring when adjacent
- **Wandering**: Slow random walk
- **Idle**: Just exist, drives decay naturally

**Key Features:**
- No LLM calls (pure state machine)
- Predator-prey dynamics: wolf hunts rabbit, dwarves hunt everything
- Reproduction: 1% per tick per adjacent mate = controlled population
- Fear decay: slow (0.5 per tick) so threats remembered
- Threat perception: alerts to goblins, dwarves, other predators

---

### 8. **src/sim/fishing.js** ✅
**Purpose:** Fishing mechanics

- `FISHING_CONFIG`: Base catch 15%, skill modifier +30%, rain bonus +20%
- `canFishAt(dwarf, x, y, state)`: Can dwarf fish here?
  - Requires water adjacent OR fishing rod
  - Requires skill > 0.1 OR fishing rod
- `attemptFish(dwarf, state)`: Called each tick while fishing
  - Catch probability: `(0.15 + proficiency*0.3) * weather_mod`
  - Success: 1-4 fish (depends on skill)
  - Always award XP (1 per attempt, 5 per catch)
- `awardFishingXP(dwarf, amount)`: Award XP, level up at 100 XP
- Helper queries: `getFishingProficiency()`, `isFishingExpert()`

**Key Features:**
- Weather-dependent: rain increases catch rate 1.2x
- Skill-dependent: 0% skill = 15% catch, 100% skill = 45% catch
- Proficiency = (patience trait * 0.3) + (skill level * 0.7)
- XP per catch is 5x XP per attempt (incentivizes success)
- Fishing profession emerges after ~30 catches

---

### 9. **src/sim/hunting.js** ✅
**Purpose:** Hunting mechanics

- `HUNTING_CONFIG`: Base hit 40%, skill modifier +40%, size modifiers
- `canHuntAt(dwarf, x, y, state)`: Are there huntable animals nearby (range 12)?
- `findNearestPrey(dwarf, state)`: Get closest huntable animal
- `attemptHunt(dwarf, targetAnimal, state)`: Called each tick while hunting
  - **Chase phase** (dist > 1): Move toward prey, award tracking XP
  - **Attack phase** (dist ≤ 1): Hit check, damage, loot on kill
- `awardHuntingXP(dwarf, amount)`: XP acquisition (1 per chase, 10 per hit, 25 per kill)
- Helper queries: `getHuntingProficiency()`, `isHuntingExpert()`, `getTrackingDifficulty()`

**Hit Chance Calculation:**
```
Base: 40%
+ Skill: up to +40%
* Size: Large -10%, Small +20%
Range: 5% - 95%
```

**Damage Calculation:**
```
Base: dwarf.damage (3-4)
* Skill multiplier: 1.0 to 1.5
* Variance: 80% to 120%
Min: 1
```

**Huntable Animals:** deer, rabbit, boar, bear, wolf

**Key Features:**
- Two-phase system (chase + attack) creates dynamic combat
- Hunting requires bravery trait (affects proficiency)
- Carnivores (wolf, bear) are dangerous prey → harder to hit
- Loot includes meat, hides, bones (see animals.js)
- Hunting profession emerges after ~50 kills
- XP is expensive (150 per level) because hunting is high-skill

---

### 10. **src/sim/tasks.js (Extended)** ✅
**Purpose:** Skill tree and profession system

- `SKILL_TREE`: 18 interconnected skills with prerequisites
- `generateSkills(personality)`: Dwarves start with [melee, perception, mining]
- `awardSkillXP(dwarf, skillName, amount)`: Increase skill XP
  - 100 XP base per level, adjusted by skill difficulty
  - Proficiency = (personality_mod * 0.3) + (skill_level * 0.7)
- `getPrimaryProfession(dwarf)`: Get title based on highest skill
  - "Angler" (fishing > 0.1), "Hunter" (hunting > 0.1), "Blacksmith" (metalworking > 0.1), etc.
- `getSecondaryProfessions(dwarf)`: Skills at 0.4-0.8 level
- `hasSkillPrerequisites(dwarf, skillName)`: Check if can learn skill
- `getLearnableSkills(dwarf)`: Get all skills dwarf could learn now

**Skill Tree (18 skills):**
```
Production:
  - fishing (requires: perception)
  - hunting (requires: perception, melee)
  - farming
  - cooking (requires: farming)
  - brewing (requires: cooking)

Crafting:
  - carpentry (requires: melee)
  - metalworking (requires: carpentry)
  - masonry
  - leatherworking (requires: hunting)
  - stonecarving (requires: masonry)

Combat:
  - melee
  - dodge (requires: melee)

Support/Construction:
  - hauling
  - mining
  - building

Mental/Social:
  - perception
  - teaching (requires: social)
  - leadership (requires: teaching)
  - social
```

**Profession Mapping:**
| Skill | Profession | Min Level |
|-------|-----------|-----------|
| fishing | Angler | 0.1 |
| hunting | Hunter | 0.1 |
| farming | Farmer | 0.1 |
| cooking | Cook | 0.1 |
| carpentry | Carpenter | 0.1 |
| metalworking | Blacksmith | 0.1 |
| masonry | Mason | 0.1 |
| melee | Soldier | 0.1 |
| mining | Miner | 0.1 |

**Key Features:**
- Skills are objects: `{name, level, experience, proficiency, category, prerequisites}`
- Prerequisites prevent learning without base skills (e.g., can't smith without carpentry)
- Proficiency blends personality + skill level
- Primary profession = highest skill level
- Secondary professions = skills at 0.4-0.8 level
- Emergent gameplay: dwarves naturally specialize

---

## Integration Checklist

### ✅ Phase 1 Complete
- [x] Capabilities system (what entities can do)
- [x] Drives system (hunger, fear, etc. decay)
- [x] Perception system (see nearby world at intervals)
- [x] Entity schema extended (dwarves have drives + perception + goals)
- [x] World tick updated (perception at intervals, drive decay)
- [x] Animal entity system (herbivores, carnivores, reproduction)
- [x] Animal AI (pure state machine)
- [x] Fishing mechanics (skill-based, weather-influenced)
- [x] Hunting mechanics (two-phase, skill-based, animal targeting)
- [x] Skill tree (18 interconnected skills, profession emergence)

### ⏭️ Phase 2: Next (Dwarf AI Integration)
- [ ] Update dwarfAI.js to use new perception/drives/goals
- [ ] Integrate fishing into dwarf behavior
- [ ] Integrate hunting into dwarf behavior
- [ ] Add goal evaluation using new drive system
- [ ] Remove old hardcoded hunger logic

### ⏭️ Phase 3: Animal Integration
- [ ] Add animals to world state
- [ ] Call decideAnimal() / actAnimal() in main tick
- [ ] Add ageAnimal() to tick loop
- [ ] Test herbivore-carnivore dynamics

### ⏭️ Phase 4: Faction Integration
- [ ] Update visitor creation to use new schema
- [ ] Integrate perception into visitor AI
- [ ] Use drives for human/elf/goblin decisions

### ⏭️ Phase 5: Polish
- [ ] Update inspector to show drives/goals/skills
- [ ] Event logging for professions, fishing, hunting
- [ ] Performance testing

---

## Performance Notes

✅ **Optimized for performance:**
- Perception: Called only every N ticks (30 for dwarves, 10 for animals)
- Drive decay: O(6) operations per entity per tick (6 drives max)
- No per-tick LLM calls
- Animals use simple state machine (no pathfinding per tick)
- Perception results cached between calls

**Estimated tick cost:**
- Perception (1/30): ~2ms for 5 dwarves (scanning radius)
- Drive decay: ~0.1ms per dwarf (negligible)
- Animal behavior: ~0.5ms per 10 animals
- Total per tick: ~1-2ms (well under budget)

---

## Testing Recommendations

1. **Unit test each system:**
   - Can dwarves perceive threats correctly?
   - Do drives decay at expected rates?
   - Can animals hunt and breed?
   - Fishing/hunting skill progression?

2. **Integration test:**
   - Dwarves should perceive animals nearby
   - Animals should flee from dwarves
   - Skills should improve with use

3. **Stress test:**
   - 10 dwarves, 20 animals, run 1000 ticks
   - Monitor frame rate (should be 60+ FPS)

---

## Next Actions

1. Read this document
2. Review created files to understand structure
3. Begin Phase 2: Update dwarfAI to use new system
4. Add animals to world state and integrate animalAI
5. Test perception and drive decay visually

---

**Status:** Ready for Phase 2 ✅
