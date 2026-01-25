/**
 * Speech Bubble and Thought Display System
 * Renders dwarf thoughts and conversations as floating UI elements
 * Includes sidebar panel for thought history
 */
import { addSpeechMessage } from './conversationToast.js';


// Active bubbles
const activeBubbles = new Map();  // id -> { element, dwarf, type, expiry }
const speechQueue = [];  // Queue for conversations waiting to be displayed
const visibleSpeechBubbles = new Map();  // Currently visible speech bubbles (max 2)
const THOUGHT_DURATION = 4000;
const SPEECH_DISPLAY_DURATION = 5000;  // 5 seconds of display
const SPEECH_FADE_DURATION = 1000;  // 1 second fade out
const MAX_VISIBLE_SPEECH = 2;  // Maximum 2 conversations visible at once
const MAX_SIDEBAR_THOUGHTS = 6;
const MOBILE_BREAKPOINT = 728;
let speechQueueTimer = null;

let containerEl = null;
let rendererEl = null;
let sidebarEl = null;
let cellWidth = 0;
let cellHeight = 0;

/**
 * Check if we're on mobile
 */
function isMobile() {
  return window.innerWidth <= MOBILE_BREAKPOINT;
}

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
 * Queues conversations to display max 2 at a time, each for 5s + 1s fade
 * @param {object} speaker - Speaking dwarf
 * @param {object} listener - Listening dwarf
 * @param {string} text - Speech text
 */
export function showSpeech(speaker, listener, text) {
  if (!containerEl) return;
  
  // Queue the conversation
  const conversationData = {
    id: `speech-${speaker.id}-${Date.now()}`,
    speaker,
    listener,
    text,
    bubble: null,
  };
  
  speechQueue.push(conversationData);
  
  // Add to conversation toast
  addSpeechMessage(speaker, listener, text);
  
  // Process queue if not already running
  if (!speechQueueTimer) {
    processSpeechQueue();
  }
}

/**
 * Process the speech queue, displaying up to 2 conversations at a time
 */
function processSpeechQueue() {
  if (visibleSpeechBubbles.size >= MAX_VISIBLE_SPEECH || speechQueue.length === 0) {
    return;
  }
  
  const conversation = speechQueue.shift();
  const bubble = createBubble(conversation.speaker, conversation.text, 'speech', conversation.listener);
  
  conversation.bubble = bubble;
  visibleSpeechBubbles.set(conversation.id, {
    element: bubble,
    dwarf: conversation.speaker,
    type: 'speech',
    conversationData: conversation,
  });
  
  containerEl.appendChild(bubble);
  positionBubble(bubble, conversation.speaker, 'speech');
  
  // Schedule fade out after display duration
  setTimeout(() => {
    fadeOutSpeech(conversation.id);
  }, SPEECH_DISPLAY_DURATION);
}

/**
 * Fade out a speech bubble and process next in queue
 * @param {string} id
 */
