// Phase 4 smoke test — living world: animal ecosystem, intentions,
// landmarks + day/night rhythm, history-aware prompts, scenario→biome chain
// Run with: node tests/test-phase4-smoke.js
//
// Proves:
//  (a) the animal ecosystem is wired: biome spawning, tick integration,
//      predator/prey decisions, prey fear, carcasses on death
//  (b) landmarks are extracted and named deterministically from tile clusters
//  (c) thoughts become destinations (parseIntent), dwarfAI pursues them, and
//      arrival emits INTENTION_FULFILLED
//  (d) dusk pulls dwarves to gather, night puts them to sleep (energy regen)
//  (e) visitor chat prompts carry shared race history (P8) and the biome
//      prompt carries the scenario (P9)

// --- Fake LLM endpoint (imports pull in llmClient) ---
process.env.VITE_VLLM_URL = 'http://127.0.0.1:9/v1/chat/completions'; // never reached
process.env.VITE_VLLM_MODEL = 'fake-model';
let lastFetchBody = null;
globalThis.fetch = async (url, opts) => {
  lastFetchBody = opts?.body ? JSON.parse(opts.body) : null;
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content: 'canned' } }] }),
    text: async () => '',
  };
};

const { createWorldState } = await import('../src/state/store.js');
const { tick } = await import('../src/sim/world.js');
const { spawnAnimalsForBiome, createAnimal, MAX_ANIMALS, updateAnimalFear } = await import('../src/sim/animals.js');
const { decideAnimal, ANIMAL_STATE } = await import('../src/ai/animalAI.js');
const { perceiveWorld } = await import('../src/sim/perception.js');
const { extractLandmarks, findNearestLandmark, findLandmarkInText } = await import('../src/sim/landmarks.js');
const { parseIntent } = await import('../src/ai/intentions.js');
const { decide, AI_STATE } = await import('../src/ai/dwarfAI.js');
const { TASK_TYPE } = await import('../src/sim/tasks.js');
const { getCalendar, TICKS_PER_DAY } = await import('../src/sim/clock.js');
const { on, EVENTS, clear: clearEvents } = await import('../src/events/eventBus.js');
const { buildEntitySystemPrompt } = await import('../src/llm/prompts/entityChat.js');
const { generateWorldHistory } = await import('../src/sim/history.js');
const { generateBiome, setBiomeLLMAvailable } = await import('../src/llm/biomeGenerator.js');
const { buildLocalContext } = await import('../src/llm/worldContext.js');
const { generateConversationSpeech } = await import('../src/ai/llmClient.js');

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

/** Walkable grass world with a river strip and one cave pocket */
function makeState(width = 40, height = 30) {
  const state = createWorldState(width, height);
  state.map.tiles = Array.from({ length: width * height }, () => ({ type: 'grass' }));
  for (let y = 0; y < height; y++) state.map.tiles[y * width + 20] = { type: 'river' }; // vertical river at x=20
  state.map.tiles[5 * width + 5] = { type: 'cave_floor' };
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
    energy: 100,
    personality: { bravery: 0.5 },
    skills: {},
    fulfillment: { social: 80, exploration: 80, creativity: 80, tranquility: 80 },
    relationships: {},
    memory: { locations: {}, shortTerm: [], visitedAreas: new Set(), craftedItems: [] },
  };
}

// ============================================================
// (a) animal ecosystem
// ============================================================
console.log('\n(a) animal ecosystem wiring');

assert(Array.isArray(createWorldState(10, 10).animals), 'createWorldState has animals[]');

const spawnState = makeState();
spawnState.map.biome = { climate: { avgTemperature: 0.5, avgMoisture: 0.7, avgElevation: 0.4 } };
const spawned = spawnAnimalsForBiome(spawnState);
assert(spawned.length > 0 && spawned.length <= MAX_ANIMALS, `biome spawn produced ${spawned.length} animals (cap ${MAX_ANIMALS})`);
assert(spawned.every(a => a.species && a.x >= 0 && a.x < 40 && a.y >= 0 && a.y < 30), 'all spawned animals are valid and in bounds');
assert(spawned.some(a => a.territoryMarker), 'herd members carry territory anchors');
assert(spawnState.animals === undefined || spawnState.animals.length === spawned.length, 'spawner registered animals on state');

