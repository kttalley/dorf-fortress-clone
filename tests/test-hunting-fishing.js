// Hunting + fishing wire-up smoke test (audit pass 2)
// Run with: node tests/test-hunting-fishing.js
//
// Proves:
//  (a) hunting: a hungry dwarf with prey in range picks the HUNT task,
//      chases via the movement system (single mover), lands attacks when
//      adjacent, kills emit HUNTING_SUCCESS + loot, and visible real food
//      still outranks hunting; the timid and unskilled don't hunt
//  (b) fishing: a hungry dwarf near water picks the FISH task, walks to a
//      bank tile, casting creates fish food at their feet and emits
//      FISHING_SUCCESS; rain raises the catch chance through the live
//      weather shape; the impatient and untrained don't fish
//  (c) the old fishing arg-order bug is dead: water adjacency reads real
//      tiles (water_shallow/water_deep/river, not the nonexistent 'water')

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
const { createAnimal } = await import('../src/sim/animals.js');
const { createFoodSource } = await import('../src/sim/entities.js');
const { attemptHunt, canHuntAt, getHuntingAbility, HUNTING_CONFIG } = await import('../src/sim/hunting.js');
const { attemptFish, canFishAt, getFishingAbility, isWaterTile, FISHING_CONFIG } = await import('../src/sim/fishing.js');
const { on, EVENTS } = await import('../src/events/eventBus.js');

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

