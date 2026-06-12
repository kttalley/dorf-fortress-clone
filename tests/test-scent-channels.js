// Multi-channel scent map smoke test (audit WALK R7 / SYNTHESIS §3.3)
// Run with: node tests/test-scent-channels.js
//
// Proves:
//  (a) channel mechanics: channels are independent, food stays the default,
//      per-channel decay rates differ, the water field never decays, and
//      seedWaterScent builds a gradient around water tiles
//  (b) wildlife unease: skittish animals drift away from dwarf-presence and
//      danger scent, predators ignore it, and directed wandering actually
//      walks the flee target
//  (c) habitat homing: a stranded frog follows the water field home and
//      stays put once it is wet
//  (d) raiders track scent: beyond line of sight they follow the presence
//      gradient instead of reading minds; with no trail they just wander
//  (e) prompts smell it too: buildLocalContext reports signs of recent
//      violence where the danger field is strong

// --- Fake LLM endpoint (worldContext imports pull in llmClient) ---
process.env.VITE_VLLM_URL = 'http://127.0.0.1:9/v1/chat/completions'; // never reached
process.env.VITE_VLLM_MODEL = 'fake-model';
globalThis.fetch = async () => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: 'canned' } }] }),
  text: async () => '',
});

const {
  initScentMap, emitScent, getScent, getScentGradient, decayScents,
  seedWaterScent, SCENT_CHANNEL,
} = await import('../src/sim/movement.js');
const { createAnimal } = await import('../src/sim/animals.js');
const { decideAnimal, actAnimal, ANIMAL_STATE } = await import('../src/ai/animalAI.js');
const { createVisitor } = await import('../src/sim/visitors.js');
const { VISITOR_ROLE, RACE } = await import('../src/sim/races.js');
const { decideVisitor } = await import('../src/ai/visitorAI.js');
const { buildLocalContext } = await import('../src/llm/worldContext.js');
const { createWorldState } = await import('../src/state/store.js');
const { distance } = await import('../src/sim/entities.js');

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
  return state;
}

// ============================================================
// (a) channel mechanics
// ============================================================
console.log('\n(a) channel mechanics');

initScentMap(60, 40);
emitScent(5, 5, 2.0); // default channel
assert(getScent(5, 5) > 0 && getScent(5, 5, SCENT_CHANNEL.FOOD) === getScent(5, 5),
  'default channel is food (back-compat)');
assert(getScent(5, 5, SCENT_CHANNEL.PRESENCE) === 0 && getScent(5, 5, SCENT_CHANNEL.DANGER) === 0,
  'food emission does not bleed into other channels');

emitScent(10, 10, 2.0, 5, SCENT_CHANNEL.PRESENCE);
emitScent(10, 10, 2.0, 5, SCENT_CHANNEL.DANGER);
for (let i = 0; i < 30; i++) decayScents();
const presenceLeft = getScent(10, 10, SCENT_CHANNEL.PRESENCE);
const dangerLeft = getScent(10, 10, SCENT_CHANNEL.DANGER);
assert(presenceLeft < dangerLeft && dangerLeft > 1.5,
  `presence fades faster than danger (${presenceLeft.toFixed(2)} < ${dangerLeft.toFixed(2)})`);

const state = makeState();
state.map.tiles[10 * 60 + 20] = { type: 'river' }; // water at (20,10)
initScentMap(60, 40);
seedWaterScent(state);
const waterBefore = getScent(18, 10, SCENT_CHANNEL.WATER);
for (let i = 0; i < 50; i++) decayScents();
assert(waterBefore > 0 && getScent(18, 10, SCENT_CHANNEL.WATER) === waterBefore,
  'water field is seeded near water and never decays');
assert(getScent(50, 30, SCENT_CHANNEL.WATER) === 0, 'water field is zero far from water');

// ============================================================
// (b) wildlife unease
// ============================================================
console.log('\n(b) wildlife unease');

initScentMap(60, 40);
emitScent(13, 10, 4.0, 5, SCENT_CHANNEL.PRESENCE); // camp bustle east of the deer

const deer = createAnimal(10, 10, 'deer');
decideAnimal(deer, state);
assert(deer.state === ANIMAL_STATE.WANDERING && deer.target && deer.target.x < 10,
  `deer drifts away from presence (target x=${deer.target?.x} < 10)`);

const calmDeer = createAnimal(40, 30, 'deer');
decideAnimal(calmDeer, state);
assert(calmDeer.state === ANIMAL_STATE.IDLE, 'deer in clean air stays calm');

