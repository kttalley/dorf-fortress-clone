/**
 * Main entry point for v0.2
 * Emergent dwarf simulation with LLM-driven thoughts and social interactions
 */

import { createWorldState, addLog } from './state/store.js';
import { createDwarf, createFoodSource, resetIds, getDisplayName } from './sim/entities.js';
import {
  generateBiomeMap,
  generateMixedMap,
  generateCaveMap,
  findWalkablePosition,
  addBiomeToMap,
  initBiomeGenerator
} from './map/map.js';
import { tick } from './sim/world.js';
import { createRenderer, updateStatus, buildRenderEntities } from './ui/renderer.js';
import { renderLog } from './ui/log.js';
import { createCursor } from './ui/cursor.js';
import { createStatPanel } from './ui/statPanel.js';
import { initThoughtSystem, stopThoughtSystem, getThoughtStatus } from './ai/thoughts.js';
import {
  initSpeechBubbles,
  showSpeech,
  updateBubblePositions,
  injectBubbleStyles,
  initSidebarThoughts,
  updateSidebarThoughts
} from './ui/speechBubble.js';
import { checkConnection } from './ai/llmClient.js';
import { initializeLLM } from './llm/nameGenerator.js';
import { waitForBatchNameGeneration } from './llm/nameGenerationEvents.js';
import { initConversationToast } from './ui/conversationToast.js';

// External forces
import { generateWorldHistory } from './sim/history.js';
import { resetSpawner } from './sim/visitorSpawner.js';

// ==============================
// Runtime map configuration
// ==============================
function getInitialMapConfig() {
  const width = window.innerWidth;
  const isTouch =
    window.matchMedia('(pointer: coarse)').matches ||
    'ontouchstart' in window;

  if (width >= 1200) {
    return {
      MAP_WIDTH: 128,
      MAP_HEIGHT: 48,
      INITIAL_DWARVES: 7,
      INITIAL_FOOD_SOURCES: 15,
      SPEED_LEVELS: [250, 150, 80, 40],
      defaultSpeedIndex: 0
    };
  }

  if (width >= 768) {
    return {
      MAP_WIDTH: 96,
      MAP_HEIGHT: 40,
      INITIAL_DWARVES: 6,
      INITIAL_FOOD_SOURCES: 12,
      SPEED_LEVELS: [300, 180, 100],
      defaultSpeedIndex: 0
    };
  }

  return {
    MAP_WIDTH: 64,
    MAP_HEIGHT: 32,
    INITIAL_DWARVES: 4,
    INITIAL_FOOD_SOURCES: 8,
    SPEED_LEVELS: isTouch ? [400, 250, 150] : [300, 180, 100],
    defaultSpeedIndex: 0
  };
}

// ==============================
// Mutable runtime globals
// ==============================
let MAP_WIDTH;
let MAP_HEIGHT;
let INITIAL_DWARVES;
let INITIAL_FOOD_SOURCES;
let SPEED_LEVELS;

let tickInterval;
let speedIndex = 0;
let running = true;
let loopId = null;

let renderer = null;
let cursor = null;
let statPanel = null;
let llmConnected = false;

// Map generation modes
const MAP_MODES = ['biome', 'mixed', 'cave'];
let currentMapMode = 1;

// World state (created AFTER config)
let state = null;

// ==============================
// World generation
// ==============================
async function regenerateWorld() {
  resetIds();

  const mapSeed = Date.now();
  const mode = MAP_MODES[currentMapMode];

  switch (mode) {
    case 'biome':
      state.map = generateBiomeMap(MAP_WIDTH, MAP_HEIGHT, {
        mapSeed,
        elevationScale: 0.02,
        moistureScale: 0.025,
        numRivers: 4
      });
      break;

    case 'mixed':
      state.map = generateMixedMap(MAP_WIDTH, MAP_HEIGHT, {
        mapSeed,
        caveDensity: 0.48,
        surfaceChance: 0.35,
        numRivers: 2
      });
      break;

    case 'cave':
    default:
      state.map = generateCaveMap(MAP_WIDTH, MAP_HEIGHT, {
        wallProbability: 0.44,
        smoothingPasses: 5,
        mushroomDensity: 0.02,
        waterPools: 4,
        connectCaves: true
      });
      break;
  }

  try {
    await addBiomeToMap(state.map, { timeout: 8000 });
    addLog(state, `Biome: ${state.map.biome?.name || 'Unknown Region'}`);
  } catch {
    addLog(state, 'A mysterious wilderness stretches before us.');
  }

  state.dwarves = [];
  state.foodSources = [];
  state.visitors = [];
  state.log = state.log.slice(-3);
  state.tick = 0;

  state.history = generateWorldHistory(mapSeed);
  resetSpawner();

  const centerPos = findWalkablePosition(state.map);
  if (!centerPos) return;

  for (let i = 0; i < INITIAL_DWARVES; i++) {
    const pos = findWalkablePosition(state.map);
    if (pos) state.dwarves.push(createDwarf(pos.x, pos.y));
  }

  for (let i = 0; i < INITIAL_FOOD_SOURCES; i++) {
    const pos = findWalkablePosition(state.map);
    if (pos) {
      state.foodSources.push(
        createFoodSource(pos.x, pos.y, 8 + Math.floor(Math.random() * 6))
      );
    }
  }

  stopThoughtSystem();
  initThoughtSystem(state, {
    onThought: () => {},
    onSpeech: handleDwarfSpeech,
    onSidebarUpdate: updateSidebarThoughts
  });

  try {
    await waitForBatchNameGeneration(state.dwarves, 30000);
  } catch {}

  state.dwarves.forEach(dwarf => {
    addLog(state, `${getDisplayName(dwarf)} arrives.`);
  });
}

