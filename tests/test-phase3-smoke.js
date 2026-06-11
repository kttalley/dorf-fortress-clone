// Phase 3 smoke test — local senses: behavior trace, L2 local context,
// weather-driven shelter-seeking
// Run with: node tests/test-phase3-smoke.js
//
// Proves:
//  (a) the behavior-trace ring buffer summarizes movement deterministically
//      (lingering / pacing / ranging + dominant activity)
//  (b) buildLocalContext senses tile, weather, nearby dwarves AND visitors,
//      food, remembered places, and the trace — and lands in the USER half
//      of assembleContext, never the system prefix
//  (c) bad weather pushes a seek_shelter task into dwarf decision-making and
//      the dwarf heads for cover; clear weather does not

// --- Fake LLM endpoint (imports pull in llmClient) ---
process.env.VITE_VLLM_URL = 'http://127.0.0.1:9/v1/chat/completions'; // never reached
process.env.VITE_VLLM_MODEL = 'fake-model';
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: 'canned' } }] }),
  text: async () => '',
});

const { sampleBehavior, summarizeBehavior, compassDirection } = await import('../src/sim/behaviorTrace.js');
const { buildLocalContext, getTileDescription, assembleContext, invalidateWorldLore, buildWorldLore } =
  await import('../src/llm/worldContext.js');
const { decide, AI_STATE } = await import('../src/ai/dwarfAI.js');
const { TASK_TYPE } = await import('../src/sim/tasks.js');
const { createWorldState } = await import('../src/state/store.js');

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

/** Fill a world state's map with walkable grass + one cave pocket */
function makeState(width = 30, height = 30) {
  const state = createWorldState(width, height);
  state.map.tiles = Array.from({ length: width * height }, () => ({ type: 'grass' }));
  state.map.tiles[5 * width + 5] = { type: 'cave_floor' }; // shelter pocket at (5,5)
  state.foodSources = [];
  state.visitors = [];
  return state;
}

/** Minimal but decide()-complete dwarf */
function makeDwarf(id, x, y, name) {
  return {
    id, x, y,
    type: 'dwarf',
    name,
    generatedName: name,
    state: 'idle',
    hp: 10, maxHp: 10,
    hunger: 0,
    mood: 50,
    personality: { bravery: 0.5 },
    skills: {},
    fulfillment: { social: 80, exploration: 80, creativity: 80, tranquility: 80 },
    relationships: {},
    memory: { locations: {}, shortTerm: [], visitedAreas: new Set(), craftedItems: [] },
  };
}

// --- (a) behavior trace ---
console.log('\n(a) behavior trace ring buffer');

assert(compassDirection(0, -5) === 'north' && compassDirection(4, 4) === 'southeast', 'compass directions');

const stayer = { x: 7, y: 7, state: 'digging' };
for (let t = 0; t <= 50; t += 5) sampleBehavior(stayer, t);
assert(summarizeBehavior(stayer) === 'lingering in one spot, mostly digging', `stationary digger -> "${summarizeBehavior(stayer)}"`);

const walker = { x: 0, y: 10, state: 'exploring' };
for (let t = 0; t <= 50; t += 5) {
  sampleBehavior(walker, t);
  walker.x += 2; // marching east
}
assert(summarizeBehavior(walker).includes('ranging east'), `eastward walker -> "${summarizeBehavior(walker)}"`);
assert(summarizeBehavior(walker).includes('mostly exploring'), 'trace carries the dominant activity');

const pacer = { x: 10, y: 10, state: 'wandering' };
for (let t = 0; t <= 55; t += 5) {
  sampleBehavior(pacer, t);
  pacer.x = 10 + ((t / 5) % 2 === 0 ? 3 : -3); // back and forth
}
assert(summarizeBehavior(pacer).startsWith('pacing around'), `pacer -> "${summarizeBehavior(pacer)}"`);

assert(summarizeBehavior({ x: 1, y: 1 }) === '', 'no trace yet -> empty string, nothing throws');

const capped = { x: 0, y: 0, state: 'idle' };
for (let t = 0; t <= 500; t += 5) sampleBehavior(capped, t);
assert(capped._trace.length === 12, `ring buffer capped at 12 (got ${capped._trace.length})`);

