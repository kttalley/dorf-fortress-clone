# Scenario System Integration Guide

This guide explains how to wire the scenario generator into the existing game systems.

## Overview

The scenario system generates themed starting configurations with:
- **Title & Description**: Flavor text for the scenario
- **Parameters**: Game config (terrain, dwarf count, food, difficulty modifiers)
- **Victory Conditions**: Goals for the player
- **Seed**: Deterministic seed for reproducible map generation

## Files Created

```
src/
├── llm/
│   ├── prompts/
│   │   └── scenarios.js     # Prompt templates for LLM generation
│   └── scenarioGenerator.js # Main async generator + fallback logic
├── scenarios/
│   ├── scenarioSchema.js    # Validation schema + parameter ranges
│   ├── presets.js           # Hand-crafted fallback scenarios
│   └── INTEGRATION.md       # This file
└── ui/
    └── scenarioScreen.js    # Modal UI for scenario selection
```

## Integration Checklist

### 1. Wire Scenario Screen into Game Start

In `src/main.js`, replace direct world generation with scenario selection:

```javascript
import { showScenarioScreen } from './ui/scenarioScreen.js';

// Instead of calling regenerateWorld() directly on init:
async function init() {
  // ... existing setup code ...

  // Show scenario screen first
  showScenarioScreen({
    onAccept: (scenario) => {
      // Store selected scenario
      currentScenario = scenario;
      // Generate world with scenario parameters
      regenerateWorldFromScenario(scenario);
      // Start game loop
      startLoop(renderer, logContainer);
    }
  });
}
```

### 2. Wire Parameters into Map Generation

Modify `regenerateWorld()` to accept scenario parameters:

```javascript
function regenerateWorldFromScenario(scenario) {
  const { parameters, seed } = scenario;

  // Use scenario seed for deterministic generation
  const mapSeed = seed;

  // Map terrain type to generation mode
  const modeMap = { biome: 0, mixed: 1, cave: 2 };
  currentMapMode = modeMap[parameters.terrain] || 1;

  // Apply map dimensions (if different from default)
  const width = parameters.mapWidth || MAP_WIDTH;
  const height = parameters.mapHeight || MAP_HEIGHT;

  // Generate map based on terrain type
  switch (parameters.terrain) {
    case 'biome':
      state.map = generateBiomeMap(width, height, {
        mapSeed,
        // biomeEmphasis affects elevation/moisture scales
        elevationScale: getElevationScale(parameters.biomeEmphasis),
        moistureScale: getMoistureScale(parameters.biomeEmphasis),
        numRivers: parameters.biomeEmphasis === 'desert' ? 1 : 4,
      });
      break;

    case 'mixed':
      state.map = generateMixedMap(width, height, {
        mapSeed,
        caveDensity: 0.48,
        surfaceChance: 0.35,
        numRivers: 2,
      });
      break;

    case 'cave':
    default:
      state.map = generateCaveMap(width, height, {
        mapSeed,
        wallProbability: 0.44,
        smoothingPasses: 5,
        mushroomDensity: 0.02,
        waterPools: 4,
        connectCaves: true,
      });
      break;
  }

  // Spawn dwarves based on scenario count
  for (let i = 0; i < parameters.dwarfCount; i++) {
    // ... spawn dwarf logic ...
  }

  // Spawn food sources based on scenario count
  for (let i = 0; i < parameters.foodSources; i++) {
    // ... spawn food logic ...
  }

  // Store scenario for reference
  state.scenario = scenario;
}
```

### 3. Apply Difficulty Modifiers

In `src/sim/rules.js` or wherever hunger is processed:

```javascript
import { getDifficultyModifiers } from '../scenarios/scenarioSchema.js';

function applyHunger(dwarf, state) {
  const modifiers = getDifficultyModifiers(state.scenario?.parameters?.difficulty);
  const hungerRate = (state.scenario?.parameters?.hungerRate || 1.0) * modifiers.hungerMultiplier;

  dwarf.hunger += BASE_HUNGER_RATE * hungerRate;
}
```

### 4. Apply Food Respawn Modifiers

In `src/sim/world.js` or food spawning logic:

```javascript
function maybeSpawnFood(state) {
  const modifiers = getDifficultyModifiers(state.scenario?.parameters?.difficulty);
  const respawnRate = (state.scenario?.parameters?.foodRespawnRate || 1.0) * modifiers.foodSpawnMultiplier;

  if (Math.random() < BASE_FOOD_SPAWN_CHANCE * respawnRate) {
    // ... spawn food ...
  }
}
```

### 5. Persist Scenario with Save File (Future)

When implementing save/load:

```javascript
import { serializeScenario, deserializeScenario } from './llm/scenarioGenerator.js';

// Save
function saveGame(state) {
  return JSON.stringify({
    // ... other state ...
    scenario: state.scenario ? serializeScenario(state.scenario) : null,
  });
}

// Load
function loadGame(json) {
  const data = JSON.parse(json);
  const { valid, scenario } = deserializeScenario(data.scenario);
  if (valid) {
    state.scenario = scenario;
  }
  // ... restore other state ...
}
```

### 6. Add "New Game" Button to Regenerate Flow

Update the regen button to show scenario screen:

```javascript
if (regenBtn) {
  regenBtn.addEventListener('click', () => {
    // Stop game
    running = false;
    if (loopId) clearTimeout(loopId);

    // Show scenario selection
    showScenarioScreen({
      onAccept: (scenario) => {
        regenerateWorldFromScenario(scenario);
        running = true;
        startLoop(renderer, logContainer);
      }
    });
  });
}
```

## Parameter Schema Reference

```javascript
{
  // Required
  terrain: 'biome' | 'mixed' | 'cave',
  dwarfCount: 3-20,

  // Optional (have defaults)
  biomeEmphasis: 'balanced' | 'mountain' | 'forest' | 'marsh' | 'desert',
  difficulty: 'peaceful' | 'normal' | 'harsh' | 'brutal',
  mapWidth: 40-100 (default: 64),
  mapHeight: 16-40 (default: 24),
  initialFood: 500-5000 (default: 1500),
  foodSources: 5-30 (default: 15),
  hungerRate: 0.5-3.0 (default: 1.0, multiplier),
  foodRespawnRate: 0.5-2.0 (default: 1.0, multiplier),
}
```

## Difficulty Modifiers

| Difficulty | Hunger | Food Spawn | Initial Food |
|------------|--------|------------|--------------|
| peaceful   | 0.5x   | 1.5x       | 1.5x         |
| normal     | 1.0x   | 1.0x       | 1.0x         |
| harsh      | 1.5x   | 0.7x       | 0.7x         |
| brutal     | 2.0x   | 0.5x       | 0.5x         |

## Biome Emphasis Mapping

For `biome` terrain, adjust noise parameters:

| Emphasis  | Elevation Scale | Moisture Scale | Rivers |
|-----------|-----------------|----------------|--------|
| balanced  | 0.02            | 0.025          | 4      |
| mountain  | 0.015           | 0.03           | 3      |
| forest    | 0.025           | 0.02           | 4      |
| marsh     | 0.03            | 0.015          | 2      |
| desert    | 0.02            | 0.04           | 1      |

## Victory Conditions (Future)

Victory conditions are stored but not enforced in MVP. Future implementation:

```javascript
function checkVictoryConditions(state) {
  const conditions = state.scenario?.victory_conditions || [];

  return conditions.map(condition => {
    // Parse condition string and evaluate
    if (condition.includes('Survive')) {
      const days = parseInt(condition.match(/\d+/)?.[0] || 50);
      return state.tick >= days * TICKS_PER_DAY;
    }
    if (condition.includes('dwarves')) {
      const count = parseInt(condition.match(/\d+/)?.[0] || 10);
      return state.dwarves.length >= count;
    }
    // ... other condition types ...
    return false;
  });
}
```

## Testing

1. **LLM Generation**: With LLM connected, click "Generate New" and verify valid JSON output
2. **Fallback**: Disconnect LLM, regenerate - should use presets
3. **Validation**: Modify a preset to have invalid params - should reject and use fallback
4. **Determinism**: Generate with same seed twice - maps should be identical
5. **Parameters**: Compare peaceful vs brutal difficulty - resource scarcity should differ
