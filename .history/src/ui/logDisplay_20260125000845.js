/**
 * Log Display Component
 * Renders event log with narrator mode toggle
 *
 * Agent F ownership: presentation layer only
 * - Narrator mode: shows dramatic prose
 * - Raw mode: shows [tick] event format
 * - Tooltip reveals source when hovering narrated text
 */

// === STATE ===
let narratorMode = false;
let containerEl = null;

// === CONSTANTS ===
const MAX_VISIBLE_ENTRIES = 30;
const NARRATOR_BADGE = '\u{1F3AD}'; // 🎭

/**
 * Initialize log display
 * @param {HTMLElement} container - Container element for log
 * @param {object} options - { narratorMode: boolean }
 */
export function initLogDisplay(container, options = {}) {
  containerEl = container;
  narratorMode = options.narratorMode ?? false;

  // Add base styles
  if (container) {
    container.classList.add('log-display');
  }
}

/**
 * Toggle narrator mode on/off
 * @param {boolean} enabled
 */
export function setNarratorMode(enabled) {
  narratorMode = enabled;
}

/**
 * Get current narrator mode state
 * @returns {boolean}
 */
export function isNarratorMode() {
  return narratorMode;
}

/**
 * Render a single event line
 * @param {object} event - { tick, message, narrated?, wasLLM? }
 * @param {boolean} useNarrator - Override narrator mode for this line
 * @returns {HTMLElement}
 */
export function renderEventLine(event, useNarrator = narratorMode) {
  const div = document.createElement('div');
  div.className = 'log-entry';

  const raw = event.message || event.raw || '';
  const narrated = event.narrated;
  const tick = event.tick ?? 0;

  if (useNarrator && narrated) {
    // Narrator mode: show prose with badge
    div.classList.add('log-entry--narrated');
    div.innerHTML = `
      <span class="log-badge" title="Narrated prose">${NARRATOR_BADGE}</span>
      <span class="log-prose">${escapeHtml(narrated)}</span>
      <button class="log-source-btn" title="Show raw event" aria-label="Show source">?</button>
    `;

    // Add tooltip/popover for raw source
    const sourceBtn = div.querySelector('.log-source-btn');
    if (sourceBtn) {
      sourceBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showSourceTooltip(sourceBtn, raw, tick);
      });
    }

    // Mark if LLM-generated vs fallback
    if (event.wasLLM === false) {
      div.classList.add('log-entry--fallback');
    }
  } else {
    // Raw mode: [tick] message
    div.classList.add('log-entry--raw');
    div.innerHTML = `
      <span class="log-tick">[${tick}]</span>
      <span class="log-message">${escapeHtml(raw)}</span>
    `;
  }

  return div;
}

/**
 * Render full log to container
 * @param {Array} log - Array of event objects
 * @param {HTMLElement} container - Optional override container
 */
export function renderLog(log, container = containerEl) {
  if (!container) return;

  // Clear existing
  container.innerHTML = '';

  // Get recent entries (reversed for newest-first)
  const entries = [...log].reverse().slice(0, MAX_VISIBLE_ENTRIES);

  for (const entry of entries) {
    const el = renderEventLine(entry);
    container.appendChild(el);
  }

  // Add mode indicator
  const modeIndicator = document.createElement('div');
  modeIndicator.className = 'log-mode-indicator';
  modeIndicator.textContent = narratorMode ? 'Chronicle Mode' : 'Raw Log';
  container.insertBefore(modeIndicator, container.firstChild);
}

/**
 * Show source tooltip near an element
 * @param {HTMLElement} anchor - Element to anchor tooltip to
 * @param {string} raw - Raw event text
 * @param {number} tick - Event tick
 */