// --- (b) L2 local context ---
console.log('\n(b) buildLocalContext local senses');

const state = makeState();
const urist = makeDwarf(1, 10, 10, 'Urist');
const sigrun = makeDwarf(2, 12, 10, 'Sigrun');
sigrun.state = 'digging';
state.dwarves = [urist, sigrun];
state.visitors = [{ id: 90, x: 13, y: 11, type: 'goblin', race: 'goblin', name: 'Snag', generatedName: 'Snag', state: 'wandering', hp: 5, maxHp: 5 }];
state.foodSources = [{ x: 9, y: 9, amount: 5 }];
state.weather = { getWeatherAt: () => ({ type: 'rain', dominant: 0.8 }) };
urist.memory.locations = { 'water_20_10': { x: 20, y: 10, type: 'water', lastSeen: 100 } };
urist._trace = stayer._trace ? null : null;
for (let t = 0; t <= 50; t += 5) sampleBehavior(urist, t); // stationary, idle

const local = buildLocalContext(urist, state);
assert(local.includes('a grassy meadow'), 'senses the tile underfoot');
assert(local.includes('gloomy rain'), 'senses the weather (buildWeatherContext finally called)');
assert(local.includes('Sigrun (digging)'), 'sees the nearby dwarf with her state');
assert(local.includes('Snag the goblin'), 'NOTICES the goblin visitor');
assert(local.includes('a food source'), 'sees nearby food');
assert(local.includes('water to the east'), 'recalls a remembered place with direction');
assert(local.includes('You have been lingering in one spot'), 'includes the behavior trace');

assert(getTileDescription(5, 5, state) === 'a dim cavern', 'shared tile description reads the map');
assert(buildLocalContext(null, state) === '' && buildLocalContext(urist, null) === '', 'missing inputs -> empty, nothing throws');

// L2 lands in the user message, not the cached system prefix
invalidateWorldLore();
buildWorldLore(state, { title: 'The Long Rain' });
const ctx = assembleContext({ entity: urist, state, scenario: null, turn: 'What do you see?' });
assert(ctx.user.includes('Snag the goblin') && ctx.user.includes('What do you see?'), 'L2 + L3 render into the user message');
assert(!ctx.system.includes('Snag the goblin'), 'volatile L2 stays out of the system prefix');

// --- (c) weather-driven shelter-seeking ---
console.log('\n(c) shelter-seeking in bad weather');

const origRandom = Math.random;
Math.random = () => 0.5; // suppress the stochastic branches (considerBuilding etc.)

try {
  const stormState = makeState();
  const dorf = makeDwarf(3, 10, 10, 'Dolin');
  stormState.dwarves = [dorf];
  stormState.weather = { getWeatherAt: () => ({ type: 'miasma', dominant: 0.9 }) };

  decide(dorf, stormState);
  assert(dorf.currentTask?.type === TASK_TYPE.SEEK_SHELTER, `miasma -> seek_shelter task (got "${dorf.currentTask?.type}")`);
  assert(dorf.currentTask?.target?.x === 5 && dorf.currentTask?.target?.y === 5, 'shelter target is the cave pocket');

  // Already sheltered: hunker down instead of wandering off
  dorf.x = 5;
  dorf.y = 5;
  const moodBefore = dorf.mood;
  dorf._lastDecision = 0; // continue the current task
  const decision = decide(dorf, stormState);
  assert(decision.state === AI_STATE.SEEKING_SHELTER, 'stays in seeking_shelter state inside the cave');
  assert(dorf.mood > moodBefore, 'hunkering down recovers a little mood');

  // Clear skies: no shelter task gets queued
  const calmState = makeState();
  const merry = makeDwarf(4, 10, 10, 'Merry');
  calmState.dwarves = [merry];
  calmState.weather = { getWeatherAt: () => ({ type: 'clouds', dominant: 0.1 }) };

  decide(merry, calmState);
  assert(merry.currentTask?.type !== TASK_TYPE.SEEK_SHELTER, `clear weather -> no shelter task (got "${merry.currentTask?.type}")`);
} finally {
  Math.random = origRandom;
}

// --- summary ---
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
