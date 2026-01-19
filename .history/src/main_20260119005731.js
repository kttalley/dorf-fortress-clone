/**
 * Main entry point for v0.2
 * Emergent dwarf simulation with LLM-driven thoughts and social interactions
 */

import { createWorldState, addLog } from './state/store.js';
import { createDwarf, createFoodSource, resetIds, getDominantTraits, getDisplayName } from './sim/entities.js';
import { generateBiomeMap, generateMixedMap, generateCaveMap, findWalkablePosition } from './map/map.js';
import { tick } from './sim/world.js';
import { createRenderer, updateStatus, buildRenderEntities } from './ui/renderer.js';
import { renderLog } from './ui/log.js';
import { createCursor } from './ui/cursor.js';
import { createStatPanel } from './ui/statPanel.js';
import { initThoughtSystem, stopThoughtSystem, getThoughtStatus } from './ai/thoughts.js';
import { initSpeechBubbles, showSpeech, updateBubblePositions, injectBubbleStyles, initSidebarThoughts, updateSidebarThoughts } from './ui/speechBubble.js';
import { checkConnection } from './ai/llmClient.js';
import { initializeLLM } from './llm/nameGenerator.js';
import { generateNameBioLocal } from './llm/fallbacks.js';
import { waitForBatchNameGeneration } from './llm/nameGenerationEvents.js';
import { on, EVENTS } from './events/eventBus.js';
import { initConversationToast } from './ui/conversationToast.js';

// Map configuration
const MAP_WIDTH = 64;
const MAP_HEIGHT = 24;
const INITIAL_DWARVES = 7;
const INITIAL_FOOD_SOURCES = 15;
const SPEED_LEVELS = [250, 150, 80, 40];  // ms per tick (slower for watching interactions)
const MAP_MODES = ['biome', 'mixed', 'cave'];

let currentMapMode = 1;
let tickInterval = SPEED_LEVELS[0];
let speedIndex = 0;
let running = true;
let loopId = null;
let renderer = null;
let cursor = null;
let statPanel = null;
let llmConnected = false;

// Create world state
const state = createWorldState(MAP_WIDTH, MAP_HEIGHT);

/**
 * Check if a tile type is walkable
 */
function isWalkableTile(type) {
  const walkable = [
    'grass', 'tall_grass', 'dirt', 'forest_floor', 'cave_floor',
    'river_bank', 'sand', 'mountain_slope', 'marsh', 'moss',
    'shrub', 'flower', 'mushroom', 'berry_bush', 'food_plant',
    'rocky_ground', 'snow', 'mud', 'crystal'
  ];
  return walkable.includes(type);
}

/**
 * Handle dwarf thought event (from LLM system)
 */
function handleDwarfThought(dwarf, thought) {
  // Thoughts only appear in sidebar panel
}

/**
 * Handle dwarf speech event (from LLM system)
 */
function handleDwarfSpeech(speaker, listener, text) {
  showSpeech(speaker, listener, text);
  addLog(state, `${speaker.name} to ${listener.name}: "${text}"`);
}

/**
 * Generate a new world based on current map mode
 * Ensures dwarves receive LLM names before logging arrivals
 */