// ==============================
// Event handlers
// ==============================
function handleDwarfSpeech(speaker, listener, text) {
  showSpeech(speaker, listener, text);
  addLog(state, `${speaker.name} to ${listener.name}: "${text}"`);
}

// ==============================
// Init
// ==============================
document.addEventListener('DOMContentLoaded', init);

async function init() {
  const config = getInitialMapConfig();

  MAP_WIDTH = config.MAP_WIDTH;
  MAP_HEIGHT = config.MAP_HEIGHT;
  INITIAL_DWARVES = config.INITIAL_DWARVES;
  INITIAL_FOOD_SOURCES = config.INITIAL_FOOD_SOURCES;
  SPEED_LEVELS = config.SPEED_LEVELS;

  speedIndex = config.defaultSpeedIndex;
  tickInterval = SPEED_LEVELS[speedIndex];

  state = createWorldState(MAP_WIDTH, MAP_HEIGHT);

  const mapContainer = document.getElementById('map-display');
  const logContainer = document.getElementById('log-entries');

  injectBubbleStyles();
  renderer = createRenderer(mapContainer, MAP_WIDTH, MAP_HEIGHT);
  statPanel = createStatPanel(mapContainer, renderer.el, MAP_WIDTH, MAP_HEIGHT);

  cursor = createCursor(
    renderer.el,
    MAP_WIDTH,
    MAP_HEIGHT,
    () => {},
    (_, __, inspection) => {
      if (inspection.entities?.length) statPanel.show(inspection);
      else statPanel.hide();
    }
  );

  initSpeechBubbles(mapContainer, renderer.el);
  initSidebarThoughts();
  initConversationToast(document.body);

  await initializeLLM();
  await initBiomeGenerator();

  llmConnected = await checkConnection();
  addLog(
    state,
    llmConnected
      ? 'Connected to thought engine (LLM).'
      : 'Thought engine offline.'
  );

  await regenerateWorld();
  renderFrame(logContainer);
  setupControls(logContainer);
  startLoop(logContainer);
}

// ==============================
// Render / Loop
// ==============================
function renderFrame(logContainer) {
  const entities = buildRenderEntities(state);
  renderer.render(state.map, entities);
  updateStatus(state);
  updateBubblePositions();
  renderLog(state.log, logContainer);
  if (cursor) cursor.update(state);
  if (statPanel?.isVisible()) statPanel.update(state);
}

function gameLoop(logContainer) {
  if (!running) return;
  tick(state);
  renderFrame(logContainer);
  loopId = setTimeout(() => gameLoop(logContainer), tickInterval);
}

function startLoop(logContainer) {
  if (loopId) clearTimeout(loopId);
  loopId = setTimeout(() => gameLoop(logContainer), tickInterval);
}

// ==============================
// Controls
// ==============================
function setupControls(logContainer) {
  const pauseBtn = document.getElementById('btn-pause');
  const speedBtn = document.getElementById('btn-speed');
  const regenBtn = document.getElementById('btn-regen');

  pauseBtn?.addEventListener('click', () => {
    running = !running;
    pauseBtn.textContent = running ? 'Pause' : 'Resume';
    if (running) startLoop(logContainer);
    else clearTimeout(loopId);
  });

  speedBtn?.addEventListener('click', () => {
    speedIndex = (speedIndex + 1) % SPEED_LEVELS.length;
    tickInterval = SPEED_LEVELS[speedIndex];
    speedBtn.textContent = `Speed: ${speedIndex + 1}x`;
  });

  regenBtn?.addEventListener('click', async () => {
    currentMapMode = (currentMapMode + 1) % MAP_MODES.length;
    clearTimeout(loopId);
    await regenerateWorld();
    startLoop(logContainer);
  });
}

// Debug
window.gameState = () => state;
window.getThoughtStatus = getThoughtStatus;
