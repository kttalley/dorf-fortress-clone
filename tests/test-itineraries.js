// Visitor itineraries + real pathing smoke test (audit WALK R9)
// Run with: node tests/test-itineraries.js
//
// Proves:
//  (a) role-based itineraries: elves sightsee landmarks, scouts get orbit
//      observation points, raiders get none, merchants may detour
//  (b) the TOURING flow: walk to stop, narrate once, linger, advance,
//      then fall through to role logic; unreachable stops time out
//  (c) A* path-following: a visitor routes AROUND a wall the greedy
//      stepper gets stuck on, and merchants head for the market spot
//  (d) sightseeing feeds the day-end narrator queue

// --- Fake LLM endpoint (eventNarrator imports pull in llmClient) ---
process.env.VITE_VLLM_URL = 'http://127.0.0.1:9/v1/chat/completions'; // never reached
process.env.VITE_VLLM_MODEL = 'fake-model';
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: 'canned' } }] }),
  text: async () => '',
});

const { createWorldState } = await import('../src/state/store.js');
const { createVisitor, VISITOR_STATE } = await import('../src/sim/visitors.js');
const { VISITOR_ROLE, RACE } = await import('../src/sim/races.js');
const { buildItinerary, ensureItinerary, currentStop, advanceStop, findMarketSpot } = await import('../src/ai/itineraries.js');
const { processVisitors } = await import('../src/ai/visitorAI.js');
const { getPendingCount, clearPending } = await import('../src/llm/eventNarrator.js');
const { initConstruction } = await import('../src/sim/construction.js');

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
function makeState(width = 40, height = 30) {
  const state = createWorldState(width, height);
  state.map.tiles = Array.from({ length: width * height }, () => ({ type: 'grass' }));
  state.tick = 1;
  return state;
}

function makeDwarf(id, x, y) {
  return { id, x, y, type: 'dwarf', name: `D${id}`, hp: 10, maxHp: 10, state: 'idle' };
}

initConstruction(); // no completed structures: market falls back to landmark/camp

// ============================================================
// (a) role-based itineraries
// ============================================================
console.log('\n(a) itinerary construction');

const state = makeState();
state.dwarves = [makeDwarf(1, 20, 15), makeDwarf(2, 22, 15)];
state.landmarks = [
  { name: 'the Crystal Hollow', type: 'crystal', x: 8, y: 8, count: 4 },
  { name: 'the River Bend', type: 'river', x: 30, y: 20, count: 9 },
];

const elf = createVisitor(2, 2, RACE.ELF, VISITOR_ROLE.MISSIONARY, {});
const elfStops = buildItinerary(elf, state);
assert(elfStops.length === 2, `elf gets ${elfStops.length} sightseeing stops`);
assert(elfStops[0].name === 'the Crystal Hollow', 'elf visits the nearest landmark first');
assert(elfStops.every(s => s.narrate), 'elf stops are narration-worthy');

const scout = createVisitor(2, 15, RACE.GOBLIN, VISITOR_ROLE.SCOUT, {});
const scoutStops = buildItinerary(scout, state);
assert(scoutStops.length === 3, 'scout gets 3 observation points');
assert(scoutStops.every(s => s.skittish), 'scout stops are skittish (abandon near dwarves)');
assert(scoutStops.every(s => s.x >= 1 && s.x <= 38 && s.y >= 1 && s.y <= 28), 'observation points stay in bounds');

const raider = createVisitor(2, 2, RACE.GOBLIN, VISITOR_ROLE.RAIDER, {});
assert(buildItinerary(raider, state).length === 0, 'raiders do not sightsee');

const origRandom = Math.random;
Math.random = () => 0.3; // < 0.5: merchant takes the detour
const merchant = createVisitor(2, 2, RACE.HUMAN, VISITOR_ROLE.MERCHANT, {});
const merchantStops = buildItinerary(merchant, state);
assert(merchantStops.length === 1 && merchantStops[0].name === 'the Crystal Hollow', 'merchant detours past one landmark');
Math.random = origRandom;

// Market spot: no structures -> landmark nearest the fortress center
const market = findMarketSpot(state);
assert(market.name === 'the River Bend', `market is the landmark nearest camp (${market.name})`);

// ============================================================
// (b) touring flow
// ============================================================
console.log('\n(b) touring: walk, narrate, linger, advance');

clearPending();
const tourState = makeState();
tourState.dwarves = [makeDwarf(1, 35, 25)];
tourState.landmarks = [{ name: 'the Crystal Hollow', type: 'crystal', x: 10, y: 10, count: 4 }];

const tourist = createVisitor(4, 4, RACE.ELF, VISITOR_ROLE.MISSIONARY, {});
tourist.entryEdge = 'west';
tourState.visitors = [tourist];

// Walk until lingering at the first stop
let lingered = false;
for (let i = 0; i < 60 && !lingered; i++) {
  tourState.tick++;
  processVisitors(tourState);
  if (tourist.state === VISITOR_STATE.TOURING && (tourist._lingerTicks || 0) > 0) lingered = true;
}
assert(lingered, 'elf reaches the landmark and lingers');
assert(getPendingCount() > 0, 'sightseeing queued a line for the day-end narrator');

// Linger out both stops -> falls through to role logic (missionary arrives/preaches)
for (let i = 0; i < 250; i++) {
  tourState.tick++;
  processVisitors(tourState);
}
assert(currentStop(tourist) === null, 'itinerary completes');
assert(tourist.state !== VISITOR_STATE.TOURING, `after touring, role logic takes over (state: ${tourist.state})`);

// Unreachable stop times out
const walled = createVisitor(2, 2, RACE.ELF, VISITOR_ROLE.MISSIONARY, {});
walled.itinerary = [{ x: 20, y: 20, name: 'nowhere', linger: 10 }];
walled.itineraryIndex = 0;
walled._stopTicks = 400; // already over budget
const wallState = makeState();
wallState.dwarves = [];
wallState.visitors = [walled];
wallState.tick = 2;
processVisitors(wallState);
assert(currentStop(walled) === null, 'unreachable stops are abandoned after the timeout');

// ============================================================
// (c) A* pathing: route around a wall
// ============================================================
console.log('\n(c) real pathing around obstacles');

const mazeState = makeState(40, 21);
mazeState.dwarves = [];
// Vertical stone wall at x=20 with a single gap at y=1; greedy stepping from
// (10,10) toward (30,10) jams against the wall, A* routes through the gap
for (let y = 0; y < 21; y++) {
  if (y !== 1) mazeState.map.tiles[y * 40 + 20] = { type: 'stone_wall' };
}

const traveler = createVisitor(10, 10, RACE.HUMAN, VISITOR_ROLE.DIPLOMAT, {});
traveler.itinerary = []; // no stops: diplomat heads straight for the "fortress"
traveler.itineraryIndex = 0;
// Plant the fortress on the far side of the wall
mazeState.dwarves = [makeDwarf(1, 30, 10)];
mazeState.visitors = [traveler];

let crossed = false;
for (let i = 0; i < 120 && !crossed; i++) {
  mazeState.tick++;
  processVisitors(mazeState);
  if (traveler.x > 20) crossed = true;
}
assert(crossed, `visitor crossed the wall via the gap (ended at ${traveler.x},${traveler.y})`);

// ============================================================
console.log(`\n${passed} passed, ${failed} failed`);
clearPending();
if (failed > 0) process.exit(1);
