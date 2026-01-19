/**
 * Main entry point for v0.2
 * Emergent dwarf simulation with LLM-driven thoughts and social interactions
 */

import { createWorldState, addLog } from './state/store.js';
import { createDwarf, createFoodSource, resetIds, getDominantTraits, getDisplayName } from './sim/entities.js';
import { generateBiomeMap, generateMixedMap, generateCaveMap, findWalkablePosition, addBiomeToMap, initBiomeGenerator } from './map/map.js';
import { tick } from './sim/world.js';
import { createRenderer, updateStatus, buildRenderEntities } from './ui/renderer.js';
import { renderLog } from './ui/log.js';
import { createCursor } from './ui/cursor.js';
import { createStatPanel } from './ui/statPanel.js';
import { initThoughtSystem, stopThoughtSystem, getThoughtStatus } from './ai/thoughts.js';
import { initSpeechBubbles, showSpeech, updateBubblePositions, injectBubbleStyles, initSidebarThoughts, updateSidebarThoughts } from './ui/speechBubble.js';
import { checkConnection } from './ai/llmClient.js';
import { initializeLLM } from './llm/nameGenerator.js';
import { waitForBatchNameGeneration } from './llm/nameGenerationEvents.js';
import { on, EVENTS } from './events/eventBus.js';
import { initConversationToast } from './ui/conversationToast.js';

// External forces imports
import { generateWorldHistory, getHistorySummary } from './sim/history.js';
import { resetSpawner } from './sim/visitorSpawner.js';


// Map configuration
const MAP_WIDTH = 640;
const MAP_HEIGHT = 240;
const INITIAL_DWARVES = 7;
const INITIAL_FOOD_SOURCES = 15;
const SPEED_LEVELS = [250, 150, 80, 40];  // ms per tick (slower for watching interactions)

// Map generation modes
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
 * Generate a new world based on current map mode
 */
/**
 * Generate a new world based on current map mode
 * Ensures dwarves receive LLM names before logging arrivals
 */
async function regenerateWorld() {
  resetIds();

  const mapSeed = Date.now();
  const mode = MAP_MODES[currentMapMode];

  // Generate map based on mode
  switch (mode) {
    case 'biome':
      state.map = generateBiomeMap(MAP_WIDTH, MAP_HEIGHT, {
        mapSeed,
        elevationScale: 0.02,
        moistureScale: 0.025,
        numRivers: 4,
      });
      break;

    case 'mixed':
      state.map = generateMixedMap(MAP_WIDTH, MAP_HEIGHT, {
        mapSeed,
        caveDensity: 0.48,
        surfaceChance: 0.35,
        numRivers: 2,
      });
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
      break;
  }

  // Generate biome name for the map (LLM-based)
  try {
    await addBiomeToMap(state.map, { timeout: 8000 });
    const biomeName = state.map.biome?.name || 'Unknown Region';
    addLog(state, `Biome: ${biomeName}`);
  } catch (error) {
    console.warn('[World] Biome generation failed:', error.message);
    addLog(state, 'A mysterious wilderness stretches before us.');
  }

  // Clear entities
  state.dwarves = [];
  state.foodSources = [];
  state.visitors = [];  // External forces
  state.log = state.log.slice(-3);
  state.tick = 0;

  // Generate world history
  const historySeed = mapSeed;
  state.history = generateWorldHistory(historySeed);

  // Reset visitor spawner
  resetSpawner();

  // Log notable history
  if (state.history.events.length > 0) {
    const recentEvent = state.history.events[state.history.events.length - 1];
    addLog(state, `History: ${recentEvent.description}`);
  }

  // Log current race relations summary
  const dwarfHumanRelation = state.history.raceRelations['dwarf_human'] || 0;
  const dwarfGoblinRelation = state.history.raceRelations['dwarf_goblin'] || 0;
  const dwarfElfRelation = state.history.raceRelations['dwarf_elf'] || 0;

  if (dwarfGoblinRelation < -30) {
    addLog(state, 'Tensions run high with goblin clans...');
  } else if (dwarfHumanRelation > 30) {
    addLog(state, 'Human merchants should arrive soon.');
  }

  const centerPos = findWalkablePosition(state.map);
  if (!centerPos) return;

  // Spawn dwarves (no placeholder names)
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
      // Leave name blank until LLM resolves
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

  // === LLM NAME GENERATION WITH REALTIME UI UPDATE ===
  try {
    console.log('[Init] Batch generating dwarf names...');
    await waitForBatchNameGeneration(state.dwarves, 30000); // 30s timeout

    // Assign names and trigger UI updates for all components
    state.dwarves.forEach(dwarf => {
      if (!dwarf.generatedName) {
        dwarf.generatedName = generateNameBioLocal(dwarf).name;
      }

      // Log arrival AFTER name is known
      addLog(state, `${getDisplayName(dwarf)} arrives.`, { wasLLM: !!dwarf.generatedName });

      // Update components immediately
      if (renderer) renderFrame(renderer, document.getElementById('log-entries'));
      if (statPanel) statPanel.update(state);
      if (speechBubble) speechBubble.update(state);
      if (conversationToast) conversationToast.update(state);
    });

    console.log('[Init] ✓ All dwarf names ready');
  } catch (error) {
    console.warn('[Init] Name generation timeout, proceeding with available names:', error.message);

    // Fallback names for dwarves
    state.dwarves.forEach(dwarf => {
      if (!dwarf.generatedName) {
        dwarf.generatedName = generateNameBioLocal(dwarf).name;
      }

      addLog(state, `${getDisplayName(dwarf)} arrives.`, { wasLLM: false });

      if (renderer) renderFrame(renderer, document.getElementById('log-entries'));
      if (statPanel) statPanel.update(state);
      if (speechBubble) speechBubble.update(state);
      if (conversationToast) conversationToast.update(state);
    });
  }
}

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
 * Thoughts go to sidebar panel only - speech bubbles reserved for spoken words
 */
