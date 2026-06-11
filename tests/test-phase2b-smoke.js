// Phase 2b smoke test — day/season clock, narrator → chronicle pipeline
// Run with: node tests/test-phase2b-smoke.js
//
// Proves:
//  (a) getCalendar derives days/seasons/phases from ticks (1200-tick days,
//      30-day seasons) and is pure/deterministic
//  (b) three simulated day boundaries with mock events ⇒ chronicle.recent
//      accumulates, overflows past 8 lines, and folds the oldest 4 into
//      chronicle.saga via one LLM summarization call
//  (c) the chronicle (headline + saga + recent) renders into assembleContext's
//      system message after the L0 lore, and trims before L0 under budget
//  (d) LLM offline ⇒ folding keeps raw lines and nothing throws

// --- Fake LLM endpoint ---
process.env.VITE_VLLM_URL = 'http://127.0.0.1:9/v1/chat/completions'; // never actually reached
process.env.VITE_VLLM_MODEL = 'fake-model';

let llmOffline = false;
globalThis.fetch = async (url, init) => {
  if (llmOffline) throw new Error('connection refused (simulated offline)');
  const body = JSON.parse(init.body);
  const system = body.messages?.[0]?.role === 'system' ? body.messages[0].content : '';
  // Saga folding asks for 2 sentences of prose; the narrator expects a JSON array
  const content = system.includes('compress')
    ? 'The fortress endured loss and triumph. Names were made that day.'
    : JSON.stringify(['Narrated event one.', 'Narrated event two.', 'Narrated event three.', 'Narrated event four.']);
  return {
    ok: true,
    json: async () => ({ choices: [{ message: { content } }] }),
    text: async () => '',
  };
};

const { getCalendar, getSeasonStage, TICKS_PER_DAY, DAYS_PER_SEASON } = await import('../src/sim/clock.js');
const { queueEventForNarration, processEndOfDay, clearPending } = await import('../src/llm/eventNarrator.js');
const { buildWorldLore, invalidateWorldLore, updateChronicle, buildChronicle, assembleContext } =
  await import('../src/llm/worldContext.js');
const { createWorldState, createChronicle } = await import('../src/state/store.js');

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

// --- (a) clock math ---
console.log('\n(a) day/season clock');

assert(getCalendar(0).day === 1 && getCalendar(0).season === 'spring', 'tick 0 -> day 1, spring');
assert(getCalendar(TICKS_PER_DAY - 1).day === 1, 'last tick of day 1 is still day 1');
assert(getCalendar(TICKS_PER_DAY).day === 2, 'tick 1200 -> day 2');
assert(getCalendar(DAYS_PER_SEASON * TICKS_PER_DAY).season === 'summer', 'day 31 -> summer');
assert(getCalendar(4 * DAYS_PER_SEASON * TICKS_PER_DAY).season === 'spring', 'year wraps back to spring');
assert(getCalendar(0).phase === 'dawn', 'day starts at dawn');
assert(getCalendar(TICKS_PER_DAY - 1).phase === 'night', 'day ends at night');
assert(getSeasonStage(2) === 'early' && getSeasonStage(15) === 'mid' && getSeasonStage(28) === 'late', 'season stages early/mid/late');
const calA = getCalendar(54321);
const calB = getCalendar(54321);
assert(JSON.stringify(calA) === JSON.stringify(calB), 'getCalendar is deterministic');

// --- (b) three day boundaries: accumulate then fold ---
console.log('\n(b) chronicle accumulates across day boundaries and folds');

clearPending();
const state = createWorldState(20, 10);
state.map.biome = {
  name: 'Mossy Lowland Fen',
  description: 'Peat pools under a grey sky.',
  climate: { avgTemperature: 0.5, avgMoisture: 0.9, avgElevation: 0.2 },
  resources: ['peat', 'reeds'],
};
const scenario = { title: 'The Sunken Hold', description: 'Reclaim the drowned halls.' };
invalidateWorldLore();
buildWorldLore(state, scenario);

