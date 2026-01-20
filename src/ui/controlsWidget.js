/**
 * Floating Controls Widget
 * Bottom-center game controls with compact status display
 */

let controlsEl = null;
let statusEl = null;

// Callback references for button handlers
let onPause = null;
let onStep = null;
let onSpeed = null;
let onRegen = null;

/**
 * Initialize the floating controls widget
 * @param {HTMLElement} parentElement - Parent to attach widget to
 * @param {object} callbacks - { onPause, onStep, onSpeed, onRegen }
 * @returns {object} Controller with updateStatus method
 */
export function initControlsWidget(parentElement, callbacks = {}) {
  if (controlsEl) return getController();

  onPause = callbacks.onPause;
  onStep = callbacks.onStep;
  onSpeed = callbacks.onSpeed;
  onRegen = callbacks.onRegen;

  controlsEl = document.createElement('div');
  controlsEl.id = 'controls-widget';
  controlsEl.className = 'floating-widget';

  // Create buttons
  const pauseBtn = createButton('btn-pause', 'Pause');
  const stepBtn = createButton('btn-step', 'Step');
  const speedBtn = createButton('btn-speed', 'Speed: 1x');
  const regenBtn = createButton('btn-regen', 'New Map');

  // Create compact status display
  statusEl = document.createElement('div');
  statusEl.className = 'status-compact';
  statusEl.innerHTML = `
    <span>T:<span class="stat-value" id="tick-display">0</span></span>
    <span>D:<span class="stat-value" id="dwarf-count">0</span></span>
    <span>F:<span class="stat-value" id="food-count">0</span></span>
  `;

  // Assemble widget
  controlsEl.appendChild(pauseBtn);
  controlsEl.appendChild(stepBtn);
  controlsEl.appendChild(speedBtn);
  controlsEl.appendChild(regenBtn);
  controlsEl.appendChild(statusEl);

  parentElement.appendChild(controlsEl);

  // Wire up event handlers
  pauseBtn.addEventListener('click', () => {
    if (onPause) onPause(pauseBtn);
  });

  stepBtn.addEventListener('click', () => {
    if (onStep) onStep();
  });

  speedBtn.addEventListener('click', () => {
    if (onSpeed) onSpeed(speedBtn);
  });

  regenBtn.addEventListener('click', () => {
    if (onRegen) onRegen(regenBtn, pauseBtn);
  });

  return getController();
}

/**
 * Create a button element
 */
function createButton(id, text) {
  const btn = document.createElement('button');
  btn.id = id;
  btn.textContent = text;
  return btn;
}

/**
 * Get controller object
 */
function getController() {
  return {
    /**
     * Update the status display
     * @param {object} state - World state with tick, dwarves, foodSources
     */
    updateStatus(state) {
      if (!statusEl) return;

      const tickEl = statusEl.querySelector('#tick-display');
      const dwarfEl = statusEl.querySelector('#dwarf-count');
      const foodEl = statusEl.querySelector('#food-count');

      if (tickEl) tickEl.textContent = state.tick || 0;
      if (dwarfEl) dwarfEl.textContent = state.dwarves?.length || 0;
      if (foodEl) foodEl.textContent = state.foodSources?.length || 0;
    },

    /**
     * Get button by ID
     */
    getButton(id) {
      return controlsEl?.querySelector(`#${id}`);
    },

    /**
     * Show the widget
     */
    show() {
      if (controlsEl) controlsEl.style.display = 'flex';
    },

    /**
     * Hide the widget
     */
    hide() {
      if (controlsEl) controlsEl.style.display = 'none';
    },

    /**
     * Destroy the widget
     */
    destroy() {
      if (controlsEl) {
        controlsEl.remove();
        controlsEl = null;
        statusEl = null;
      }
    },
  };
}