const wolf = createAnimal(10, 10, 'wolf');
decideAnimal(wolf, state);
assert(wolf.state !== ANIMAL_STATE.WANDERING || !wolf.target,
  'wolf does not spook at dwarf presence');

// Directed wandering: the flee target is actually walked
const walker = createAnimal(10, 10, 'deer');
walker.state = ANIMAL_STATE.WANDERING;
walker.target = { x: 4, y: 10 };
const startDist = distance(walker, walker.target);
for (let i = 0; i < 12 && walker.target; i++) {
  state.tick = i + 1; // movement budget accrues per tick (canAffordMove)
  actAnimal(walker, state);
}
const endDist = walker.target ? distance(walker, walker.target) : 0;
assert(endDist < startDist, `directed wandering closes on target (${startDist} -> ${endDist})`);

// ============================================================
// (c) habitat homing (frog follows the water field)
// ============================================================
console.log('\n(c) habitat homing');

initScentMap(60, 40);
seedWaterScent(state); // river at (20,10)

const frog = createAnimal(14, 10, 'frog');
decideAnimal(frog, state);
assert(frog.state === ANIMAL_STATE.WANDERING && frog.target && frog.target.x > 14,
  `stranded frog heads for water (target x=${frog.target?.x} > 14)`);

const wetFrog = createAnimal(20, 10, 'frog'); // sitting on the river tile
decideAnimal(wetFrog, state);
assert(wetFrog.state === ANIMAL_STATE.IDLE, 'frog already on water stays put');

// ============================================================
// (d) raiders track presence scent
// ============================================================
console.log('\n(d) raider scent tracking');

initScentMap(60, 40);
const raidState = makeState();
raidState.dwarves = [{ id: 1, x: 55, y: 38, type: 'dwarf', name: 'Urist', hp: 10, maxHp: 10, state: 'idle' }];

// Stale trail east of the raider; the dwarf itself is far out of sight
emitScent(26, 20, 3.0, 5, SCENT_CHANNEL.PRESENCE);

const raider = createVisitor(21, 20, RACE.GOBLIN, VISITOR_ROLE.RAIDER, {});
const decision = decideVisitor(raider, raidState);
assert(decision.state === 'raiding' && decision.target && decision.target.x > 21,
  `blind raider follows the trail east (target x=${decision.target?.x} > 21)`);

initScentMap(60, 40); // wipe the trail
const lostRaider = createVisitor(21, 20, RACE.GOBLIN, VISITOR_ROLE.RAIDER, {});
const lostDecision = decideVisitor(lostRaider, raidState);
assert(lostDecision.state === 'raiding' && lostDecision.target === null,
  'no scent, no sight -> raider wanders');

raidState.dwarves[0].x = 25;
raidState.dwarves[0].y = 20;
const closeRaider = createVisitor(21, 20, RACE.GOBLIN, VISITOR_ROLE.RAIDER, {});
const closeDecision = decideVisitor(closeRaider, raidState);
assert(closeDecision.target && closeDecision.target.x === 25 && closeDecision.target.y === 20,
  'dwarf within sight -> raider targets it directly');

// ============================================================
// (e) prompts smell the danger field
// ============================================================
console.log('\n(e) local context violence sensor');

initScentMap(60, 40);
const senseState = makeState();
const urist = {
  id: 1, x: 30, y: 20, type: 'dwarf', name: 'Urist', generatedName: 'Urist',
  state: 'idle', hp: 10, maxHp: 10,
  memory: { locations: {}, shortTerm: [], visitedAreas: new Set(), craftedItems: [] },
};
senseState.dwarves = [urist];

const cleanLocal = buildLocalContext(urist, senseState);
assert(cleanLocal.length > 0 && !/violen/i.test(cleanLocal), 'clean tile -> no violence line');

emitScent(30, 20, 3.0, 7, SCENT_CHANNEL.DANGER);
const taintedLocal = buildLocalContext(urist, senseState);
assert(/signs of recent violence/i.test(taintedLocal),
  'strong danger scent -> "signs of recent violence" line');

emitScent(30, 20, -3.0, 7, SCENT_CHANNEL.DANGER); // cancel it back out
emitScent(30, 20, 0.6, 7, SCENT_CHANNEL.DANGER);  // faint residue
const faintLocal = buildLocalContext(urist, senseState);
assert(/faint unease/i.test(faintLocal), 'faint danger scent -> faint-unease line');

// ============================================================
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
