// Phase 2a smoke test — transport system role, byte-stable L0 lore, lore-in-thoughts
// Run with: node tests/test-phase2a-smoke.js
//
// Proves:
//  (a) generate() emits a real messages [{system},{user}] array when
//      options.system is set (and a single user message when absent),
//      with explicit Ollama options.num_ctx
//  (b) the same world state produces byte-identical L0 across two
//      buildWorldLore calls (including after invalidation/rebuild)
//  (c) a thought prompt now carries biome + scenario lore as the system message

// --- Fake LLM endpoint: capture request bodies, return a canned response ---
const capturedBodies = [];
process.env.VITE_VLLM_URL = 'http://127.0.0.1:9/v1/chat/completions'; // never actually reached
process.env.VITE_VLLM_MODEL = 'fake-model';

globalThis.fetch = async (url, init) => {
  capturedBodies.push(JSON.parse(init.body));
  return {
    ok: true,
    json: async () => ({
      choices: [{ message: { content: 'A canned response.' } }],
    }),
    text: async () => '',
  };
};

const { generate, generateEventThought } = await import('../src/ai/llmClient.js');
const { buildWorldLore, getWorldLore, invalidateWorldLore, assembleContext } =
  await import('../src/llm/worldContext.js');
const { generateWorldHistory } = await import('../src/sim/history.js');
const { estimateTokens } = await import('../src/utils/gameContextCompressor.js');

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

// --- (a) messages array carries a system role ---
console.log('\n(a) transport: real system/user roles');

await generate('hello user', { system: 'hello system' });
let body = capturedBodies.at(-1);
assert(Array.isArray(body.messages) && body.messages.length === 2, 'messages is a 2-element array');
assert(body.messages[0].role === 'system' && body.messages[0].content === 'hello system', 'first message is the system role');
assert(body.messages[1].role === 'user' && body.messages[1].content === 'hello user', 'second message is the user role');
assert(typeof body.options?.num_ctx === 'number' && body.options.num_ctx >= 2048, `explicit options.num_ctx set (${body.options?.num_ctx})`);

await generate('plain prompt', {});
body = capturedBodies.at(-1);
assert(body.messages.length === 1 && body.messages[0].role === 'user', 'absent system -> single user message (backward compatible)');

// --- (b) byte-stable L0 lore ---
console.log('\n(b) byte-stable L0 world lore');

const scenario = {
  title: 'The Frozen Compact',
  description: 'Seven dwarves carve a refuge beneath the glacier.',
  victory_conditions: ['Survive the first winter', 'Forge an heirloom'],
};
const state = {
  map: {
    biome: {
      name: 'Frozen Volcanic Highlands',
      description: 'Ash-dusted snowfields over warm stone.',
      climate: { avgTemperature: 0.2, avgMoisture: 0.5, avgElevation: 0.8 },
      resources: ['obsidian', 'sulfur', 'ice'],
    },
  },
  history: generateWorldHistory(42),
};

invalidateWorldLore();
const loreA = buildWorldLore(state, scenario);
const loreB = buildWorldLore(state, scenario); // cached path
assert(loreA.length > 0, 'lore is non-empty');
assert(loreA === loreB, 'two buildWorldLore calls -> byte-identical (cache)');

invalidateWorldLore();
const loreC = buildWorldLore(state, scenario); // full rebuild from same state
assert(loreA === loreC, 'rebuild from same world state -> byte-identical (deterministic)');
assert(getWorldLore() === loreA, 'getWorldLore() returns the cached string');
assert(estimateTokens(loreA) <= 350, `L0 within 350-token budget (${estimateTokens(loreA)} tokens)`);
assert(loreA.includes('Frozen Volcanic Highlands'), 'lore contains the biome name');
assert(loreA.includes('The Frozen Compact'), 'lore contains the scenario title');
assert(/Dwarves are .* the/.test(loreA), 'lore contains race relations from history summary');

// assembleContext skeleton: system carries L0, never trimmed
const ctx = assembleContext({ entity: null, state, scenario, turn: 'What do you see?', budget: 900 });
assert(ctx.system.includes(loreA), 'assembleContext system contains the full L0');
assert(ctx.user.includes('What do you see?'), 'assembleContext user contains the L3 turn');
const tinyCtx = assembleContext({ entity: null, state, scenario, turn: 'hi', budget: 10 });
assert(tinyCtx.system.includes(loreA), 'L0 survives even an impossible budget (never trimmed)');

// offline / empty world degrades gracefully
invalidateWorldLore();
const emptyLore = buildWorldLore({}, null);
assert(emptyLore === '', 'empty world -> empty lore, nothing throws');
invalidateWorldLore();
buildWorldLore(state, scenario); // restore for (c)

// --- (c) thought prompts carry biome + scenario lore ---
console.log('\n(c) thought prompt carries world lore as system message');

const dwarf = {
  id: 1,
  generatedName: 'Sigrun Foehammer',
  personality: { curiosity: 0.9 },
  mood: 60,
  hunger: 20,
};
await generateEventThought(dwarf, 'observation', {
  nearbyDwarves: [],
  tileName: 'a grassy meadow',
  worldCtx: getWorldLore(),
});
body = capturedBodies.at(-1);
assert(body.messages[0].role === 'system', 'thought request has a system message');
assert(body.messages[0].content.includes('Frozen Volcanic Highlands'), 'thought system message contains the biome');
assert(body.messages[0].content.includes('The Frozen Compact'), 'thought system message contains the scenario');
assert(body.messages[1].role === 'user' && body.messages[1].content.includes('Sigrun Foehammer'), 'thought user message still carries the dwarf turn');

// --- summary ---
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