function fadeOutSpeech(id) {
  const speechData = visibleSpeechBubbles.get(id);
  if (!speechData) return;
  
  const bubble = speechData.element;
  
  // Add fade out animation
  bubble.style.animation = `bubbleFadeOut ${SPEECH_FADE_DURATION / 1000}s ease-in forwards`;
  
  // Remove after fade completes
  setTimeout(() => {
    if (bubble.parentNode) {
      bubble.remove();
    }
    visibleSpeechBubbles.delete(id);
    
    // Process next in queue
    processSpeechQueue();
  }, SPEECH_FADE_DURATION);
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
    font-size: 14px;
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
    font-size: 13px;
    color: ${isThought ? '#88aacc' : '#cccc88'};
    margin-bottom: 3px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  `;
  nameEl.textContent = isThought ? `${dwarf.generatedName} thinks...` : dwarf.generatedName;

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
 * On mobile, bubbles are positioned at top of screen for visibility
 * @param {HTMLElement} bubble
 * @param {object} dwarf
 * @param {string} type
 */
function positionBubble(bubble, dwarf, type) {
  if (!rendererEl || !containerEl) return;

  // On mobile, use fixed positioning at top of viewport
  if (isMobile()) {
    bubble.style.position = 'fixed';
    bubble.style.left = '50%';
    bubble.style.transform = 'translateX(-50%)';
    bubble.style.top = '60px';  // Below biome title
    bubble.style.maxWidth = 'calc(100vw - 32px)';
    bubble.style.width = 'auto';
    bubble.style.zIndex = '500';
    return;
  }

  // Desktop positioning - relative to dwarf
  bubble.style.position = 'absolute';
  bubble.style.transform = 'none';

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

  // Ensure bubble stays within viewport
  const bubbleWidth = bubble.offsetWidth || 200;
  const maxX = containerRect.width - bubbleWidth - 5;

  bubble.style.left = `${Math.max(5, Math.min(maxX, bubbleX))}px`;
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
 * Get list of currently visible speakers (for highlighting in renderer)
 * @returns {Array} Array of speaker dwarf objects
 */
export function getActiveSpeakers() {
  const speakers = [];
  for (const [id, speechData] of visibleSpeechBubbles) {
    if (speechData.dwarf) {
      speakers.push(speechData.dwarf);
    }
  }
  return speakers;
}

/**
 * Update all bubble positions (call each frame)
 */
export function updateBubblePositions() {
  for (const [id, bubble] of activeBubbles) {
    positionBubble(bubble.element, bubble.dwarf, bubble.type);
  }
  
  for (const [id, speechData] of visibleSpeechBubbles) {
    positionBubble(speechData.element, speechData.dwarf, 'speech');
  }
}

/**
 * Clear all bubbles and queue
 */
export function clearAllBubbles() {
  for (const [id] of activeBubbles) {
    removeBubble(id);
  }
  
  // Clear speech queue
  speechQueue.length = 0;
  
  // Clear visible speech bubbles
  for (const [id, speechData] of visibleSpeechBubbles) {
    if (speechData.element.parentNode) {
      speechData.element.remove();
    }
  }
  visibleSpeechBubbles.clear();
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
// FLOATING THOUGHT PANEL WIDGET
// ============================================================

let isMinimized = false;

/**
 * Initialize the floating thought panel widget
 * Creates a collapsible panel in top-right corner
 */
export function initSidebarThoughts() {
  // Create floating widget container
  sidebarEl = document.createElement('div');
  sidebarEl.id = 'thought-widget';
  sidebarEl.className = 'floating-widget';
  sidebarEl.style.cssText = `
    position: fixed;
    top: 10px;
    right: 10px;
    width: 280px;
    max-height: 320px;
    background: rgba(20, 20, 30, 0.95);
    border: 1px solid rgba(100, 100, 120, 0.5);
    border-radius: 8px;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    color: #aabbdd;
    z-index: 600;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    transition: max-height 0.3s ease, opacity 0.3s ease;
    overflow: hidden;
  `;

  // Header with minimize button
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: rgba(40, 40, 60, 0.8);
    border-bottom: 1px solid rgba(100, 100, 120, 0.3);
    cursor: pointer;
  `;

  const title = document.createElement('div');
  title.style.cssText = `
    font-weight: bold;
    font-size: 15px;
    color: #88aacc;
    text-transform: uppercase;
    letter-spacing: 1px;
  `;
  title.innerHTML = '<span style="margin-right: 6px;">💭</span> Dwarf Thoughts';

  const minimizeBtn = document.createElement('button');
  minimizeBtn.id = 'thought-minimize-btn';
  minimizeBtn.textContent = '−';
  minimizeBtn.title = 'Minimize';
  minimizeBtn.style.cssText = `
    background: rgba(60, 60, 80, 0.8);
    border: 1px solid rgba(100, 100, 120, 0.5);
    border-radius: 4px;
    color: #88aacc;
    font-size: 17px;
    width: 24px;
    height: 24px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    transition: background 0.15s;
  `;

  minimizeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMinimize();
  });

  // Allow clicking header to toggle as well
  header.addEventListener('click', toggleMinimize);

  header.appendChild(title);
  header.appendChild(minimizeBtn);
  sidebarEl.appendChild(header);

  // Content area
  const content = document.createElement('div');
  content.id = 'thought-panel-content';
  content.style.cssText = `
    max-height: 260px;
    overflow-y: auto;
    padding: 8px;
    transition: max-height 0.3s ease;
  `;
  sidebarEl.appendChild(content);

  // Add to body
  document.body.appendChild(sidebarEl);

  // Check for mobile and auto-collapse
  checkMobileBreakpoint();
  window.addEventListener('resize', checkMobileBreakpoint);
}

