/**
 * Scenario Screen UI
 * Modal/overlay for scenario selection and preview
 *
 * Displays: title, description, parameters summary
 * Actions: Start Game, Regenerate, View Parameters, Select Preset
 */

import { generateScenario, getPreset, isGenerationInProgress } from '../llm/scenarioGenerator.js';
import { PRESET_SCENARIOS, getPresetTitles } from '../scenarios/presets.js';
import { VALID_DIFFICULTIES, getDifficultyModifiers } from '../scenarios/scenarioSchema.js';

// State
let currentScenario = null;
let overlayElement = null;
let onAcceptCallback = null;
let isVisible = false;

/**
 * Show the scenario selection screen
 * @param {object} options - Options
 * @param {function} options.onAccept - Callback when scenario is accepted (receives scenario)
 * @param {object} options.initialScenario - Pre-load a specific scenario
 * @returns {Promise<void>}
 */
export async function showScenarioScreen(options = {}) {
  const { onAccept, initialScenario } = options;

  onAcceptCallback = onAccept;

  // Create overlay if needed
  if (!overlayElement) {
    createOverlay();
  }

  // Show overlay
  overlayElement.style.display = 'flex';
  isVisible = true;

  // Load initial scenario
  if (initialScenario) {
    currentScenario = initialScenario;
    renderScenarioCard();
  } else {
    await regenerateScenario();
  }
}

/**
 * Hide the scenario screen
 */
export function hideScenarioScreen() {
  if (overlayElement) {
    overlayElement.style.display = 'none';
  }
  isVisible = false;
}

/**
 * Check if scenario screen is visible
 * @returns {boolean}
 */
export function isScenarioScreenVisible() {
  return isVisible;
}

/**
 * Get the currently selected scenario
 * @returns {object|null}
 */
export function getCurrentScenario() {
  return currentScenario;
}

/**
 * Create the overlay DOM structure
 */
function createOverlay() {
  overlayElement = document.createElement('div');
  overlayElement.id = 'scenario-overlay';
  overlayElement.className = 'scenario-overlay';
  overlayElement.innerHTML = `
    <div class="scenario-modal">
      <div class="scenario-header">
        <h2>Choose Your Scenario</h2>
        <p class="scenario-subtitle">Select a preset or generate a random adventure</p>
      </div>

      <div class="scenario-content">
        <div class="scenario-card" id="scenario-card">
          <div class="scenario-loading">Generating scenario...</div>
        </div>

        <div class="scenario-params" id="scenario-params" style="display: none;">
          <h3>Full Parameters</h3>
          <pre id="params-json"></pre>
          <button class="btn-close-params" id="btn-close-params">Close</button>
        </div>
      </div>

      <div class="scenario-actions">
        <button class="btn-action btn-start" id="btn-start-game">Start Game</button>
        <button class="btn-action btn-regen" id="btn-regenerate">Generate New</button>
        <button class="btn-action btn-params" id="btn-view-params">View Parameters</button>
      </div>

      <div class="scenario-presets">
        <h3>Quick Select Preset</h3>
        <div class="preset-list" id="preset-list"></div>
      </div>
    </div>
  `;

  // Inject styles
  injectStyles();

  // Add to body
  document.body.appendChild(overlayElement);

  // Wire up event listeners
  wireEvents();

  // Populate preset list
  populatePresetList();
}

/**
 * Wire up button event handlers
 */
function wireEvents() {
  const startBtn = document.getElementById('btn-start-game');
  const regenBtn = document.getElementById('btn-regenerate');
  const paramsBtn = document.getElementById('btn-view-params');
  const closeParamsBtn = document.getElementById('btn-close-params');

  if (startBtn) {
    startBtn.addEventListener('click', handleStartGame);
  }

  if (regenBtn) {
    regenBtn.addEventListener('click', handleRegenerate);
  }

  if (paramsBtn) {
    paramsBtn.addEventListener('click', handleViewParams);
  }

  if (closeParamsBtn) {
    closeParamsBtn.addEventListener('click', handleCloseParams);
  }
}

/**
 * Populate the preset selection list
 */
function populatePresetList() {
  const container = document.getElementById('preset-list');
  if (!container) return;

  container.innerHTML = PRESET_SCENARIOS.map((preset, index) => `
    <button class="preset-btn" data-index="${index}">
      <span class="preset-title">${preset.title}</span>
      <span class="preset-diff">${preset.parameters.difficulty}</span>
    </button>
  `).join('');

  // Add click handlers
  container.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const index = parseInt(e.currentTarget.dataset.index, 10);
      selectPreset(index);
    });
  });
}

/**
 * Select a preset scenario
 * @param {number} index - Preset index
 */