// Full tick integration: 30 ticks with animals + dwarves run clean
const tickState = makeState();
tickState.dwarves = [makeDwarf(1, 10, 10, 'Urist')];
tickState.animals = [
  createAnimal(15, 15, 'deer', tickState),
  createAnimal(25, 15, 'wolf', tickState),
  createAnimal(8, 8, 'rabbit', tickState),
];
let tickError = null;
try {
  for (let i = 0; i < 30; i++) tick(tickState);
} catch (error) {
  tickError = error;
}
assert(!tickError, `30 world ticks with animals run clean${tickError ? ` (threw: ${tickError.message})` : ''}`);
assert(tickState.animals.every(a => a.x >= 0 && a.x < 40 && a.y >= 0 && a.y < 30), 'animals stay in bounds');
assert(tickState.animals.every(a => a.ageInTicks >= 30), 'animals age every tick');

// Hungry wolf hunts the deer next door
const huntState = makeState();
const wolf = createAnimal(10, 10, 'wolf', huntState);
const deer = createAnimal(13, 10, 'deer', huntState);
wolf.drives.hunger = 80;
huntState.animals = [wolf, deer];
huntState.dwarves = [];
huntState.tick = 10;
decideAnimal(wolf, huntState);
assert(wolf.state === ANIMAL_STATE.HUNTING && wolf.target?.id === deer.id, 'hungry wolf decides to hunt the nearby deer');

// The deer perceives the wolf as a predator, gains fear, and flees
perceiveWorld(deer, huntState);
assert(deer.recentlyPerceivedThreat?.entity?.id === wolf.id, 'deer perceives the wolf as a threat (predators list)');
updateAnimalFear(deer);
assert(deer.drives.fear > 60, `predator proximity raises fear (${deer.drives.fear.toFixed(0)})`);
decideAnimal(deer, huntState);
assert(deer.state === ANIMAL_STATE.FLEEING, 'frightened deer flees');

// Death leaves a carcass (forageable food) and an ANIMAL_DEATH event
const deathState = makeState();
deathState.dwarves = [];
const doomed = createAnimal(12, 12, 'deer', deathState);
deathState.animals = [doomed];
let deathEvent = null;
const unsub = on(EVENTS.ANIMAL_DEATH, payload => { deathEvent = payload; });
doomed.hp = 0;
const foodBefore = deathState.foodSources.length;
tick(deathState);
unsub();
assert(deathState.animals.length === 0, 'dead animal removed from the world');
assert(deathState.foodSources.length === foodBefore + 1, 'carcass became a food source');
assert(deathEvent?.animal?.id === doomed.id, 'ANIMAL_DEATH event emitted');

// ============================================================
// (b) landmarks
// ============================================================
console.log('\n(b) landmark extraction');

const lmState = makeState();
// Crystal cluster top-left, mushroom patch bottom-right
for (const [x, y] of [[3, 3], [4, 3], [3, 4], [4, 4]]) lmState.map.tiles[y * 40 + x] = { type: 'crystal' };
for (const [x, y] of [[33, 25], [34, 25], [35, 25], [33, 26], [34, 26]]) lmState.map.tiles[y * 40 + x] = { type: 'mushroom' };

const landmarks = extractLandmarks(lmState.map, 42);
assert(landmarks.length >= 3, `found ${landmarks.length} landmarks (crystal, mushroom, river)`);
const crystal = landmarks.find(l => l.type === 'crystal');
const mushroom = landmarks.find(l => l.type === 'mushroom');
assert(crystal && Math.abs(crystal.x - 3.5) <= 1 && Math.abs(crystal.y - 3.5) <= 1, `crystal landmark sits on its cluster (${crystal?.x},${crystal?.y})`);
assert(mushroom?.name && /^the /i.test(mushroom.name), `landmarks get evocative names ("${mushroom?.name}")`);

