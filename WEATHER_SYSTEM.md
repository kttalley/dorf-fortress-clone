# Emergent Weather System - Design & Integration Guide

## Overview

The weather system is a **deterministic, field-based simulation** layered on top of the world map. It produces visually rich atmospheric effects that affect dwarf cognition, mood, and behavior.

**Key Features:**
- Scalar/vector intensity fields (0-1 per tile)
- Deterministic diffusion and flow
- Terrain interaction (blocking, pooling, channeling)
- ASCII character animation
- Integration with dwarf thought/mood/chat systems
- Performance-aware rendering

---

## Architecture

### Core Components

#### 1. **WeatherSimulator** (`src/sim/weather.js`)
Manages all weather layers and the global tick cycle.

```javascript
const weather = createWeatherSimulator(state.map, seed);

// Each tick:
weather.tick(state);

// Add weather sources (rain, miasma, etc.)
weather.addSource(x, y, 'RAIN', intensity, durationTicks);

// Query weather at position:
const weather = simulator.getWeatherAt(x, y);
// Returns: { rain, snow, fog, miasma, smoke, mist, spores, type, dominant }

// Get rendering info:
const render = simulator.getRenderingAt(x, y);
// Returns: { char, chars, intensity, type, color, brightness, animated }
```

#### 2. **WeatherLayer** (internal class)
Represents a single weather type (rain, fog, etc.)

- **Intensity field**: Float32Array of 0-1 values per tile
- **Update cycle**: Decay → Diffusion → Flow → Pooling
- **Terrain-aware**: Walls block diffusion, enclosed spaces accumulate

#### 3. **Cognition Integration** (`src/sim/weatherCognition.js`)
Links weather to dwarf thoughts, moods, and behavior.

```javascript
// Apply mood shifts
applyWeatherMood(dwarf, 'rain', intensity, state);

// Modify decision-making
const modifier = getWeatherBehaviorModifier(dwarf, 'miasma', intensity);
// Returns: { priorityShift, stateAffinity, health_damage }

// Update fulfillment needs
updateWeatherFulfillment(dwarf, 'fog', intensity);

// Get dialogue context for game assistant
const context = getWeatherChatContext(weather, intensity);
```

#### 4. **Rendering Pipeline** (`src/ui/weatherRenderer.js`)
Converts weather fields to ASCII visuals.

```javascript
initWeatherRendering(simulator);

// Compose terrain + weather for a tile:
const tile = composeWeatherTile(x, y, terrainTile, tick);
// Returns: { char, fg, bg, animated, brightnessShift, intensity }

// Get animated character for a weather type:
const char = getWeatherFrame('rain', tick);
```

---

## Weather Types

### Above-Ground