const realRandom = Math.random;
function withRandom(value, fn) {
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = realRandom;
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

function setTileType(state, x, y, type) {
  state.map.tiles[y * state.map.width + x] = { type };
}

/** Minimal but decide()-complete dwarf */
function makeDwarf(id, x, y, name, personality = {}) {
  return {
    id, x, y,
    type: 'dwarf',
    name,
    generatedName: name,
    state: 'idle',
    hp: 10, maxHp: 10,
    damage: 3,
    hunger: 0,
    mood: 50,
    perceptionRadius: 10,
    personality: { bravery: 0.5, patience: 0.5, ...personality },
    skills: [],
    fulfillment: { social: 80, exploration: 80, creativity: 80, tranquility: 80 },
    relationships: {},
    memory: { locations: {}, shortTerm: [], visitedAreas: new Set(), craftedItems: [] },
  };
}

initScentMap(60, 40);

// ============================================================
// (a) hunting
// ============================================================
console.log('\n(a) hunting');

{
  // Hungry dwarf, deer 5 tiles away, no food anywhere -> HUNT task + chase
  const state = makeState();
  const dwarf = makeDwarf(1, 20, 20, 'Urist');
  dwarf.hunger = 75;
  state.dwarves = [dwarf];
  const deer = createAnimal(25, 20, 'deer');
  state.animals = [deer];

  const decision = decide(dwarf, state);
  assert(dwarf.currentTask?.type === TASK_TYPE.HUNT, 'hungry dwarf with prey in range picks HUNT');
  assert(decision.state === AI_STATE.HUNTING, 'decision state is hunting');
  const distAfter = Math.max(Math.abs(dwarf.x - deer.x), Math.abs(dwarf.y - deer.y));
  assert(distAfter < 5, `chase moved the dwarf toward the prey (now ${distAfter} tiles away)`);
}

{
  // Adjacent prey: forced hit damages it; forced kill emits success + loot
  const state = makeState();
  const dwarf = makeDwarf(2, 20, 20, 'Dakas');
  dwarf.hunger = 75;
  state.dwarves = [dwarf];
  const deer = createAnimal(21, 20, 'deer');
  state.animals = [deer];

  let hits = 0;
  let kills = 0;
  const offHit = on(EVENTS.HUNTING_HIT, () => hits++);
  const offKill = on(EVENTS.HUNTING_SUCCESS, () => kills++);

  const hpBefore = deer.hp;
  withRandom(0.0, () => attemptHunt(dwarf, deer, state)); // random 0 < hitChance -> hit
  assert(deer.hp < hpBefore, 'adjacent attack damages prey');
  assert(hits === 1, 'HUNTING_HIT emitted');

  deer.hp = 1;
  const result = withRandom(0.0, () => attemptHunt(dwarf, deer, state));
  assert(result.killed === true, 'low-hp prey is killed');
  assert(kills === 1, 'HUNTING_SUCCESS emitted');
  assert((dwarf.hunting_loot || []).some(l => l.type === 'meat'), 'kill loots meat');
  assert(dwarf.skills.find(s => s.name === 'hunting'), 'hunting skill seeded by practice');

  offHit();
  offKill();
}

{
  // workHunt resolves the kill: task cleared, log line written
  const state = makeState();
  const dwarf = makeDwarf(3, 20, 20, 'Vabok');
  dwarf.hunger = 75;
  state.dwarves = [dwarf];
  const deer = createAnimal(21, 20, 'deer');
  deer.hp = 1;
  state.animals = [deer];

  withRandom(0.0, () => decide(dwarf, state)); // picks HUNT, adjacent -> kill
  assert(deer.hp <= 0, 'workHunt kills adjacent low-hp prey on the spot');
  assert(dwarf.currentTask === null, 'hunt task cleared after the kill');
  assert(state.log.some(e => /brought down a deer/.test(e.message)), 'kill logged for the event feed');
}

{
  // Timid + untrained: bravery 0.1 -> ability 0.05 < MIN_SKILL_TO_HUNT
  const state = makeState();
  const dwarf = makeDwarf(4, 20, 20, 'Meng', { bravery: 0.1 });
  dwarf.hunger = 75;
  state.dwarves = [dwarf];
  state.animals = [createAnimal(22, 20, 'deer')];

  assert(getHuntingAbility(dwarf) < HUNTING_CONFIG.MIN_SKILL_TO_HUNT, 'timid untrained dwarf lacks hunting nerve');
  assert(!canHuntAt(dwarf, dwarf.x, dwarf.y, state), 'canHuntAt gates them out');
  decide(dwarf, state);
  assert(dwarf.currentTask?.type !== TASK_TYPE.HUNT, 'they never pick the HUNT task');
}

{
  // Visible real food outranks hunting
  const state = makeState();
  const dwarf = makeDwarf(5, 20, 20, 'Zon');
  dwarf.hunger = 75;
  state.dwarves = [dwarf];
  state.animals = [createAnimal(24, 20, 'deer')];
  state.foodSources = [createFoodSource(18, 20, 8)];

  decide(dwarf, state);
  assert(dwarf.currentTask?.type === TASK_TYPE.FORAGE, 'visible food still wins over hunting');
}

// ============================================================
// (b) fishing
// ============================================================
console.log('\n(b) fishing');

{
  // Hungry dwarf near a river, nothing to forage or hunt -> FISH task
  const state = makeState();
  const dwarf = makeDwarf(6, 20, 20, 'Litast');
  dwarf.hunger = 75;
  state.dwarves = [dwarf];
  for (let y = 15; y < 25; y++) setTileType(state, 26, y, 'river');

  decide(dwarf, state);
  assert(dwarf.currentTask?.type === TASK_TYPE.FISH, 'hungry dwarf near water picks FISH');
  const spot = dwarf.currentTask?.target;
  assert(spot && Math.abs(spot.x - 26) <= 1, 'target is a bank tile beside the river');

  // Walk until at a fishable spot, then a forced catch lands fish at the feet
  let catches = 0;
  const offCatch = on(EVENTS.FISHING_SUCCESS, () => catches++);
  let guard = 30;
  while (guard-- > 0 && !state.foodSources.some(f => f.subtype === 'fish')) {
    state.tick++; // movement budget replenishes per tick (canAffordMove)
    withRandom(0.0, () => decide(dwarf, state)); // random 0 -> guaranteed catch once casting
  }
  const fish = state.foodSources.find(f => f.subtype === 'fish');
  assert(!!fish, 'casting created a fish food source');
  assert(fish && Math.abs(fish.x - dwarf.x) <= 1 && Math.abs(fish.y - dwarf.y) <= 1, 'the catch lands at the dwarf\'s feet');
  assert(catches >= 1, 'FISHING_SUCCESS emitted');
  assert(dwarf.currentTask === null, 'fishing task ends after a catch');
  assert(dwarf.skills.find(s => s.name === 'fishing'), 'fishing skill seeded by practice');
  assert(state.log.some(e => /caught .*fish/.test(e.message)), 'catch logged for the event feed');
  offCatch();
}

{
  // Rain bonus: pick a roll that misses in clear skies but catches in rain
  const state = makeState();
  const dwarf = makeDwarf(7, 20, 20, 'Sibrek');
  setTileType(state, 21, 20, 'water_shallow');

  // proficiency = patience 0.5 * 0.5 = 0.25 -> catchProb 0.15 + 0.25*0.3 = 0.225
  // rain x1.2 -> 0.27; a 0.25 roll separates the two
  state.weather = { getWeatherAt: () => ({ rain: 0, type: null, dominant: 0 }) };
  const dry = withRandom(0.25, () => attemptFish(dwarf, state));
  assert(dry.success === false, 'borderline cast misses in clear weather');

  state.weather = { getWeatherAt: () => ({ rain: 0.5, type: 'rain', dominant: 0.5 }) };
  const wet = withRandom(0.25, () => attemptFish(dwarf, state));
  assert(wet.success === true, 'same cast catches in the rain (live weather bonus)');
}

{
  // Impatient + untrained: patience 0.1 -> ability 0.05 < MIN_SKILL_TO_FISH
  const state = makeState();
  const dwarf = makeDwarf(8, 20, 20, 'Kogan', { patience: 0.1 });
  setTileType(state, 21, 20, 'river');

  assert(getFishingAbility(dwarf) < FISHING_CONFIG.MIN_SKILL_TO_FISH, 'impatient untrained dwarf lacks fishing patience');
  assert(!canFishAt(dwarf, dwarf.x, dwarf.y, state), 'canFishAt gates them out');
}

// ============================================================
// (c) water adjacency reads real tiles
// ============================================================
console.log('\n(c) water adjacency');

{
  assert(isWaterTile('water_shallow') && isWaterTile('water_deep') && isWaterTile('river'), 'all real water tile ids recognized');
  assert(!isWaterTile('water') && !isWaterTile('grass'), "nonexistent 'water' id and land rejected");

  const state = makeState();
  const dwarf = makeDwarf(9, 20, 20, 'Rith');
  assert(!canFishAt(dwarf, dwarf.x, dwarf.y, state), 'no water adjacent -> cannot fish');
  setTileType(state, 20, 21, 'water_deep');
  assert(canFishAt(dwarf, dwarf.x, dwarf.y, state), 'water_deep adjacent -> can fish (arg-order bug dead)');
}

// ============================================================
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