function handleDwarfThought(dwarf, thought) {
  // Thoughts only appear in sidebar panel (handled by onSidebarUpdate callback)
  // No floating thought bubbles on map - keeps focus on spoken interactions
}

/**
 * Handle dwarf speech event (from LLM system)
 */
function handleDwarfSpeech(speaker, listener, text) {
  // Show speech bubble
  showSpeech(speaker, listener, text);

  // Log conversation
  addLog(state, `${speaker.name} to ${listener.name}: "${text}"`);
}

// Initial world generation
regenerateWorld();

// Wait for DOM
document.addEventListener('DOMContentLoaded', init);

/**
 * Show loading screen
 */
function showLoadingScreen() {
  const screen = document.getElementById('loading-screen');
  if (screen) {
    screen.classList.remove('hidden');
  }
}

/**
 * Hide loading screen
 */
function hideLoadingScreen() {
  const screen = document.getElementById('loading-screen');
  if (screen) {
    screen.classList.add('hidden');
  }
}

async function init() {
  // Show loading screen immediately
  showLoadingScreen();

  const mapContainer = document.getElementById('map-display');
  const logContainer = document.getElementById('log-entries');

  if (!mapContainer) {
    console.error('Map container not found');
    hideLoadingScreen();
    return;
  }

  // Inject speech bubble styles
  injectBubbleStyles();

  // Create renderer
  renderer = createRenderer(mapContainer, MAP_WIDTH, MAP_HEIGHT);

  // Create stat panel (for detailed entity inspection) - needs grid element for positioning
  statPanel = createStatPanel(mapContainer, renderer.el, MAP_WIDTH, MAP_HEIGHT);

  // Create cursor system (grid-snapping highlight + tooltip)
  cursor = createCursor(
    renderer.el,
    MAP_WIDTH,
    MAP_HEIGHT,
    // onHover callback
    (x, y, inspection) => {
      // Could add hover preview logic here
    },
    // onClick callback
    (x, y, inspection) => {
      if (inspection.hasDwarf || inspection.hasVisitor || inspection.hasFood || inspection.tile) {
        // Toggle stat panel
        if (statPanel.isVisible()) {
          const current = statPanel.getEntity();
          const clicked = inspection.entities[0]?.entity;
          // If clicking same entity, close panel; otherwise show new
          if (current && clicked && current.id === clicked.id) {
            statPanel.hide();
          } else {
            statPanel.show(inspection);
          }
        } else {
          statPanel.show(inspection);
        }
      } else {
        statPanel.hide();
      }
    }
  );

  // Initialize speech bubbles
  initSpeechBubbles(mapContainer, renderer.el);

  // Initialize sidebar thought panel
  initSidebarThoughts();

  // Initialize the conversation toast container
  initConversationToast(document.body);

  // Initialize LLM systems
  await initializeLLM();
  await initBiomeGenerator();

  // Batch generate names for all dwarves in a single LLM call
  console.log('[Init] Batch generating dwarf names...');
  try {
    await waitForBatchNameGeneration(state.dwarves, 30000); // 30 second timeout
    console.log('[Init] ✓ All dwarf names ready');
  } catch (error) {
    console.warn('[Init] Name generation timeout, proceeding with available names:', error.message);
  }

  // Check LLM connection for thought system
  llmConnected = await checkConnection();

  if (llmConnected) {
    addLog(state, 'Connected to thought engine (LLM).');
  } else {
    addLog(state, 'Thought engine offline - using fallback thoughts.');
  }

  // Hide loading screen now that world is ready
  hideLoadingScreen();

  // Initial render
  renderFrame(renderer, logContainer);

  // Wire up controls
  setupControls(renderer, logContainer);

  // Start game loop
  startLoop(renderer, logContainer);

  addLog(state, 'The dwarves begin to explore their surroundings...');
  renderLog(state.log, logContainer);
}

