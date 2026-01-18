/**
 * Speech Bubble and Thought Display System
 * Renders dwarf thoughts and conversations as floating UI elements
 */

// Active bubbles
const activeBubbles = new Map();  // id -> { element, dwarf, type, expiry }
const THOUGHT_DURATION = 4000;
const SPEECH_DURATION = 5000;

let containerEl = null;
let rendererEl = null;
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
  style.textContent = getBubbleStyles();
  document.head.appendChild(style);
}
