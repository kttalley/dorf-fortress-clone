/**
 * main.js - entry point for Dwarf Fortress clone
 * Handles world initialization, LLM dwarf name generation, and game loop
 */

import { createWorld, tickWorld } from './sim/world.js';
import { createStatPanel } from './statPanel.js';
import { inspectPosition } from './inspection.js';
import { batchGenerateDwarfNames } from './llm/nameGenerator.js';

// --- DOM Elements ---
const containerEl = document.getElementById('game-container');
const gridEl = document.getElementById('ascii-grid');

// --- Game Settings ---
const MAP_WIDTH = 80;
const MAP_HEIGHT = 40;
const NUM_DWARVES = 7;

// --- Create Stat Panel ---
const statPanel = createStatPanel(containerEl, gridEl, MAP_WIDTH, MAP_HEIGHT);

// --- Initialize World ---
const world = createWorld({
  width: MAP_WIDTH,
  height: MAP_HEIGHT,
  numDwarves: NUM_DWARVES,
});

// --- LLM Batch Name Generation ---
async function generateDwarfNames() {
  try {
    const dwarvesToName = world.dwarves.map(d => ({ id: d.id }));
    const generatedNames = await batchGenerateDwarfNames(dwarvesToName);

    // Apply generated names & bios to world state
    for (const gen of generatedNames) {
      const dwarf = world.dwarves.find(d => d.id === gen.id);
      if (dwarf) {
        dwarf.generatedName = gen.name;
        dwarf.generatedBio = gen.bio;
      }
    }

    console.log(`[Init] ✓ Applied ${generatedNames.length} LLM names to dwarves`);
  } catch (err) {
    console.warn('[Init] LLM unavailable, using local fallback names');
    // Fallback: dwarves already have default `name` from createWorld
    world.dwarves.forEach(d => {
      d.generatedName = d.name;
      d.generatedBio = `A hardy dwarf named ${d.name}`;
    });
  }
}

// --- Inspect on Click ---
gridEl.addEventListener('click', e => {
  const rect = gridEl.getBoundingClientRect();
  const cellWidth = rect.width / MAP_WIDTH;
  const cellHeight = rect.height / MAP_HEIGHT;

  const x = Math.floor((e.clientX - rect.left) / cellWidth);
  const y = Math.floor((e.clientY - rect.top) / cellHeight);

  const inspection = inspectPosition(world, x, y);
  statPanel.show(inspection);
});

// --- Game Loop ---
function gameLoop() {
  tickWorld(world);           // Advance world simulation
  statPanel.update(world);    // Update stat panel if visible
  requestAnimationFrame(gameLoop);
}

// --- Initialization ---
async function init() {
  console.log('[Init] Checking LLM & generating dwarf names...');
  await generateDwarfNames();
  console.log('[Init] Starting game loop...');
  requestAnimationFrame(gameLoop);
}

init();
