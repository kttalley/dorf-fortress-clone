// Phase 5 smoke test — WALK R6: memory-driven foraging + persistent
// exploration targets; WX 7: wetness/snow persistence (mud season)
// Run with: node tests/test-phase5-smoke.js
//
// Proves:
//  (a) foraging is sight-bounded: visible food wins, out-of-sight food is
//      invisible, remembered patches are walked instead, stale food
//      memories are forgotten on arrival, and a critical dwarf keeps the
//      omniscient survival valve
//  (b) exploration targets persist across decisions instead of re-rolling
//      every call, and pay off fulfillment on arrival
//  (c) the ground remembers weather: rain wets soil into mud (slower
//      walking, prompt line, brown tint), snow piles up in winter and
//      thaws to wetness in summer, sand never goes muddy

// --- Fake LLM endpoint (imports pull in llmClient) ---
process.env.VITE_VLLM_URL = 'http://127.0.0.1:9/v1/chat/completions'; // never reached
process.env.VITE_VLLM_MODEL = 'fake-model';
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: 'canned' } }] }),
  text: async () => '',
});

const { decide, AI_STATE } = await import('../src/ai/dwarfAI.js');
const { TASK_TYPE } = await import('../src/sim/tasks.js');
const { createWorldState } = await import('../src/state/store.js');
const { initScentMap } = await import('../src/sim/movement.js');

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

/** Walkable grass world */
function makeState(width = 60, height = 40) {
  const state = createWorldState(width, height);
  state.map.tiles = Array.from({ length: width * height }, () => ({ type: 'grass' }));
  state.foodSources = [];
  state.visitors = [];
  state.animals = [];
  state.tick = 1;
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
    perceptionRadius: 10,
    personality: { bravery: 0.5 },
    skills: {},
    fulfillment: { social: 80, exploration: 80, creativity: 80, tranquility: 80 },
    relationships: {},
    memory: { locations: {}, shortTerm: [], visitedAreas: new Set(), craftedItems: [] },
  };
}

initScentMap(60, 40);

// ============================================================
// (a) memory-driven foraging
// ============================================================
console.log('\n(a) memory-driven foraging');

// Visible food wins
{
  const state = makeState();
  const d = makeDwarf(1, 20, 20, 'Urist');
  d.hunger = 70;
  state.dwarves = [d];
  state.foodSources = [{ x: 25, y: 20, amount: 5 }];
  const r = decide(d, state);
  assert(r.state === AI_STATE.SEEKING_FOOD && r.target?.x === 25,
    'hungry dwarf heads for food in sight');
}

// Out-of-sight food is NOT seen; remembered patch is walked instead
{
  const state = makeState();
  const d = makeDwarf(1, 20, 20, 'Urist');
  d.hunger = 70;
  state.dwarves = [d];
  state.foodSources = [{ x: 55, y: 38, amount: 5 }]; // ~35 tiles away
  d.memory.locations['food_8_20'] = { x: 8, y: 20, type: 'food', lastSeen: 1, visits: 0 };
  const r = decide(d, state);
  assert(r.state === AI_STATE.SEEKING_FOOD && r.target?.x === 8,
    `no food in sight -> walks remembered patch (target x=${r.target?.x})`);
}

// Arrival at a stale remembered FOOD spot forgets it
{
  const state = makeState();
  const d = makeDwarf(1, 9, 20, 'Urist'); // adjacent to the memory
  d.hunger = 70;
  state.dwarves = [d];
  d.memory.locations['food_8_20'] = { x: 8, y: 20, type: 'food', lastSeen: 1, visits: 0 };
  d.currentTask = { type: TASK_TYPE.FORAGE, priority: 60 };
  d._lastDecision = 0;
  decide(d, state);
  assert(!d.memory.locations['food_8_20'], 'stale food memory forgotten on arrival');
}

// Vegetation memories survive a fruitless visit
{
  const state = makeState();
  const d = makeDwarf(1, 9, 20, 'Urist');
  d.hunger = 70;
  state.dwarves = [d];
  d.memory.locations['vegetation_8_20'] = { x: 8, y: 20, type: 'vegetation', lastSeen: 1, visits: 0 };
  d.currentTask = { type: TASK_TYPE.FORAGE, priority: 60 };
  d._lastDecision = 0;
  decide(d, state);
  assert(d.memory.locations['vegetation_8_20']?.visits === 1,
    'vegetation memory kept (and visit counted) after fruitless trip');
}

// Critical hunger keeps the omniscient survival valve
{
  const state = makeState();
  const d = makeDwarf(1, 20, 20, 'Urist');
  d.hunger = 90; // critical
  state.dwarves = [d];
  state.foodSources = [{ x: 55, y: 38, amount: 5 }];
  const r = decide(d, state);
  assert(r.state === AI_STATE.SEEKING_FOOD && r.target?.x === 55,
    'critical dwarf still finds far food (survival valve)');
}

// ============================================================
// (b) persistent exploration targets
// ============================================================
console.log('\n(b) persistent exploration targets');