function selectPreset(index) {
  currentScenario = getPreset(index);
  renderScenarioCard();
}

/**
 * Regenerate scenario using LLM
 */
async function regenerateScenario() {
  const card = document.getElementById('scenario-card');
  if (card) {
    card.innerHTML = '<div class="scenario-loading">Generating scenario...</div>';
  }

  // Disable buttons during generation
  setButtonsEnabled(false);

  try {
    currentScenario = await generateScenario();
    renderScenarioCard();
  } finally {
    setButtonsEnabled(true);
  }
}

/**
 * Render the scenario card with current scenario data
 */
function renderScenarioCard() {
  const card = document.getElementById('scenario-card');
  if (!card || !currentScenario) return;

  const { title, description, parameters, victory_conditions, isPreset, isGenerated } = currentScenario;
  const badge = isPreset ? 'Preset' : isGenerated ? 'Generated' : 'Custom';
  const difficultyColor = getDifficultyColor(parameters.difficulty);

  card.innerHTML = `
    <div class="card-badge ${badge.toLowerCase()}">${badge}</div>
    <h3 class="card-title">${escapeHtml(title)}</h3>
    <p class="card-description">${escapeHtml(description)}</p>

    <div class="card-stats">
      <div class="stat">
        <span class="stat-label">Terrain</span>
        <span class="stat-value">${parameters.terrain}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Dwarves</span>
        <span class="stat-value">${parameters.dwarfCount}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Difficulty</span>
        <span class="stat-value" style="color: ${difficultyColor}">${parameters.difficulty}</span>
      </div>
      <div class="stat">
        <span class="stat-label">Food Sources</span>
        <span class="stat-value">${parameters.foodSources}</span>
      </div>
    </div>

    <div class="card-goals">
      <span class="goals-label">Victory Conditions:</span>
      <ul class="goals-list">
        ${victory_conditions.map(vc => `<li>${escapeHtml(vc)}</li>`).join('')}
      </ul>
    </div>

    <div class="card-seed">
      Seed: ${currentScenario.seed}
    </div>
  `;
}

/**
 * Handle Start Game button click
 */
function handleStartGame() {
  if (!currentScenario) return;

  hideScenarioScreen();

  if (onAcceptCallback) {
    onAcceptCallback(currentScenario);
  }
}

/**
 * Handle Regenerate button click
 */
async function handleRegenerate() {
  if (isGenerationInProgress()) return;
  await regenerateScenario();
}

/**
 * Handle View Parameters button click
 */
function handleViewParams() {
  const paramsPanel = document.getElementById('scenario-params');
  const paramsJson = document.getElementById('params-json');

  if (paramsPanel && paramsJson && currentScenario) {
    paramsJson.textContent = JSON.stringify(currentScenario, null, 2);
    paramsPanel.style.display = 'block';
  }
}

/**
 * Handle Close Parameters button click
 */
function handleCloseParams() {
  const paramsPanel = document.getElementById('scenario-params');
  if (paramsPanel) {
    paramsPanel.style.display = 'none';
  }
}

/**
 * Enable/disable action buttons
 * @param {boolean} enabled
 */
function setButtonsEnabled(enabled) {
  const buttons = overlayElement?.querySelectorAll('.btn-action');
  buttons?.forEach(btn => {
    btn.disabled = !enabled;
    btn.style.opacity = enabled ? '1' : '0.5';
  });
}

/**
 * Get color for difficulty level
 * @param {string} difficulty
 * @returns {string} CSS color
 */
function getDifficultyColor(difficulty) {
  const colors = {
    peaceful: '#44aa44',
    normal: '#aaaaaa',
    harsh: '#dd8844',
    brutal: '#dd4444',
  };
  return colors[difficulty] || '#aaaaaa';
}

/**
 * Escape HTML special characters
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

/**
 * Inject CSS styles for the scenario screen
 */