// Simulate three day boundaries, four notable events per day
const DAY_EVENTS = [
  ['Urist died (starvation).', 'A lone goblin led by Snag arrived.', 'The Workshop was completed.', 'Heavy rain swept over the land.'],
  ['Sigrun attacked Snag.', 'A band of 3 elves arrived.', 'The Well was completed, built by Sigrun.', 'Drifting fog swept over the land.'],
  ['Snag perished.', 'The Granary was completed.', 'Heavy snow swept over the land.', 'Dolin attacked a wolf.'],
];

for (let i = 0; i < DAY_EVENTS.length; i++) {
  // Advance to the next day boundary (days 2, 3, 4)
  state.tick = (i + 1) * TICKS_PER_DAY;
  state.clock = getCalendar(state.tick);
  for (const message of DAY_EVENTS[i]) {
    queueEventForNarration({ tick: state.tick - 10, message, type: 'misc' });
  }
  await processEndOfDay(state);
  await updateChronicle(state);
}

assert(state.narratedLog.length === 12, `narrator stored all 12 day-events (got ${state.narratedLog.length})`);
assert(state.narratedLog.every(e => e.narrated), 'every stored event carries narrated text');
assert(state.chronicle.recent.length === 8, `recent capped at 8 after overflow (got ${state.chronicle.recent.length})`);
assert(state.chronicle.saga.length > 0, 'overflow folded into a non-empty saga');
assert(state.chronicle.saga.includes('fortress endured'), 'saga came from the LLM summarization call');
assert(state.chronicle.recent.every(l => /^Day \d+:/.test(l)), 'recent lines are day-stamped');
assert(state.chronicle.headline.includes(`Day ${state.clock.day}`), 'headline reflects the current day');

// Stable within a day: re-render without a new boundary changes nothing
const renderA = buildChronicle(state);
const renderB = buildChronicle(state);
assert(renderA === renderB && renderA.length > 0, 'chronicle render is byte-stable within a day');

// --- (c) chronicle appears in assembled system prompts ---
console.log('\n(c) chronicle renders into the system message');

const ctx = assembleContext({ entity: null, state, scenario, turn: 'What has happened lately?', budget: 1200 });
assert(ctx.system.includes('Mossy Lowland Fen'), 'system carries the L0 lore');
assert(ctx.system.includes(state.chronicle.headline), 'system carries the L1 headline');
assert(ctx.system.includes('The saga so far:'), 'system carries the folded saga');
assert(ctx.system.includes(state.chronicle.recent[0].slice(0, 20)), 'system carries recent day-events');
assert(ctx.user.includes('What has happened lately?'), 'user carries the L3 turn');

// Budget pressure trims L1 but never L0
const lore = (await import('../src/llm/worldContext.js')).getWorldLore();
const tight = assembleContext({ entity: null, state, scenario, turn: 'hi', budget: 10 });
assert(tight.system.includes(lore), 'L0 survives an impossible budget');
assert(tight.system.length < ctx.system.length, 'L1 was trimmed under budget pressure');

// --- (d) offline degradation ---
console.log('\n(d) LLM offline -> raw lines kept, nothing throws');

llmOffline = true;
const offlineState = createWorldState(20, 10);
offlineState.chronicle = createChronicle();
offlineState.tick = 5 * TICKS_PER_DAY;
offlineState.clock = getCalendar(offlineState.tick);
// Pre-load 12 narrated lines so updateChronicle must fold while offline
offlineState.narratedLog = Array.from({ length: 12 }, (_, i) => ({
  day: 5,
  tick: offlineState.tick - 100 + i,
  raw: `Offline event ${i + 1}.`,
  narrated: `Offline narration ${i + 1}.`,
}));

let threw = false;
try {
  await updateChronicle(offlineState);
} catch {
  threw = true;
}
assert(!threw, 'updateChronicle never throws while offline');
assert(offlineState.chronicle.recent.length === 8, 'offline fold still caps recent at 8');
assert(offlineState.chronicle.saga.includes('Offline narration 1.'), 'offline fold keeps raw lines verbatim in the saga');
llmOffline = false;

// --- summary ---
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
