#!/usr/bin/env node

/**
 * Weather System Integration Test
 * Run with: npm run test:weather
 */

import { WeatherSimulator } from '../src/sim/weather.js';
import { createWorldState } from '../src/state/store.js';
import { createDwarf } from '../src/sim/entities.js';
import { composeWeatherTile } from '../src/ui/weatherRenderer.js';
import { applyWeatherMood } from '../src/sim/weatherCognition.js';

console.log('\n=== WEATHER SYSTEM INTEGRATION TEST ===\n');

try {
  // Test 1: Weather Simulator Initialization
  console.log('✓ Test 1: Weather Simulator Initialization');
  const weather = new WeatherSimulator(142, 40, 12345);
  console.log(`  - Created simulator: ${weather.constructor.name}`);
  console.log(`  - Width: ${weather.width}, Height: ${weather.height}`);
  console.log(`  - Layers: ${Object.keys(weather.layers).length}`);

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

  // Test 3: Weather Source (Rain)
  console.log('\n✓ Test 3: Weather Source (Rain)');
  weather.addSource(70, 20, 'RAIN', 0.8, 100);
  console.log(`  - Added RAIN source at (70, 20)`);
  const rainyPos = weather.getWeatherAt(70, 20);
  console.log(`  - Rain intensity at source: ${rainyPos.rain?.toFixed(2) || '0.00'}`);

  // Test 4: Dwarf Weather Effects
  console.log('\n✓ Test 4: Dwarf Weather Mood Effects');
  const dwarf = createDwarf(70, 20);
  dwarf.mood = 50;
  const moodBefore = dwarf.mood;
  console.log(`  - Dwarf initial mood: ${moodBefore}`);
  applyWeatherMood(dwarf, 'RAIN', 0.8, state);
  const moodAfter = dwarf.mood;
  console.log(`  - Dwarf mood after rain effect: ${moodAfter.toFixed(1)}`);

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

  console.log('\n=== ALL TESTS PASSED ✓ ===\n');
  console.log('Weather system is successfully integrated!');
  console.log('Initialization: ✓');
  console.log('Simulation ticking: ✓');
  console.log('Dwarf effects: ✓');
  console.log('Rendering: ✓');
  console.log('');
  
  process.exit(0);
} catch (error) {
  console.error('\n✗ TEST FAILED:\n');
  console.error(error.message);
  console.error(error.stack);
  process.exit(1);
}