{
  const state = makeState();
  const d = makeDwarf(1, 30, 20, 'Sigrun');
  state.dwarves = [d];
  d.fulfillment.exploration = 5; // pressing exploration need
  d.currentTask = { type: TASK_TYPE.EXPLORE, priority: 50, target: null };
  d._lastDecision = 0;

  const r1 = decide(d, state);
  const t1 = d._exploreTarget;
  state.tick++;
  d._lastDecision = 0;
  const r2 = decide(d, state);
  const t2 = d._exploreTarget;

  assert(r1.state === AI_STATE.EXPLORING && t1 && typeof t1.x === 'number',
    'explore sets a concrete frontier target');
  assert(t2 && t1.x === t2.x && t1.y === t2.y,
    `frontier target persists across decisions ((${t1?.x},${t1?.y}) === (${t2?.x},${t2?.y}))`);
}

// Arrival pays off and rolls a fresh frontier
{
  const state = makeState();
  const d = makeDwarf(1, 30, 20, 'Sigrun');
  state.dwarves = [d];
  d.fulfillment.exploration = 5;
  d.currentTask = { type: TASK_TYPE.EXPLORE, priority: 50, target: null };
  d._lastDecision = 0;
  d._exploreTarget = { x: 30, y: 21, setTick: state.tick }; // already adjacent
  const before = d.fulfillment.exploration;
  decide(d, state);
  assert(d.fulfillment.exploration > before, 'reaching the frontier pays exploration fulfillment');
  assert(d._exploreTarget === null || d._exploreTarget.x !== 30 || d._exploreTarget.y !== 21,
    'a fresh frontier is rolled after arrival');
}

// ============================================================
// (c) ground cover persistence (WX 7)
// ============================================================
console.log('\n(c) ground cover persistence');

const {
  initGroundCover, tickGroundCover, getWetness, getSnowCover,
  isMuddy, describeGround, tintGroundBg,
} = await import('../src/sim/groundCover.js');
const { getMoveCost } = await import('../src/sim/movement.js');
const { buildLocalContext } = await import('../src/llm/worldContext.js');

/** Fake uniform weather the grids can sample */
function weatherOf(condition) {
  return { getWeatherAt: () => ({ rain: 0, snow: 0, ...condition }) };
}

function runUpdates(state, n) {
  for (let i = 0; i < n; i++) {
    state.tick += 4; // grids update every 4th tick
    tickGroundCover(state);
  }
}

// Rain -> damp -> mud -> slog; sand drains
{
  const state = makeState();
  state.map.tiles[20 * 60 + 41] = { type: 'sand' }; // sand control at (41,20)
  state.clock = { season: 'autumn' };
  state.weather = weatherOf({ rain: 1 });
  state.tick = 0;
  initGroundCover(60, 40);

  runUpdates(state, 5);
  const damp = getWetness(20, 20);
  assert(damp > 0 && !isMuddy(state, 20, 20), `light rain -> damp but not yet mud (${damp.toFixed(2)})`);

  runUpdates(state, 25);
  assert(isMuddy(state, 20, 20), `sustained rain -> grass churns to mud (${getWetness(20, 20).toFixed(2)})`);
  assert(!isMuddy(state, 41, 20), 'sand never goes muddy');
  assert(getMoveCost(state, 20, 20) === 2, 'mud doubles the move cost of grass');
  assert(/mud/i.test(describeGround(20, 20, state)), 'prompts read mud underfoot');
  assert(tintGroundBg(20, 20, '#1a3311') !== null, 'muddy tile gets a render tint');

  // Rain stops: the ground remembers, then slowly dries
  state.weather = weatherOf({});
  runUpdates(state, 3);
  assert(getWetness(20, 20) > 0.4, 'wetness persists after the rain stops');
}

// Snow piles in winter, thaws to wetness in summer
{
  const state = makeState();
  state.clock = { season: 'winter' };
  state.weather = weatherOf({ snow: 1 });
  state.tick = 0;
  initGroundCover(60, 40);

  runUpdates(state, 30);
  const depth = getSnowCover(20, 20);
  assert(depth > 0.5, `winter snowfall accumulates deep snow (${depth.toFixed(2)})`);
  assert(getMoveCost(state, 20, 20) === 2, 'deep snow slows walking');
  assert(/snow/i.test(describeGround(20, 20, state)), 'prompts read snow on the ground');
  const snowTint = tintGroundBg(20, 20, '#1a3311');
  assert(snowTint !== null && snowTint !== '#1a3311', 'snowfield whitens the tile bg');

  // Thaw: snow melts into wet ground
  state.weather = weatherOf({});
  state.clock = { season: 'summer' };
  const wetBefore = getWetness(20, 20);
  runUpdates(state, 15);
  assert(getSnowCover(20, 20) < depth * 0.5, 'summer melts the snowpack');
  assert(getWetness(20, 20) > wetBefore, 'meltwater soaks the ground (thaw = mud season)');
}

// Ground line lands in the L2 local context
{
  const state = makeState();
  state.clock = { season: 'autumn' };
  state.weather = weatherOf({ rain: 1 });
  state.tick = 0;
  initGroundCover(60, 40);
  runUpdates(state, 30);

  const d = makeDwarf(1, 20, 20, 'Urist');
  state.dwarves = [d];
  state.weather = null; // keep buildWeatherContext out of the picture
  const local = buildLocalContext(d, state);
  assert(/mud|damp/i.test(local), 'buildLocalContext reports the muddy ground');
}

// ============================================================
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