const again = extractLandmarks(lmState.map, 42);
assert(JSON.stringify(again) === JSON.stringify(landmarks), 'extraction is deterministic for the same seed');

lmState.landmarks = landmarks;
assert(findNearestLandmark(lmState, 4, 4)?.type === 'crystal', 'findNearestLandmark works');
assert(findLandmarkInText(lmState, `let's visit ${crystal.name.toUpperCase()}!`)?.type === 'crystal', 'landmark names resolve from free text (case-insensitive)');

// ============================================================
// (c) intentions: thoughts become destinations
// ============================================================
console.log('\n(c) intention layer');

const intState = makeState();
intState.tick = 100;
intState.landmarks = [{ name: 'the Crystal Hollow', type: 'crystal', x: 30, y: 20 }];
const thinker = makeDwarf(1, 5, 5, 'Urist');
const sigrun = makeDwarf(2, 35, 8, 'Sigrun Bronzehelm');
intState.dwarves = [thinker, sigrun];

const lmIntent = parseIntent('I should go see those crystals up close.', thinker, intState);
assert(lmIntent?.targetType === 'landmark' && lmIntent.x === 30 && lmIntent.y === 20, 'crystal thought resolves to the crystal landmark');
assert(lmIntent.expiresTick > intState.tick, 'intention carries an expiry');

thinker.memory.locations = { 'water_20_5': { x: 20, y: 5, type: 'water', lastSeen: 90 } };
const waterIntent = parseIntent('I need water soon.', thinker, intState);
assert(waterIntent?.targetType === 'memory' && waterIntent.x === 20, 'water thought resolves to remembered water');

const friendIntent = parseIntent('I miss Sigrun, I should find her.', thinker, intState);
assert(friendIntent?.targetType === 'dwarf' && friendIntent.x === sigrun.x, 'named-dwarf thought resolves to her position');

assert(parseIntent('Nothing but mud and toil today.', thinker, intState) === null, 'non-spatial thought yields no intention');
assert(parseIntent('I want to see the crystals.', makeDwarf(3, 30, 19, 'Near'), intState) === null, 'destinations underfoot are ignored');

// dwarfAI pursues the intention and arrival fires INTENTION_FULFILLED
const origRandom = Math.random;
Math.random = () => 0.5; // suppress stochastic branches

// The earlier tick loop may have left dig/build projects in the
// construction module's state — reset so they don't outbid the intention
const { initConstruction } = await import('../src/sim/construction.js');
initConstruction();

thinker.intention = lmIntent;
const pursuit = decide(thinker, intState);
assert(pursuit.state === AI_STATE.PURSUING_INTENTION, `dwarf pursues the intention (state: ${pursuit.state})`);
assert(thinker.currentTask?.type === TASK_TYPE.SCOUT, 'intention became a SCOUT task');

let fulfilled = null;
const unsubIntent = on(EVENTS.INTENTION_FULFILLED, payload => { fulfilled = payload; });
const arriver = makeDwarf(4, 29, 20, 'Dora'); // adjacent to the hollow
intState.dwarves.push(arriver);
arriver.intention = { ...lmIntent };
decide(arriver, intState);
unsubIntent();
assert(fulfilled?.dwarf?.id === arriver.id && fulfilled?.intention?.targetName === 'the Crystal Hollow', 'arrival emits INTENTION_FULFILLED');
assert(arriver.intention === null, 'fulfilled intention is cleared');

// ============================================================
// (d) day/night rhythm
// ============================================================
console.log('\n(d) dusk congregation and night sleep');