function injectStyles() {
  if (document.getElementById('scenario-screen-styles')) return;

  const style = document.createElement('style');
  style.id = 'scenario-screen-styles';
  style.textContent = `
    .scenario-overlay {
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.9);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 1000;
      font-family: 'Courier New', monospace;
    }

    .scenario-modal {
      background: #1a1a1a;
      border: 2px solid #444;
      border-radius: 8px;
      max-width: 700px;
      width: 90%;
      max-height: 90vh;
      overflow-y: auto;
      padding: 24px;
    }

    .scenario-header {
      text-align: center;
      margin-bottom: 20px;
    }

    .scenario-header h2 {
      color: #ffcc44;
      margin: 0 0 8px 0;
      font-size: 1.5rem;
    }

    .scenario-subtitle {
      color: #888;
      margin: 0;
      font-size: 0.9rem;
    }

    .scenario-card {
      background: #222;
      border: 1px solid #555;
      border-radius: 6px;
      padding: 20px;
      position: relative;
      min-height: 200px;
    }

    .scenario-loading {
      color: #888;
      text-align: center;
      padding: 60px 0;
    }

    .card-badge {
      position: absolute;
      top: 10px;
      right: 10px;
      padding: 4px 10px;
      border-radius: 4px;
      font-size: 0.7rem;
      text-transform: uppercase;
    }

    .card-badge.preset { background: #336; color: #88aaff; }
    .card-badge.generated { background: #363; color: #88ff88; }
    .card-badge.custom { background: #553; color: #ffaa88; }

    .card-title {
      color: #fff;
      margin: 0 0 10px 0;
      font-size: 1.3rem;
    }

    .card-description {
      color: #aaa;
      margin: 0 0 20px 0;
      font-style: italic;
      line-height: 1.5;
    }

    .card-stats {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 10px;
      margin-bottom: 20px;
    }

    .stat {
      text-align: center;
      padding: 10px;
      background: #1a1a1a;
      border-radius: 4px;
    }

    .stat-label {
      display: block;
      color: #666;
      font-size: 0.7rem;
      margin-bottom: 4px;
      text-transform: uppercase;
    }

    .stat-value {
      display: block;
      color: #ddd;
      font-size: 1rem;
      font-weight: bold;
    }

    .card-goals {
      margin-bottom: 15px;
    }

    .goals-label {
      color: #888;
      font-size: 0.8rem;
      text-transform: uppercase;
    }

    .goals-list {
      margin: 8px 0 0 0;
      padding-left: 20px;
      color: #aaa;
    }

    .goals-list li {
      margin-bottom: 4px;
    }

    .card-seed {
      color: #555;
      font-size: 0.7rem;
      text-align: right;
    }

    .scenario-actions {
      display: flex;
      gap: 12px;
      margin-top: 20px;
      justify-content: center;
    }

    .btn-action {
      padding: 12px 24px;
      border: none;
      border-radius: 4px;
      font-family: inherit;
      font-size: 0.9rem;
      cursor: pointer;
      transition: background 0.2s, transform 0.1s;
    }

    .btn-action:hover {
      transform: translateY(-1px);
    }

    .btn-action:active {
      transform: translateY(0);
    }

    .btn-action:disabled {
      cursor: not-allowed;
      transform: none;
    }

    .btn-start {
      background: #44aa44;
      color: #fff;
    }

    .btn-start:hover { background: #55bb55; }

    .btn-regen {
      background: #4488cc;
      color: #fff;
    }

    .btn-regen:hover { background: #55aadd; }

    .btn-params {
      background: #555;
      color: #ddd;
    }

    .btn-params:hover { background: #666; }

    .scenario-presets {
      margin-top: 24px;
      padding-top: 20px;
      border-top: 1px solid #333;
    }

    .scenario-presets h3 {
      color: #888;
      font-size: 0.9rem;
      margin: 0 0 12px 0;
      text-transform: uppercase;
    }

    .preset-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
      gap: 8px;
    }

    .preset-btn {
      background: #2a2a2a;
      border: 1px solid #444;
      border-radius: 4px;
      padding: 10px;
      cursor: pointer;
      text-align: left;
      transition: background 0.2s, border-color 0.2s;
    }

    .preset-btn:hover {
      background: #333;
      border-color: #666;
    }

    .preset-title {
      display: block;
      color: #ddd;
      font-size: 0.85rem;
      margin-bottom: 4px;
    }

    .preset-diff {
      display: block;
      color: #666;
      font-size: 0.7rem;
      text-transform: uppercase;
    }

    .scenario-params {
      background: #111;
      border: 1px solid #333;
      border-radius: 4px;
      padding: 16px;
      margin-top: 16px;
    }

    .scenario-params h3 {
      color: #888;
      margin: 0 0 12px 0;
      font-size: 0.9rem;
    }

    .scenario-params pre {
      background: #0a0a0a;
      padding: 12px;
      border-radius: 4px;
      overflow-x: auto;
      color: #88ff88;
      font-size: 0.8rem;
      max-height: 300px;
      overflow-y: auto;
    }

    .btn-close-params {
      margin-top: 12px;
      background: #333;
      border: none;
      color: #aaa;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
    }

    .btn-close-params:hover {
      background: #444;
    }

    @media (max-width: 600px) {
      .card-stats {
        grid-template-columns: repeat(2, 1fr);
      }

      .scenario-actions {
        flex-direction: column;
      }

      .btn-action {
        width: 100%;
      }
    }
  `;

  document.head.appendChild(style);
}