export async function regenerateWorld() {
  resetIds();

  const mapSeed = Date.now();
  const mode = MAP_MODES[currentMapMode];

  switch (mode) {
    case 'biome':
      state.map = generateBiomeMap(MAP_WIDTH, MAP_HEIGHT, {
        mapSeed,
        elevationScale: 0.02,
        moistureScale: 0.025,
        numRivers: 4,
      });
      addLog(state, 'A vast wilderness stretches before us.');
      break;
    case 'mixed':
      state.map = generateMixedMap(MAP_WIDTH, MAP_HEIGHT, {
        mapSeed,
        caveDensity: 0.48,
        surfaceChance: 0.35,
        numRivers: 2,
      });
      addLog(state, 'Caverns open to the sky above.');
      break;
    case 'cave':
    default:
      state.map = generateCaveMap(MAP_WIDTH, MAP_HEIGHT, {
        wallProbability: 0.44,
        smoothingPasses: 5,
        mushroomDensity: 0.02,
        waterPools: 4,
        connectCaves: true,
      });
      addLog(state, 'Deep underground, a new home awaits.');
      break;
  }

  state.dwarves = [];
  state.foodSources = [];
  state.log = state.log.slice(-3);
  state.tick = 0;

  const centerPos = findWalkablePosition(state.map);
  if (!centerPos) return;

  // Spawn dwarves with placeholder names
  for (let i = 0; i < INITIAL_DWARVES; i++) {
    let pos = null;
    for (let attempt = 0; attempt < 50; attempt++) {
      const testX = centerPos.x + Math.floor(Math.random() * 20) - 10;
      const testY = centerPos.y + Math.floor(Math.random() * 20) - 10;
      if (testX >= 0 && testX < MAP_WIDTH && testY >= 0 && testY < MAP_HEIGHT) {
        const tile = state.map.tiles[testY * MAP_WIDTH + testX];
        if (tile && isWalkableTile(tile.type)) {
          pos = { x: testX, y: testY };
          break;
        }
      }
    }
    if (!pos) pos = findWalkablePosition(state.map);
    if (pos) {
      const dwarf = createDwarf(pos.x, pos.y);
      dwarf.generatedName = '...'; // placeholder until LLM resolves
      dwarf.generatedBio = '';
      state.dwarves.push(dwarf);
    }
  }

  // Spawn food sources
  for (let i = 0; i < INITIAL_FOOD_SOURCES; i++) {
    const pos = findWalkablePosition(state.map);
    if (pos) {
      state.foodSources.push(createFoodSource(pos.x, pos.y, 8 + Math.floor(Math.random() * 6)));
    }
  }

  // Reinitialize thought system
  stopThoughtSystem();
  initThoughtSystem(state, {
    onThought: handleDwarfThought,
    onSpeech: handleDwarfSpeech,
    onSidebarUpdate: updateSidebarThoughts,
  });

  // === NAME GENERATION ===
  try {
    await waitForBatchNameGeneration(state.dwarves, 30000);
    state.dwarves.forEach(dwarf => {
      if (!dwarf.generatedName || dwarf.generatedName === '...') {
        const local = generateNameBioLocal(dwarf);
        dwarf.generatedName = local.name;
        dwarf.generatedBio = local.bio;
      }
      addLog(state, `${getDisplayName(dwarf)} arrives.`);
    });
    console.log('[Init] ✓ All dwarf names ready');
  } catch (error) {
    console.warn('[Init] Name generation timeout:', error.message);
    state.dwarves.forEach(dwarf => {
      if (!dwarf.generatedName || dwarf.generatedName === '...') {
        const local = generateNameBioLocal(dwarf);
        dwarf.generatedName = local.name;
        dwarf.generatedBio = local.bio;
      }
      addLog(state, `${getDisplayName(dwarf)} arrives.`);
    });
  }
  // Example after LLM batch returns
function applyGeneratedNames(state, dwarfNames) {
  // dwarfNames = [{id:0, name:"Kragnir", bio:"..."}, ...]
  for (const gen of dwarfNames) {
    const dwarf = state.dwarves.find(d => d.id === gen.id);
    if (dwarf) {
      dwarf.generatedName = gen.name;
      dwarf.generatedBio = gen.bio;
    }
  }
}
}

/**
 * Loading screen helpers
 */
function showLoadingScreen() {
  const screen = document.getElementById('loading-screen');
  if (screen) screen.classList.remove('hidden');
}
function hideLoadingScreen() {
  const screen = document.getElementById('loading-screen');
  if (screen) screen.classList.add('hidden');
}

/**
 * Main initialization
 */
