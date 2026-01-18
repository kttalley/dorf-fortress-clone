/**
 * Speech Bubble and Thought Display System
 * Renders dwarf thoughts and conversations as floating UI elements
 * Includes sidebar panel for thought history
 */

// Active bubbles
const activeBubbles = new Map();  // id -> { element, dwarf, type, expiry }
const THOUGHT_DURATION = 4000;
const SPEECH_DURATION = 5000;
const MAX_SIDEBAR_THOUGHTS = 6;

let containerEl = null;
let rendererEl = null;
let sidebarEl = null;
let cellWidth = 0;
let cellHeight = 0;

/**
 * Initialize the speech bubble system
 * @param {HTMLElement} gameContainer - Main game container
 * @param {HTMLElement} asciiGrid - The ASCII renderer grid element
 */
export function initSpeechBubbles(gameContainer, asciiGrid) {
  // Create overlay container for bubbles
  containerEl = document.createElement('div');
  containerEl.id = 'speech-bubbles';
  containerEl.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    overflow: hidden;
  `;

  // Insert after the map display
  const mapDisplay = document.getElementById('map-display');
  if (mapDisplay) {
    mapDisplay.style.position = 'relative';
    mapDisplay.appendChild(containerEl);
  }

  rendererEl = asciiGrid;

  // Calculate cell dimensions
  updateCellDimensions();

  // Handle resize
  window.addEventListener('resize', () => {
    setTimeout(updateCellDimensions, 150);
  });
}

/**
 * Update cell dimensions based on grid
 */
function updateCellDimensions() {
  if (!rendererEl) return;

  const cells = rendererEl.querySelectorAll('span');
  if (cells.length > 0) {
    const rect = cells[0].getBoundingClientRect();
    cellWidth = rect.width;
    cellHeight = rect.height;
  }
}

/**
 * Show a thought bubble for a dwarf
 * @param {object} dwarf - Dwarf entity
 * @param {string} thought - Thought text
 */
export function showThought(dwarf, thought) {
  if (!containerEl) return;

  const id = `thought-${dwarf.id}`;

  // Remove existing thought for this dwarf
  removeBubble(id);

  const bubble = createBubble(dwarf, thought, 'thought');
  activeBubbles.set(id, {
    element: bubble,
    dwarf,
    type: 'thought',
    expiry: Date.now() + THOUGHT_DURATION,
  });

  containerEl.appendChild(bubble);
  positionBubble(bubble, dwarf, 'thought');

  // Auto-remove after duration
  setTimeout(() => removeBubble(id), THOUGHT_DURATION);
}

/**
 * Show a speech bubble for dwarf conversation
 * @param {object} speaker - Speaking dwarf
 * @param {object} listener - Listening dwarf
 * @param {string} text - Speech text
 */
export function showSpeech(speaker, listener, text) {
  if (!containerEl) return;

  const id = `speech-${speaker.id}-${Date.now()}`;

  const bubble = createBubble(speaker, text, 'speech', listener);
  activeBubbles.set(id, {
    element: bubble,
    dwarf: speaker,
    type: 'speech',
    expiry: Date.now() + SPEECH_DURATION,
  });

  containerEl.appendChild(bubble);
  positionBubble(bubble, speaker, 'speech');

  // Auto-remove after duration
  setTimeout(() => removeBubble(id), SPEECH_DURATION);
}

/**
 * Create a bubble element
 * @param {object} dwarf
 * @param {string} text
 * @param {string} type - 'thought' or 'speech'
 * @param {object} target - Optional target dwarf for speech
 * @returns {HTMLElement}
 */
function createBubble(dwarf, text, type, target = null) {
  const bubble = document.createElement('div');
  bubble.className = `bubble bubble-${type}`;

  const isThought = type === 'thought';
  const bgColor = isThought ? 'rgba(40, 40, 60, 0.95)' : 'rgba(50, 50, 40, 0.95)';
  const borderColor = isThought ? '#6688aa' : '#aaaa66';
  const textColor = isThought ? '#aabbdd' : '#ddddaa';

  bubble.style.cssText = `
    position: absolute;
    max-width: 200px;
    padding: 6px 10px;
    background: ${bgColor};
    border: 1px solid ${borderColor};
    border-radius: ${isThought ? '12px' : '8px'};
    color: ${textColor};
    font-family: 'Courier New', monospace;
    font-size: 11px;
    line-height: 1.3;
    pointer-events: none;
    z-index: 100;
    animation: bubbleFadeIn 0.3s ease-out;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  `;

  // Name header
  const nameEl = document.createElement('div');
  nameEl.style.cssText = `
    font-weight: bold;
    font-size: 10px;
    color: ${isThought ? '#88aacc' : '#cccc88'};
    margin-bottom: 3px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  `;
  nameEl.textContent = isThought ? `${dwarf.name} thinks...` : dwarf.name;

  // Text content
  const textEl = document.createElement('div');
  textEl.textContent = isThought ? `"${text}"` : text;

  bubble.appendChild(nameEl);
  bubble.appendChild(textEl);

  // Add tail/pointer
  const tail = document.createElement('div');
  tail.style.cssText = `
    position: absolute;
    bottom: -8px;
    left: 20px;
    width: 0;
    height: 0;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-top: 8px solid ${borderColor};
  `;
  bubble.appendChild(tail);

  return bubble;
}

/**
 * Position a bubble relative to a dwarf
 * @param {HTMLElement} bubble
 * @param {object} dwarf
 * @param {string} type
 */
function positionBubble(bubble, dwarf, type) {
  if (!rendererEl || !containerEl) return;

  const gridRect = rendererEl.getBoundingClientRect();
  const containerRect = containerEl.getBoundingClientRect();

  // Calculate dwarf position in pixels
  const dwarfPixelX = dwarf.x * cellWidth;
  const dwarfPixelY = dwarf.y * cellHeight;

  // Offset from grid to container
  const offsetX = gridRect.left - containerRect.left;
  const offsetY = gridRect.top - containerRect.top;

  // Position bubble above dwarf
  const bubbleX = offsetX + dwarfPixelX - 10;
  const bubbleY = offsetY + dwarfPixelY - 60;

  bubble.style.left = `${Math.max(5, bubbleX)}px`;
  bubble.style.top = `${Math.max(5, bubbleY)}px`;
}

/**
 * Remove a bubble by ID
 * @param {string} id
 */
function removeBubble(id) {
  const bubble = activeBubbles.get(id);
  if (bubble) {
    bubble.element.style.animation = 'bubbleFadeOut 0.3s ease-in forwards';
    setTimeout(() => {
      bubble.element.remove();
      activeBubbles.delete(id);
    }, 300);
  }
}

/**
 * Update all bubble positions (call each frame)
 */
export function updateBubblePositions() {
  for (const [id, bubble] of activeBubbles) {
    positionBubble(bubble.element, bubble.dwarf, bubble.type);
  }
}

/**
 * Clear all bubbles
 */
export function clearAllBubbles() {
  for (const [id] of activeBubbles) {
    removeBubble(id);
  }
}

/**
 * Get CSS for animations (inject into page)
 */
export function getBubbleStyles() {
  return `
    @keyframes bubbleFadeIn {
      from {
        opacity: 0;
        transform: translateY(10px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @keyframes bubbleFadeOut {
      from {
        opacity: 1;
        transform: translateY(0);
      }
      to {
        opacity: 0;
        transform: translateY(-10px);
      }
    }
  `;
}

/**
 * Inject bubble styles into document
 */
export function injectBubbleStyles() {
  const style = document.createElement('style');
  style.textContent = getBubbleStyles() + getSidebarStyles();
  document.head.appendChild(style);
}

// ============================================================
// SIDEBAR THOUGHT PANEL
// ============================================================

/**
 * Initialize the sidebar thought panel
 * Creates a panel above the event log to show recent dwarf thoughts
 */
export function initSidebarThoughts() {
  const sidebar = document.querySelector('.sidebar') || document.getElementById('sidebar');
  if (!sidebar) {
    console.warn('[SpeechBubble] No sidebar found for thought panel');
    return;
  }

  // Create thought panel container
  sidebarEl = document.createElement('div');
  sidebarEl.id = 'thought-panel';
  sidebarEl.className = 'thought-panel';

  // Header
  const header = document.createElement('div');
  header.className = 'thought-panel-header';
  header.textContent = 'Dwarf Thoughts';
  sidebarEl.appendChild(header);

  // Content area
  const content = document.createElement('div');
  content.id = 'thought-panel-content';
  content.className = 'thought-panel-content';
  sidebarEl.appendChild(content);

  // Insert before the log section
  const logSection = document.getElementById('log') || sidebar.querySelector('.log-section');
  if (logSection) {
    sidebar.insertBefore(sidebarEl, logSection);
  } else {
    sidebar.insertBefore(sidebarEl, sidebar.firstChild);
  }
}

/**
 * Update sidebar with recent thoughts
 * @param {Array} thoughts - Array of { dwarfId, dwarfName, thought, type, age }
 */
export function updateSidebarThoughts(thoughts = []) {
  const content = document.getElementById('thought-panel-content');
  if (!content) return;

  // Clear and repopulate
  content.innerHTML = '';

  if (thoughts.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'thought-entry thought-empty';
    empty.textContent = 'No recent thoughts...';
    content.appendChild(empty);
    return;
  }

  // Show most recent thoughts (up to max)
  const recentThoughts = thoughts.slice(0, MAX_SIDEBAR_THOUGHTS);

  for (const thought of recentThoughts) {
    const entry = document.createElement('div');
    entry.className = `thought-entry thought-type-${thought.type || 'observation'}`;

    // Name with type indicator
    const nameEl = document.createElement('div');
    nameEl.className = 'thought-entry-name';
    const typeIcon = getThoughtTypeIcon(thought.type);
    nameEl.innerHTML = `<span class="thought-icon">${typeIcon}</span> ${thought.dwarfName}`;
    entry.appendChild(nameEl);

    // Thought text
    const textEl = document.createElement('div');
    textEl.className = 'thought-entry-text';
    textEl.textContent = `"${thought.thought}"`;
    entry.appendChild(textEl);

    // Age indicator
    const ageEl = document.createElement('div');
    ageEl.className = 'thought-entry-age';
    ageEl.textContent = formatAge(thought.age);
    entry.appendChild(ageEl);

    content.appendChild(entry);
  }
}

/**
 * Get icon for thought type
 */
function getThoughtTypeIcon(type) {
  switch (type) {
    case 'meeting': return '👋';
    case 'food_found': return '🍖';
    case 'hunger': return '😋';
    case 'terrain': return '🗺';
    case 'mood': return '💭';
    default: return '💬';
  }
}

/**
 * Format age in human-readable form
 */
function formatAge(ms) {
  if (ms < 1000) return 'just now';
  if (ms < 60000) return `${Math.floor(ms / 1000)}s ago`;
  return `${Math.floor(ms / 60000)}m ago`;
}

/**
 * Get CSS for sidebar thought panel
 */
function getSidebarStyles() {
  return `
    .thought-panel {
      background: rgba(30, 30, 40, 0.95);
      border: 1px solid #4a4a5a;
      border-radius: 4px;
      margin-bottom: 12px;
      overflow: hidden;
    }

    .thought-panel-header {
      background: rgba(50, 50, 70, 0.8);
      padding: 8px 12px;
      font-size: 16px;
      font-weight: bold;
      color: #aabbcc;
      text-transform: uppercase;
      letter-spacing: 1px;
      border-bottom: 1px solid #4a4a5a;
    }

    .thought-panel-content {
      max-height: 400px;
      overflow-y: auto;
      padding: 4px;
    }

    .thought-entry {
      padding: 8px 10px;
      margin: 4px;
      background: rgba(40, 40, 55, 0.8);
      border-radius: 4px;
      border-left: 3px solid #6688aa;
      font-family: 'Courier New', monospace;
      font-size: 11px;
    }

    .thought-entry-name {
      color: #88aacc;
      font-weight: bold;
      margin-bottom: 4px;
      font-size: 10px;
    }

    .thought-icon {
      margin-right: 4px;
    }

    .thought-entry-text {
      color: #ccccdd;
      line-height: 1.3;
      font-style: italic;
    }

    .thought-entry-age {
      color: #666677;
      font-size: 9px;
      margin-top: 4px;
      text-align: right;
    }

    .thought-empty {
      color: #555566;
      font-style: italic;
      text-align: center;
      border-left-color: #444455;
    }

    .thought-type-meeting { border-left-color: #66aa88; }
    .thought-type-food_found { border-left-color: #aaaa66; }
    .thought-type-hunger { border-left-color: #aa6666; }
    .thought-type-terrain { border-left-color: #8866aa; }
    .thought-type-mood { border-left-color: #66aaaa; }

    .thought-panel-content::-webkit-scrollbar {
      width: 6px;
    }

    .thought-panel-content::-webkit-scrollbar-track {
      background: rgba(30, 30, 40, 0.5);
    }

    .thought-panel-content::-webkit-scrollbar-thumb {
      background: #4a4a5a;
      border-radius: 3px;
    }
  `;
}