/**
 * Toggle minimize state of thought widget
 */
function toggleMinimize() {
  if (!sidebarEl) return;

  const content = sidebarEl.querySelector('#thought-panel-content');
  const btn = sidebarEl.querySelector('#thought-minimize-btn');

  if (isMinimized) {
    // Expand
    content.style.display = 'block';
    sidebarEl.style.maxHeight = '320px';
    if (btn) {
      btn.textContent = '−';
      btn.title = 'Minimize';
    }
  } else {
    // Collapse
    content.style.display = 'none';
    sidebarEl.style.maxHeight = '44px';
    if (btn) {
      btn.textContent = '+';
      btn.title = 'Expand';
    }
  }

  isMinimized = !isMinimized;

  // Re-apply mobile styling after toggle (without auto-collapse)
  applyMobileStyles();
}

/**
 * Apply mobile styling based on breakpoint and minimized state
 * Called after manual toggle and on resize
 */
function applyMobileStyles() {
  if (!sidebarEl) return;

  const mobile = window.innerWidth <= MOBILE_BREAKPOINT;
  const header = sidebarEl.querySelector('div');
  const title = header?.querySelector('div');
  const minimizeBtn = sidebarEl.querySelector('#thought-minimize-btn');

  // Adjust for mobile: icon-only round button when collapsed
  if (mobile) {
    if (isMinimized) {
      // Round icon-only button
      sidebarEl.style.width = '44px';
      sidebarEl.style.height = '44px';
      sidebarEl.style.maxHeight = '44px';
      sidebarEl.style.maxWidth = '44px';
      sidebarEl.style.borderRadius = '50%';
      sidebarEl.style.right = '8px';
      sidebarEl.style.top = '50px';
      sidebarEl.style.left = 'auto';
      if (header) {
        header.style.padding = '10px';
        header.style.justifyContent = 'center';
        header.style.borderBottom = 'none';
      }
      if (title) {
        title.innerHTML = '💭';
        title.style.fontSize = '18px';
        title.style.letterSpacing = '0';
      }
      if (minimizeBtn) minimizeBtn.style.display = 'none';
    } else {
      // Expanded on mobile
      sidebarEl.style.width = '260px';
      sidebarEl.style.height = 'auto';
      sidebarEl.style.maxHeight = '320px';
      sidebarEl.style.maxWidth = '320px';
      sidebarEl.style.borderRadius = '8px';
      sidebarEl.style.right = '8px';
      sidebarEl.style.top = '8px';
      sidebarEl.style.left = 'auto';
      if (header) {
        header.style.padding = '10px 12px';
        header.style.justifyContent = 'space-between';
        header.style.borderBottom = '1px solid rgba(100, 100, 120, 0.3)';
      }
      if (title) {
        title.innerHTML = '<span style="margin-right: 6px;">💭</span> Dwarf Thoughts';
        title.style.fontSize = '12px';
        title.style.letterSpacing = '1px';
      }
      if (minimizeBtn) minimizeBtn.style.display = 'flex';
    }
  } else {
    // Desktop: full width panel
    sidebarEl.style.width = '280px';
    sidebarEl.style.height = 'auto';
    sidebarEl.style.maxWidth = '';
    sidebarEl.style.borderRadius = '8px';
    sidebarEl.style.right = '10px';
    sidebarEl.style.top = '10px';
    sidebarEl.style.left = 'auto';
    if (header) {
      header.style.padding = '10px 12px';
      header.style.justifyContent = 'space-between';
      header.style.borderBottom = '1px solid rgba(100, 100, 120, 0.3)';
    }
    if (title) {
      title.innerHTML = '<span style="margin-right: 6px;">💭</span> Dwarf Thoughts';
      title.style.fontSize = '12px';
      title.style.letterSpacing = '1px';
    }
    if (minimizeBtn) minimizeBtn.style.display = 'flex';
  }
}