async function init() {
  showLoadingScreen();

  const mapContainer = document.getElementById('map-display');
  const logContainer = document.getElementById('log-entries');
  if (!mapContainer) {
    console.error('Map container not found');
    hideLoadingScreen();
    return;
  }

  injectBubbleStyles();
  renderer = createRenderer(mapContainer, MAP_WIDTH, MAP_HEIGHT);
  statPanel = createStatPanel(mapContainer, renderer.el, MAP_WIDTH, MAP_HEIGHT);
  cursor = createCursor(
    renderer.el,
    MAP_WIDTH,
    MAP_HEIGHT,
    (x, y, inspection) => {},
    (x, y, inspection) => {
      if (inspection.hasDwarf || inspection.hasFood || inspection.tile) {
        if (statPanel.isVisible()) {
          const current = statPanel.getEntity();
          const clicked = inspection.entities[0]?.entity;
          if (current && clicked && current.id === clicked.id) {
            statPanel.hide();
          } else {
            statPanel.show(inspection);
          }
        } else {
          statPanel.show(inspection);
        }
      } else statPanel.hide();
    }
  );

  initSpeechBubbles(mapContainer, renderer.el);
  initSidebarThoughts();
  initConversationToast(document.body);

  await initializeLLM();
  await regenerateWorld();

  llmConnected = await checkConnection();
  addLog(state, llmConnected ? 'Connected to thought engine (LLM).' : 'Thought engine offline - using fallback thoughts.');

  hideLoadingScreen();
  renderFrame(renderer, logContainer);
  setupControls(renderer, logContainer);
  startLoop(renderer, logContainer);

  addLog(state, 'The dwarves begin to explore their surroundings...');
  renderLog(state.log, logContainer);
}

/**
 * Rendering & loop
 */
function renderFrame(renderer, logContainer) {
  const entities = buildRenderEntities(state);
  renderer.render(state.map, entities);
  updateStatus(state);
  updateBubblePositions();
  renderLog(state.log, logContainer);
  if (cursor) cursor.update(state);
  if (statPanel && statPanel.isVisible()) statPanel.update(state);
}

function gameLoop(renderer, logContainer) {
  if (!running) return;
  tick(state);

  if (state.dwarves.length === 0) {
    addLog(state, 'All dwarves have perished... A new group arrives!');
    resetIds();
    for (let i = 0; i < 3; i++) {
      const pos = findWalkablePosition(state.map);
      if (pos) {
        const dwarf = createDwarf(pos.x, pos.y);
        state.dwarves.push(dwarf);
        addLog(state, `${getDisplayName(dwarf)} arrives to continue the legacy.`);
      }
    }
    for (let i = 0; i < 5; i++) {
      const pos = findWalkablePosition(state.map);
      if (pos) state.foodSources.push(createFoodSource(pos.x, pos.y, 8));
    }
  }

  renderFrame(renderer, logContainer);
  if (running) loopId = setTimeout(() => gameLoop(renderer, logContainer), tickInterval);
}

function startLoop(renderer, logContainer) {
  if (loopId) clearTimeout(loopId);
  loopId = setTimeout(() => gameLoop(renderer, logContainer), tickInterval);
}

/**
 * Controls
 */
function setupControls(renderer, logContainer) {
  const pauseBtn = document.getElementById('btn-pause');
  const stepBtn = document.getElementById('btn-step');
  const speedBtn = document.getElementById('btn-speed');
  const regenBtn = document.getElementById('btn-regen');

  pauseBtn?.addEventListener('click', () => {
    running = !running;
    pauseBtn.textContent = running ? 'Pause' : 'Resume';
    if (running) startLoop(renderer, logContainer);
    else if (loopId) { clearTimeout(loopId); loopId = null; }
  });

  stepBtn?.addEventListener('click', () => {
    if (!running) {
      tick(state);
      renderFrame(renderer, logContainer);
    }
  });

  speedBtn?.addEventListener('click', () => {
    speedIndex = (speedIndex + 1) % SPEED_LEVELS.length;
    tickInterval = SPEED_LEVELS[speedIndex];
    speedBtn.textContent = `Speed: ${speedIndex + 1}x`;
  });

  regenBtn?.addEventListener('click', async () => {
    currentMapMode = (currentMapMode + 1) % MAP_MODES.length;
    if (loopId) { clearTimeout(loopId); loopId = null; }
    await regenerateWorld();
    regenBtn.textContent = `New: ${MAP_MODES[currentMapMode]}`;
    running = true;
    if (pauseBtn) pauseBtn.textContent = 'Pause';
    renderFrame(renderer, logContainer);
    startLoop(renderer, logContainer);
  });

  regenBtn.textContent = `New: ${MAP_MODES[(currentMapMode + 1) % MAP_MODES.length]}`;
}

// Wait for DOM
document.addEventListener('DOMContentLoaded', init);

// Export for debugging
window.gameState = state;
window.getThoughtStatus = getThoughtStatus;