const dayState = makeState();
dayState.landmarks = [{ name: 'the River Bend', type: 'river', x: 20, y: 15 }];
const evening = makeDwarf(5, 10, 10, 'Vorin');
dayState.dwarves = [evening];

dayState.clock = getCalendar(Math.floor(TICKS_PER_DAY * 0.6)); // dusk
assert(dayState.clock.phase === 'dusk', 'clock says dusk');
const duskDecision = decide(evening, dayState);
assert(duskDecision.state === AI_STATE.GATHERING, `dusk pulls the dwarf to gather (state: ${duskDecision.state})`);
assert(evening.currentTask?.type === TASK_TYPE.GATHER, 'gather task targets the landmark');

dayState.clock = getCalendar(Math.floor(TICKS_PER_DAY * 0.8)); // night
assert(dayState.clock.phase === 'night', 'clock says night');
const tired = makeDwarf(6, 5, 5, 'Nessa'); // standing on the cave pocket
tired.energy = 40;
dayState.dwarves.push(tired);
const nightDecision = decide(tired, dayState);
assert(nightDecision.state === AI_STATE.SLEEPING, `night puts the tired dwarf to sleep (state: ${nightDecision.state})`);
assert(tired.energy > 40, `sleep restores energy (${tired.energy.toFixed(2)})`);

Math.random = origRandom;

// Wildlife shows up in the L2 local scan
const scanState = makeState();
const watcher = makeDwarf(7, 10, 10, 'Watcher');
scanState.dwarves = [watcher];
scanState.animals = [createAnimal(12, 10, 'wolf', scanState)];
const local = buildLocalContext(watcher, scanState);
assert(local.includes('a wolf prowling close by'), 'L2 local context notices the wolf');

// ============================================================
// (e) history-aware prompts (P8) + scenario→biome chain (P9)
// ============================================================
console.log('\n(e) prompt continuity');

const history = generateWorldHistory(777);
const goblin = {
  id: 50, type: 'goblin', race: 'goblin', role: 'merchant',
  name: 'Snag', generatedName: 'Snag', disposition: -10, state: 'trading',
};
const visitorPrompt = buildEntitySystemPrompt(goblin, 'visitor', { history });
assert(visitorPrompt.includes('## SHARED HISTORY'), 'visitor prompt has a shared-history section');
assert(/Your people are .* the dwarves/.test(visitorPrompt), 'shared history states the race stance');
assert(visitorPrompt.includes('You remember:'), 'shared history names actual historical events');

const noHistoryPrompt = buildEntitySystemPrompt(goblin, 'visitor', {});
assert(!noHistoryPrompt.includes('## SHARED HISTORY'), 'no history -> section gracefully omitted');

// P9: the biome prompt carries the scenario (captured via the fetch stub)
setBiomeLLMAvailable(true);
lastFetchBody = null;
await generateBiome(
  { avgTemperature: 0.5, avgMoisture: 0.5, avgElevation: 0.5 },
  { scenario: { title: 'The Long Thaw', description: 'Ice gives way to flood.' } }
);
const biomePrompt = lastFetchBody?.messages?.map(m => m.content).join('\n') || '';
assert(biomePrompt.includes('The Long Thaw'), 'biome prompt includes the scenario title');
assert(biomePrompt.includes("fits this story's tone"), 'biome prompt asks for tonal continuity');

// P8: small talk gets a chronicle line ("talk of the camp")
lastFetchBody = null;
await generateConversationSpeech(
  makeDwarf(8, 0, 0, 'Talker'), makeDwarf(9, 1, 0, 'Listener'), 'hmm',
  { isResponse: false, topicHint: 'Day 3: Wolves circled the camp at dusk.' }
);
const speechPrompt = lastFetchBody?.messages?.map(m => m.content).join('\n') || '';
assert(speechPrompt.includes('Talk of the camp') && speechPrompt.includes('Wolves circled'), 'small talk carries the chronicle topic hint');

// --- summary ---
clearEvents();
console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