/**
 * Check mobile breakpoint and auto-collapse only on resize
 */
function checkMobileBreakpoint() {
  if (!sidebarEl) return;

  const mobile = window.innerWidth <= MOBILE_BREAKPOINT;

  // Only auto-collapse if we're on mobile and currently expanded
  if (mobile && !isMinimized) {
    isMinimized = true;
  }

  applyMobileStyles();
}

/**
 * Programmatically collapse the thought widget
 */
export function collapseThoughtWidget() {
  if (!isMinimized) {
    toggleMinimize();
  }
}

/**
 * Programmatically expand the thought widget
 */
export function expandThoughtWidget() {
  if (isMinimized) {
    toggleMinimize();
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
    empty.style.cssText = `
      padding: 12px;
      color: #555566;
      font-style: italic;
      text-align: center;
    `;
    empty.textContent = 'No recent thoughts...';
    content.appendChild(empty);
    return;
  }

  // Show most recent thoughts (up to max)
  const recentThoughts = thoughts.slice(0, MAX_SIDEBAR_THOUGHTS);

  for (const thought of recentThoughts) {
    const entry = document.createElement('div');
    const borderColor = getThoughtBorderColor(thought.type);
    entry.style.cssText = `
      padding: 8px 10px;
      margin: 6px 0;
      background: rgba(40, 40, 55, 0.8);
      border-radius: 4px;
      border-left: 3px solid ${borderColor};
    `;

    // Name with type indicator
    const nameEl = document.createElement('div');
    nameEl.style.cssText = `
      color: #88aacc;
      font-weight: bold;
      margin-bottom: 4px;
      font-size: 10px;
    `;
    const typeIcon = getThoughtTypeIcon(thought.type);
    nameEl.innerHTML = `<span style="margin-right: 4px;">${typeIcon}</span> ${thought.dwarfName}`;
    entry.appendChild(nameEl);

    // Thought text
    const textEl = document.createElement('div');
    textEl.style.cssText = `
      color: #ccccdd;
      line-height: 1.3;
      font-style: italic;
    `;
    textEl.textContent = `"${thought.thought}"`;
    entry.appendChild(textEl);

    // Age indicator
    const ageEl = document.createElement('div');
    ageEl.style.cssText = `
      color: #666677;
      font-size: 9px;
      margin-top: 4px;
      text-align: right;
    `;
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
 * Get border color for thought type
 */
function getThoughtBorderColor(type) {
  switch (type) {
    case 'meeting': return '#66aa88';
    case 'food_found': return '#aaaa66';
    case 'hunger': return '#aa6666';
    case 'terrain': return '#8866aa';
    case 'mood': return '#66aaaa';
    default: return '#6688aa';
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
 * Get CSS for floating widgets (minimal, most styles are inline now)
 */
function getSidebarStyles() {
  return `
    /* Scrollbar styling for thought panel */
    #thought-panel-content::-webkit-scrollbar {
      width: 6px;
    }

    #thought-panel-content::-webkit-scrollbar-track {
      background: rgba(30, 30, 40, 0.5);
    }

    #thought-panel-content::-webkit-scrollbar-thumb {
      background: rgba(100, 100, 120, 0.5);
      border-radius: 3px;
    }
  `;
}