function renderFrame(renderer, logContainer) {
  const entities = buildRenderEntities(state);
  renderer.render(state.map, entities);
  updateStatus(state);
  updateBubblePositions();
  renderLog(state.log, logContainer);

  // Update cursor and stat panel with current state
  if (cursor) cursor.update(state);
  if (statPanel && statPanel.isVisible()) statPanel.update(state);
}

function gameLoop(renderer, logContainer) {
  if (!running) return;

  tick(state);

  // Softer game over - dwarves can recover if food is found
  if (state.dwarves.length === 0) {
    addLog(state, 'All dwarves have perished... A new group arrives!');
    // Auto-regenerate with same map
    resetIds();
    for (let i = 0; i < 3; i++) {
      const pos = findWalkablePosition(state.map);
      if (pos) {
        const dwarf = createDwarf(pos.x, pos.y);
        state.dwarves.push(dwarf);
        addLog(state, `${getDisplayName(dwarf)} arrives to continue the legacy.`);
      }
    }
    // Add some food
    for (let i = 0; i < 5; i++) {
      const pos = findWalkablePosition(state.map);
      if (pos) {
        state.foodSources.push(createFoodSource(pos.x, pos.y, 8));
      }
    }
  }

  renderFrame(renderer, logContainer);

  if (running) {
    loopId = setTimeout(() => gameLoop(renderer, logContainer), tickInterval);
  }
}

function startLoop(renderer, logContainer) {
  if (loopId) clearTimeout(loopId);
  loopId = setTimeout(() => gameLoop(renderer, logContainer), tickInterval);
}

function setupControls(renderer, logContainer) {
  const pauseBtn = document.getElementById('btn-pause');
  const stepBtn = document.getElementById('btn-step');
  const speedBtn = document.getElementById('btn-speed');
  const regenBtn = document.getElementById('btn-regen');

  if (pauseBtn) {
    pauseBtn.addEventListener('click', () => {
      running = !running;
      pauseBtn.textContent = running ? 'Pause' : 'Resume';

      if (running) {
        startLoop(renderer, logContainer);
      } else if (loopId) {
        clearTimeout(loopId);
        loopId = null;
      }
    });
  }

  if (stepBtn) {
    stepBtn.addEventListener('click', () => {
      if (!running) {
        tick(state);
        renderFrame(renderer, logContainer);
      }
    });
  }

  if (speedBtn) {
    speedBtn.addEventListener('click', () => {
      speedIndex = (speedIndex + 1) % SPEED_LEVELS.length;
      tickInterval = SPEED_LEVELS[speedIndex];
      speedBtn.textContent = `Speed: ${speedIndex + 1}x`;
    });
  }

  if (regenBtn) {
    regenBtn.addEventListener('click', () => {
      // Cycle map mode
      currentMapMode = (currentMapMode + 1) % MAP_MODES.length;

      // Stop current loop
      if (loopId) {
        clearTimeout(loopId);
        loopId = null;
      }

      // Regenerate world
      regenerateWorld();

      // Update button text to show mode
      regenBtn.textContent = `New: ${MAP_MODES[currentMapMode]}`;

      // Reset UI state
      running = true;
      if (pauseBtn) pauseBtn.textContent = 'Pause';

      // Render and restart
      renderFrame(renderer, logContainer);
      startLoop(renderer, logContainer);
    });

    // Show initial mode
    regenBtn.textContent = `New: ${MAP_MODES[(currentMapMode + 1) % MAP_MODES.length]}`;
  }
}

// Export for debugging
window.gameState = state;
window.getThoughtStatus = getThoughtStatus;