#### **RAIN** 
- Char: `|` (animated: `|`, `/`, `\`, `|`)
- Decay: 0.15 (fast)
- Diffusion: 0.08 (moderate)
- Effects: Dwarves seek shelter, mood -5
- Doesn't pool

#### **SNOW**
- Char: `*` (animated: `*`, `.`, `*`)
- Decay: 0.05 (slow accumulation)
- Diffusion: 0.03 (drifts slowly)
- Effects: Mood neutral, peaceful atmosphere
- Pools in drifts

#### **FOG**
- Char: `~` (animated: `~`, `≈`, `~`)
- Decay: 0.08
- Diffusion: 0.12 (spreads easily)
- Effects: Mood -3, disorientation
- Pools in valleys

#### **CLOUDS**
- Char: `^` (macro-pattern, slow drift)
- Decay: 0.02 (very persistent)
- Diffusion: 0.02 (minimal)
- Effects: Visual overhead coverage, minimal mood impact
- Doesn't pool; drifts with wind

### Underground

#### **MIST**
- Char: `≈`
- Similar to fog but underground
- Pools heavily in caverns
- Mood: -2, cool/eerie

#### **MIASMA**
- Char: `☁` (animated: `☁`, `≈`, `~`)
- Very slow decay (0.03)
- Moderate diffusion (0.08)
- **Health damage**: 0.5 × intensity per tick when exposed
- Mood: -15 (toxic)
- Pools in enclosed spaces
- **DANGEROUS**: Creates urgent dwarf reactions

#### **SMOKE**
- Char: `∿`
- Fast decay (0.12)
- High diffusion (0.15) — spreads from fires/forges
- Mood: -8, suffocating
- Health damage: 0.5 × intensity

#### **SPORES**
- Char: `·` (animated: `·`, `°`, `·`)
- Moderate decay (0.08)
- Moderate diffusion (0.06)
- Health damage: 0.3 × intensity (allergic reaction)
- Mood: -12, irritating
- Associated with mushroom farms, collapsed caverns

---

## Physics: Diffusion & Flow

### Diffusion Algorithm

Each tick, weather spreads to walkable neighbors if intensity gradient exists:

```
transfer = (intensity_high - intensity_low) × diffusion_rate

intensity_high -= transfer
intensity_low += transfer
```

Walls block diffusion entirely. Enclosed spaces (few walkable neighbors) increase pooling.

### Flow with Wind

Weather drifts in the direction of the global wind vector:

```
windX = cos(windAngle) × windStrength
windY = sin(windAngle) × windStrength
flowDest = (x, y) + (windX, windY)

transfer = intensity × 0.05 × windStrength
addIntensity(flowDest, transfer)
```

Wind angle varies smoothly using deterministic noise:

```
windAngle += seededNoise(seed + tick × 0.001, -0.05, +0.05)
windStrength = 0.3 + sin(tick × 0.01) × 0.2  // 0.1 to 0.5
```

### Pooling

If a tile is surrounded by walls (few open neighbors), accumulation increases:

```
if (openNeighbors < 2) {
  intensity *= 1.1  // Slightly concentrated
}
```

This naturally creates pockets of fog in caves, miasma in sealed rooms, etc.

---

## Integration: Dwarf Cognition

### Mood Impact

Each weather type has a base mood modifier:

```javascript
const WEATHER_MOOD_MAP = {
  rain: { base: -5, intensityEffect: true },       // Worse if intense
  snow: { base: 0, intensityEffect: false },        // Neutral
  fog: { base: -3, intensityEffect: true },
  miasma: { base: -15, intensityEffect: true },     // SEVERE
  smoke: { base: -8, intensityEffect: true },
  mist: { base: -2, intensityEffect: false },
  spores: { base: -12, intensityEffect: true },
};
```

Applied each tick:

```javascript
const moodShift = base × (intensityEffect ? intensity : 1);
dwarf.mood += moodShift × 0.1;  // Smooth application
```

### Behavior Modifiers

Weather affects decision-making via priority shifts and state affinities:

```javascript
{
  rain: {
    priorityShift: { seeking_shelter: +5, working: -3 },
    stateAffinity: 'seeking_shelter'
  },
  miasma: {
    priorityShift: { seeking_shelter: +10, working: -5 },
    stateAffinity: 'sick',
    health_damage: 0.5 × intensity
  }
}
```

When dwarfAI evaluates next action, it applies these shifts:

```javascript
const modifier = getWeatherBehaviorModifier(dwarf, weatherType, intensity);
for (const [state, shift] of Object.entries(modifier.priorityShift)) {
  statePriorities[state] += shift × intensity;
}
```

### Thought Generation

When exposed to significant weather (intensity > 0.4), dwarves emit thoughts:

```javascript
emitWeatherThought(dwarf, weatherType, intensity);
// Generates flavor-text thought like:
// "This heavy rain makes everything so soggy."
// "I feel poisoned by this noxious miasma air!"
```

Thoughts drive mood changes and emerge in conversation context.

### Health Effects

Chronic exposure to harmful weather causes sickness:

```javascript
const effects = getWeatherHealthEffects(dwarf, 'miasma', chronicity);
// { sickness: 0.5, stress: 0.25 }

dwarf.sickness += effects.sickness;
dwarf.stress += effects.stress;
```

### Chat & Game Assistant Context

Game assistant now receives weather context:

```javascript
const weatherChat = getWeatherChatContext(weather, intensity);
// "Heavy miasma is affecting the colony. Dwarves are in danger!"

// Included in askGame() prompt for informed analysis
```

---

## Rendering

### ASCII Composition

Each rendered tile combines terrain + weather:

```javascript
const composite = composeWeatherTile(x, y, terrainTile, tick);
// {
//   char: '|',           // Animated weather character
//   fg: '#4488ff',       // Blended foreground color
//   bg: terrainTile.bg,  // Preserve terrain background
//   brightnessShift: 5,  // Intensity → brightness modulation
//   animated: true
// }
```

### Animation Frames

Weather cycles through multiple characters for smooth motion:

```javascript
const WEATHER_ANIMATIONS = {
  rain:   { frames: ['|', '/', '\\', '|'], speed: 2 },
  snow:   { frames: ['*', '.', '*', '*'], speed: 3 },
  fog:    { frames: ['~', '≈', '~', '·'], speed: 2 },
  miasma: { frames: ['☁', '≈', '~', '≈'], speed: 2 },
};

const char = getWeatherFrame(weatherType, tick);  // Returns frame based on tick
```

### Color Blending

Weather color interpolates with terrain color based on intensity:

```javascript
blendColors(weatherColor, terrainColor, intensity)
// intensity = 0: terrain color
// intensity = 1: weather color
// intensity = 0.5: 50/50 blend
```

### Performance Culling

On low-end devices, only render weather in viewport:

```javascript
const culled = cullWeatherToViewport(simulator, vpX, vpY, vpW, vpH);
// Returns only weather tiles in viewport region
```

---

## Usage: Integration into Main Loop

### Initialization

```javascript
// In main.js during world generation:
import { createWeatherSimulator } from './sim/weather.js';
import { initWeatherRendering } from './ui/weatherRenderer.js';

state.weather = createWeatherSimulator(state.map, mapSeed);
initWeatherRendering(state.weather);
```

### Each Tick

```javascript
// In world.js tick() function:
state.weather.tick(state);

// Dwarves are affected by weather at their position
for (const dwarf of state.dwarves) {
  const weather = state.weather.getWeatherAt(dwarf.x, dwarf.y);
  applyWeatherMood(dwarf, weather.type, weather.dominant, state);
  updateWeatherFulfillment(dwarf, weather.type, weather.dominant);
}
```

### Rendering

```javascript
// In renderer.js when composing cell:
const terrainTile = getTile(state.map, x, y);
const weatherComposite = composeWeatherTile(x, y, terrainTile, state.tick);

if (weatherComposite) {
  // Apply weather rendering
  cell.textContent = weatherComposite.char;
  cell.style.color = weatherComposite.fg;
  // ... apply brightnessShift if needed
}
```

### Weather Sources

```javascript
// Rain event (from scenario or random):
state.weather.addSource(centerX, centerY, 'RAIN', 0.8, 300);

// Miasma from corpse or decay:
state.weather.addSource(corpseX, corpseY, 'MIASMA', 0.5, 500);

// Smoke from forge:
state.weather.addSource(forgeX, forgeY, 'SMOKE', 0.6, 200);
```

---

## Examples: Emergent Patterns

### Scenario 1: Rainstorm

1. Rain source added at map center with intensity 0.8
2. Diffuses outward at rate 0.08 per tick
3. Wind carries it northwest at angle 315°
4. Pools slightly in valleys
5. Dwarves see "rain" at their positions
6. Mood drops; they seek shelter (stairways, stockpiles)
7. Some retreat indoors; others continue outdoor tasks
8. Thoughts emerge: "This gloomy rain..."
9. After 300 ticks, intensity decays, clearing ends

### Scenario 2: Trapped Miasma in Sealed Room

1. Corpse left in sealed chamber; miasma source added
2. No diffusion (walls surround it)
3. Pooling activates; accumulation rate increases 1.1× per tick
4. Intensity climbs to 0.95 within the chamber
5. Dwarf entering room: mood crashes, health damage 0.4/tick
6. Emerges sick, leaves urgently
7. Game assistant notes: "Toxic miasma is a severe problem!"
8. Player must open room, ventilate, or clean corpse

### Scenario 3: Cavern Mist Formation

1. Underground cavern with water pool
2. Cool mist source rises at intensity 0.3
3. Spreads through connected caverns via diffusion 0.10
4. Accumulates in enclosed dead-ends
5. Dwarves feel "eerie isolation" (-2 mood, minimal)
6. Thoughts: "The cool mist has a certain charm"
7. Persists indefinitely at low intensity unless source removed

---

## Performance Considerations

### Optimization Strategies

1. **Lazy Updates**: Only update tiles with intensity > 0.01
2. **Viewport Culling**: Skip rendering outside visible region
3. **Field Decimation**: On low-end devices, simulate at half resolution
4. **Diffusion Skipping**: Reduce diffusion passes per tick on frame drops

### Fallback Mode

If performance budget exceeded:

```javascript
if (device.memory < 50MB) {
  enableFullDiffusion = false;  // Skip diffusion
  diffusionInterval = 3;         // Diffuse every 3rd tick
  renderCulled = true;           // Cull to viewport
}
```

---

## Debug Utilities

### Visualize Weather Field

```javascript
// Render weather type to debug canvas
visualizeWeatherField(state.weather, 'miasma', canvasEl);
// Shows intensity heatmap in real-time
```

### Export as Text

```javascript
const text = exportWeatherFieldAsText(state.weather, 'fog', threshold=0.3);
// Shows ASCII grid of weather, useful for inspection
```

### Get Weather Info at Cursor

```javascript
const weather = state.weather.getWeatherAt(cursorX, cursorY);
console.log(`Type: ${weather.type}, Intensity: ${weather.dominant}`);
```

---

## Future Extensions

1. **Weather Persistence**: Save/load weather state
2. **Dynamic Source Generation**: Auto-spawn rain based on sky conditions
3. **Particle Visualizer**: Optional: high-end devices render actual particles
4. **Weather Prediction**: LLM-based weather forecasting for narrative
5. **Player Commands**: Allow dwarves to manage weather (ventilation, drainage)
6. **Seasonal Cycles**: Weather variation tied to in-game seasons
7. **Biome-Specific Weather**: Desert storms, tropical rain, arctic wind

---

## Code Locations

| System | File |
|--------|------|
| Core Simulator | `src/sim/weather.js` |
| Dwarf Integration | `src/sim/weatherCognition.js` |
| Rendering | `src/ui/weatherRenderer.js` |
| Event System | `src/events/eventBus.js` (WEATHER_CHANGE event) |
| Main Integration | `src/main.js` (initialization), `src/sim/world.js` (tick loop) |

---

## Next Steps for Implementation

1. ✅ Design architecture (this document)
2. ⬜ Integrate weather simulator into world tick
3. ⬜ Wire up dwarf cognition listeners
4. ⬜ Implement weather rendering in tile composer
5. ⬜ Add weather sources (scenario hooks, random events)
6. ⬜ Test and balance mood/health effects
7. ⬜ Add debug UI for weather visualization
8. ⬜ Document gameplay consequences
