// Phase 5 smoke test — WALK R6: memory-driven foraging + persistent
// exploration targets
// Run with: node tests/test-phase5-smoke.js
//
// Proves:
//  (a) foraging is sight-bounded: visible food wins, out-of-sight food is
//      invisible, remembered patches are walked instead, stale food
//      memories are forgotten on arrival, and a critical dwarf keeps the
//      omniscient survival valve
//  (b) exploration targets persist across decisions instead of re-rolling
//      every call, and pay off fulfillment on arrival

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
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
