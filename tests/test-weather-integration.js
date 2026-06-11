// Weather system integration test — rewritten for the rot.js front/particle
// rewrite (b110889). The old version poked pre-rewrite internals
// (weather.layers.RAIN.intensity) that no longer exist; this one exercises
// only the public surface: constructor, addSource, tick, getWeatherAt,
// getRenderingAt, and the translucent composeWeatherTile compositing.
// Run with: node tests/test-weather-integration.js

import { WeatherSimulator } from '../src/sim/weather.js';
import { createWorldState } from '../src/state/store.js';
import { applyWeatherMood } from '../src/sim/weatherCognition.js';
import { composeWeatherTile } from '../src/ui/weatherRenderer.js';

let passed = 0;
let failed = 0;
function assert(cond, label) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.error(`  FAIL  ${label}`);
  }
}

const WIDTH = 60;
const HEIGHT = 30;

function makeState() {
  const state = createWorldState(WIDTH, HEIGHT);
  state.map.tiles = Array.from({ length: WIDTH * HEIGHT }, () => ({ type: 'grass' }));
  return state;
}

// --- (1) construction + public shape ---
console.log('\n(1) simulator construction');

const weather = new WeatherSimulator(WIDTH, HEIGHT, 12345);
assert(weather.width === WIDTH && weather.height === HEIGHT, 'dimensions stored');
assert(Array.isArray(weather.sources) && weather.sources.length === 0, 'starts with no sources');

const empty = weather.getWeatherAt(10, 10);
assert(typeof empty.dominant === 'number' && 'rain' in empty && 'fog' in empty, 'getWeatherAt returns the field aggregate');

// --- (2) ticking + sources ---
console.log('\n(2) ticking with an active rain source');

const state = makeState();
state.weather = weather;

weather.addSource(30, 15, 'RAIN', 0.9, 200);
assert(weather.sources.length === 1, 'addSource accepts an uppercase WEATHER_TYPES key');
weather.addSource(30, 15, 'NOT_A_TYPE', 0.9, 200);
assert(weather.sources.length === 1, 'unknown weather types are rejected');

let tickError = null;
try {
  for (let i = 0; i < 30; i++) {
    state.tick++;
    weather.tick(state);
  }
} catch (error) {
  tickError = error;
}
assert(!tickError, `30 ticks run clean${tickError ? ` (threw: ${tickError.message})` : ''}`);

const atSource = weather.getWeatherAt(30, 15);
assert(atSource.rain > 0, `rain present at the source (${atSource.rain.toFixed(2)})`);
assert(atSource.dominant >= atSource.rain - 1e-9, 'dominant >= each field');

// Sources expire
const shortLived = new WeatherSimulator(WIDTH, HEIGHT, 99);
shortLived.addSource(5, 5, 'FOG', 0.5, 3);
const s2 = makeState();
s2.weather = shortLived;
for (let i = 0; i < 6; i++) {
  s2.tick++;
  shortLived.tick(s2);
}
assert(shortLived.sources.length === 0, 'sources expire after their duration');

// --- (3) weather cognition uses lowercase field ids ---
console.log('\n(3) dwarf mood coupling');

const dwarf = { id: 1, type: 'dwarf', x: 30, y: 15, mood: 50, personality: {} };
applyWeatherMood(dwarf, 'rain', 0.8, state);
assert(dwarf.mood !== 50, `rain moves mood (50 -> ${dwarf.mood.toFixed(1)})`);

// --- (4) translucent compositing: terrain stays legible ---
console.log('\n(4) compositing never blankets the terrain');

const terrain = { char: '.', fg: '#88aa66', bg: '#1a2a1a' };

// No simulator -> terrain unchanged
const bare = composeWeatherTile(10, 10, terrain, 0, null);
assert(bare.char === terrain.char && bare.fg === terrain.fg, 'no weather -> terrain passes through');

// Saturate a wide area, then verify weather glyphs stay sparse: most cells
// must keep their terrain glyph even inside an active front (the old
// renderer replaced 100% of cells above intensity 0.3)
const stormy = new WeatherSimulator(WIDTH, HEIGHT, 7);
const s3 = makeState();
s3.weather = stormy;
for (let x = 20; x <= 40; x += 5) {
  for (let y = 8; y <= 22; y += 7) {
    stormy.addSource(x, y, 'RAIN', 1.0, 500);
  }
}
for (let i = 0; i < 40; i++) {
  s3.tick++;
  stormy.tick(s3);
}

let cells = 0;
let replacedGlyphs = 0;
let weatherSeen = 0;
for (let y = 8; y <= 22; y++) {
  for (let x = 20; x <= 40; x++) {
    cells++;
    if (stormy.getWeatherAt(x, y).dominant > 0.1) weatherSeen++;
    const composed = composeWeatherTile(x, y, terrain, s3.tick, stormy);
    if (composed.char !== terrain.char) replacedGlyphs++;
  }
}
assert(weatherSeen > 0, `storm actually covers the sampled area (${weatherSeen}/${cells} cells active)`);
assert(replacedGlyphs / cells < 0.5, `weather glyphs are sparse, not a blanket (${replacedGlyphs}/${cells} replaced)`);

// --- summary ---
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