function showSourceTooltip(anchor, raw, tick) {
  // Remove any existing tooltip
  const existing = document.querySelector('.log-source-tooltip');
  if (existing) {
    existing.remove();
  }

  const tooltip = document.createElement('div');
  tooltip.className = 'log-source-tooltip';
  tooltip.innerHTML = `
    <div class="log-source-header">Raw Event [tick ${tick}]</div>
    <div class="log-source-content">${escapeHtml(raw)}</div>
  `;

  // Position near anchor
  document.body.appendChild(tooltip);

  const rect = anchor.getBoundingClientRect();
  tooltip.style.position = 'fixed';
  tooltip.style.left = `${rect.left}px`;
  tooltip.style.top = `${rect.bottom + 4}px`;
  tooltip.style.zIndex = '1000';

  // Close on click outside
  const closeHandler = (e) => {
    if (!tooltip.contains(e.target) && e.target !== anchor) {
      tooltip.remove();
      document.removeEventListener('click', closeHandler);
    }
  };
  setTimeout(() => {
    document.addEventListener('click', closeHandler);
  }, 0);
}

/**
 * Create narrator mode toggle button
 * @param {function} onChange - Callback when mode changes
 * @returns {HTMLElement}
 */
export function createNarratorToggle(onChange) {
  const wrapper = document.createElement('div');
  wrapper.className = 'narrator-toggle';

  const label = document.createElement('label');
  label.className = 'narrator-toggle__label';

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = narratorMode;
  checkbox.className = 'narrator-toggle__input';

  const labelText = document.createElement('span');
  labelText.className = 'narrator-toggle__text';
  labelText.textContent = 'Chronicle Mode';

  const badge = document.createElement('span');
  badge.className = 'narrator-toggle__badge';
  badge.textContent = NARRATOR_BADGE;

  checkbox.addEventListener('change', () => {
    narratorMode = checkbox.checked;
    labelText.textContent = narratorMode ? 'Chronicle Mode' : 'Raw Log';
    if (onChange) onChange(narratorMode);
  });

  label.appendChild(checkbox);
  label.appendChild(badge);
  label.appendChild(labelText);
  wrapper.appendChild(label);

  return wrapper;
}

/**
 * Escape HTML special characters
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Get CSS styles for log display (inject once)
 * @returns {string}
 */
export function getLogDisplayStyles() {
  return `
    .log-display {
      font-family: monospace;
      font-size: 15px;
      line-height: 1.4;
      overflow-y: auto;
      padding: 8px;
      background: #0a0a0a;
      color: #aaa;
    }

    .log-mode-indicator {
      font-size: 10px;
      color: #666;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
      padding-bottom: 4px;
      border-bottom: 1px solid #222;
    }

    .log-entry {
      padding: 4px 0;
      border-bottom: 1px solid #1a1a1a;
    }

    .log-entry--raw .log-tick {
      color: #555;
      margin-right: 8px;
    }

    .log-entry--raw .log-message {
      color: #888;
    }

    .log-entry--narrated {
      color: #b8a070;
      font-style: italic;
    }

    .log-entry--narrated .log-badge {
      margin-right: 6px;
      font-style: normal;
    }

    .log-entry--narrated .log-prose {
      color: #c4a86a;
    }

    .log-entry--fallback .log-prose {
      color: #9a9070;
    }

    .log-source-btn {
      background: none;
      border: 1px solid #444;
      color: #666;
      font-size: 10px;
      padding: 0 4px;
      margin-left: 8px;
      cursor: pointer;
      border-radius: 2px;
    }

    .log-source-btn:hover {
      background: #222;
      color: #aaa;
    }

    .log-source-tooltip {
      background: #1a1a1a;
      border: 1px solid #333;
      padding: 8px;
      max-width: 300px;
      border-radius: 4px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
    }

    .log-source-header {
      font-size: 10px;
      color: #666;
      margin-bottom: 4px;
    }

    .log-source-content {
      color: #888;
      font-family: monospace;
    }

    .narrator-toggle {
      display: inline-block;
    }

    .narrator-toggle__label {
      display: flex;
      align-items: center;
      gap: 6px;
      cursor: pointer;
      font-size: 14px;
      color: #888;
    }

    .narrator-toggle__input {
      width: 14px;
      height: 14px;
    }

    .narrator-toggle__badge {
      font-size: 17px;
    }

    .narrator-toggle__text {
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
  `;
}

/**
 * Inject log display styles into document head
 */
export function injectLogDisplayStyles() {
  if (document.querySelector('#log-display-styles')) return;

  const style = document.createElement('style');
  style.id = 'log-display-styles';
  style.textContent = getLogDisplayStyles();
  document.head.appendChild(style);
}
