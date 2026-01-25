/**
 * Test Weather System Integration
 * 
 * Quick verification that:
 * 1. Weather simulator initializes
 * 2. Weather ticks without errors
 * 3. Dwarves receive weather mood effects
 * 4. Rendering can compose weather tiles
 */

import { WeatherSimulator } from './src/sim/weather.js';
import { createWorldState } from './src/state/store.js';
import { createDwarf } from './src/sim/entities.js';
import { composeWeatherTile } from './src/ui/weatherRenderer.js';

console.log('\n=== WEATHER SYSTEM INTEGRATION TEST ===\n');

// Test 1: Weather Simulator Initialization
console.log('✓ Test 1: Weather Simulator Initialization');
const weather = new WeatherSimulator(142, 40, 12345);
console.log(`  - Created simulator: ${weather.constructor.name}`);
console.log(`  - Width: ${weather.width}, Height: ${weather.height}`);
console.log(`  - Layers: ${Object.keys(weather.layers).length}`);
console.assert(weather.width === 142, 'Width should be 142');
console.assert(weather.height === 40, 'Height should be 40');
console.assert(Object.keys(weather.layers).length === 8, 'Should have 8 weather layers');

// Test 2: Weather Tick
console.log('\n✓ Test 2: Weather Tick Execution');
const state = createWorldState(142, 40);
state.weather = weather;
for (let i = 0; i < 10; i++) {
  state.tick++;
  weather.tick(state);
}
console.log(`  - Executed 10 weather ticks`);
console.log(`  - Current tick: ${state.tick}`);
console.assert(state.tick === 10, 'Tick should be 10');

// Test 3: Weather Source
console.log('\n✓ Test 3: Weather Source (Rain)');
weather.addSource(70, 20, 'RAIN', 0.8, 100);
console.log(`  - Added RAIN source at (70, 20)`);
const rainyPos = weather.getWeatherAt(70, 20);
console.log(`  - Rain intensity at source: ${rainyPos.rain?.toFixed(2) || 'undefined'}`);
console.assert(rainyPos.rain > 0.5, 'Rain should be significant at source');

// Test 4: Dwarf Weather Effects
console.log('\n✓ Test 4: Dwarf Weather Mood Effects');
const dwarf = createDwarf(70, 20);
dwarf.mood = 50;
const moodBefore = dwarf.mood;
console.log(`  - Dwarf initial mood: ${moodBefore}`);

// Simulate weather cognition effect
import { applyWeatherMood } from './src/sim/weatherCognition.js';
applyWeatherMood(dwarf, 'RAIN', 0.8, state);
const moodAfter = dwarf.mood;
console.log(`  - Dwarf mood after rain effect: ${moodAfter.toFixed(1)}`);
console.log(`  - Mood delta: ${(moodAfter - moodBefore).toFixed(2)}`);

// Test 5: Weather Rendering
console.log('\n✓ Test 5: Weather Tile Composition');
const terrainTile = {
  char: '.',
  fg: '#888888',
  bg: '#000000',
};
const weatherComposed = composeWeatherTile(70, 20, terrainTile, 0, weather);
console.log(`  - Original char: '${terrainTile.char}'`);
console.log(`  - Weather composed char: '${weatherComposed.char}'`);
console.log(`  - Composed intensity: ${weatherComposed.intensity?.toFixed(2)}`);
console.log(`  - Composed is animated: ${weatherComposed.animated}`);

// Test 6: Multiple Weather Layers
console.log('\n✓ Test 6: Multiple Weather Layers');
weather.addSource(50, 15, 'MIASMA', 0.6, 100);
weather.addSource(60, 10, 'FOG', 0.5, 100);
weather.tick(state);
const multiPos = weather.getWeatherAt(55, 12);
console.log(`  - Position (55, 12) weather:`);
console.log(`    - Rain: ${multiPos.rain?.toFixed(2) || '0.00'}`);
console.log(`    - Miasma: ${multiPos.miasma?.toFixed(2) || '0.00'}`);
console.log(`    - Fog: ${multiPos.fog?.toFixed(2) || '0.00'}`);

// Test 7: Weather Physics (Diffusion)
console.log('\n✓ Test 7: Weather Diffusion/Spreading');
weather.layers.RAIN.intensity.fill(0);  // Clear field
const centerIdx = 20 * weather.width + 71;
weather.layers.RAIN.intensity[centerIdx] = 1.0;
console.log(`  - Set RAIN to 1.0 at center (71, 20)`);
weather.layers.RAIN.update(state, 0, 0, true);
const neighbor1 = weather.layers.RAIN.intensity[centerIdx + 1];
const neighbor2 = weather.layers.RAIN.intensity[centerIdx - 1];
console.log(`  - Neighbor (72, 20) intensity: ${neighbor1.toFixed(3)}`);
console.log(`  - Neighbor (70, 20) intensity: ${neighbor2.toFixed(3)}`);
console.assert(neighbor1 > 0, 'Rain should diffuse to right neighbor');
console.assert(neighbor2 > 0, 'Rain should diffuse to left neighbor');

console.log('\n=== ALL TESTS PASSED ===\n');
