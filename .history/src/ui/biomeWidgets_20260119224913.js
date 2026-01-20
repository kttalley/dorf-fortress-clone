/**
 * Biome UI Widgets
 * - Biome title display at top center
 * - Event log widget on the right (below thought widget)
 */

let titleEl = null;
let eventLogEl = null;
let eventLogMinimized = false;
const MAX_EVENT_LOG_ENTRIES = 12;
const MOBILE_BREAKPOINT = 728;

/**
 * Initialize the biome title widget at top center
 * @param {string} initialName - Initial biome name (optional)
 */
export function initBiomeTitle(initialName = '') {
  titleEl = document.createElement('div');
  titleEl.id = 'biome-title-widget';
  titleEl.className = 'floating-widget';
  titleEl.style.cssText = `
    position: fixed;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    padding: 10px 24px;
    background: rgba(15, 15, 25, 0.9);
    border: 1px solid rgba(100, 100, 120, 0.4);
    border-radius: 6px;
    font-family: 'Courier New', monospace;
    text-align: center;
    z-index: 550;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    pointer-events: none;
  `;

  const nameEl = document.createElement('div');
  nameEl.id = 'biome-title-name';
  nameEl.style.cssText = `
    font-size: 16px;
    font-weight: bold;
    color: #aaccee;
    letter-spacing: 2px;
    text-transform: uppercase;
    text-shadow: 0 0 10px rgba(100, 150, 200, 0.3);
  `;
  nameEl.textContent = initialName || 'Generating...';
  titleEl.appendChild(nameEl);

  document.body.appendChild(titleEl);

  // Mobile adjustments
  checkTitleMobileBreakpoint();
  window.addEventListener('resize', checkTitleMobileBreakpoint);
}

/**
 * Update the biome title display
 * @param {string} name - Biome name
 * @param {object} colorMod - Optional color modifiers { hue, saturation, brightness }
 */
export function updateBiomeTitle(name, colorMod = null) {
  const nameEl = document.getElementById('biome-title-name');
  if (!nameEl) return;

  nameEl.textContent = name || 'Unknown Region';

  // Apply color tint based on biome color modifiers
  if (colorMod) {
    const baseHue = 210; // Blue base
    const baseSat = 40;
    const baseLight = 70;

    const hue = (baseHue + (colorMod.hue || 0) + 360) % 360;
    const sat = Math.max(20, Math.min(80, baseSat + (colorMod.saturation || 0)));
    const light = Math.max(50, Math.min(85, baseLight + (colorMod.brightness || 0)));

    nameEl.style.color = `hsl(${hue}, ${sat}%, ${light}%)`;
    nameEl.style.textShadow = `0 0 12px hsla(${hue}, ${sat}%, ${light}%, 0.4)`;

    // Tint the border too
    if (titleEl) {
      titleEl.style.borderColor = `hsla(${hue}, ${sat}%, ${light}%, 0.3)`;
    }
  }
}

/**
 * Check mobile breakpoint for title
 */
function checkTitleMobileBreakpoint() {
  if (!titleEl) return;

  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

  if (isMobile) {
    titleEl.style.padding = '8px 16px';
    titleEl.style.top = '8px';
    const nameEl = titleEl.querySelector('#biome-title-name');
    if (nameEl) {
      nameEl.style.fontSize = '12px';
      nameEl.style.letterSpacing = '1px';
    }
  } else {
    titleEl.style.padding = '10px 24px';
    titleEl.style.top = '12px';
    const nameEl = titleEl.querySelector('#biome-title-name');
    if (nameEl) {
      nameEl.style.fontSize = '16px';
      nameEl.style.letterSpacing = '2px';
    }
  }
}

// ============================================================
// EVENT LOG WIDGET
// ============================================================

/**
 * Initialize the event log widget on the right side (below thought widget)
 */
export function initEventLog() {
  eventLogEl = document.createElement('div');
  eventLogEl.id = 'event-log-widget';
  eventLogEl.className = 'floating-widget';
  eventLogEl.style.cssText = `
    position: fixed;
    top: 340px;
    right: 10px;
    width: 280px;
    max-height: 320px;
    background: rgba(20, 20, 30, 0.95);
    border: 1px solid rgba(100, 100, 120, 0.5);
    border-radius: 8px;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #aabbcc;
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
    font-size: 12px;
    color: #88aacc;
    text-transform: uppercase;
    letter-spacing: 1px;
  `;
  title.innerHTML = '<span style="margin-right: 6px;">📜</span> Event Log';

  const minimizeBtn = document.createElement('button');
  minimizeBtn.id = 'event-log-minimize-btn';
  minimizeBtn.textContent = '−';
  minimizeBtn.title = 'Minimize';
  minimizeBtn.style.cssText = `
    background: rgba(60, 60, 80, 0.8);
    border: 1px solid rgba(100, 100, 120, 0.5);
    border-radius: 4px;
    color: #88aacc;
    font-size: 14px;
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
    toggleEventLogMinimize();
  });

  // Allow clicking header to toggle as well
  header.addEventListener('click', toggleEventLogMinimize);

  header.appendChild(title);
  header.appendChild(minimizeBtn);
  eventLogEl.appendChild(header);

  // Content area
  const content = document.createElement('div');
  content.id = 'event-log-content';
  content.style.cssText = `
    max-height: 260px;
    overflow-y: auto;
    padding: 8px;
    transition: max-height 0.3s ease;
  `;
  eventLogEl.appendChild(content);

  // Add to body
  document.body.appendChild(eventLogEl);

  // Inject scrollbar styles
  injectEventLogStyles();

  // Check for mobile and auto-collapse
  checkEventLogMobileBreakpoint();
  window.addEventListener('resize', checkEventLogMobileBreakpoint);
}

/**
 * Toggle minimize state of event log widget
 */
function toggleEventLogMinimize() {
  if (!eventLogEl) return;

  const content = eventLogEl.querySelector('#event-log-content');
  const btn = eventLogEl.querySelector('#event-log-minimize-btn');

  if (eventLogMinimized) {
    // Expand
    content.style.display = 'block';
    eventLogEl.style.maxHeight = '320px';
    btn.textContent = '−';
    btn.title = 'Minimize';
  } else {
    // Collapse
    content.style.display = 'none';
    eventLogEl.style.maxHeight = '44px';
    btn.textContent = '+';
    btn.title = 'Expand';
  }

  eventLogMinimized = !eventLogMinimized;
}

/**
 * Check mobile breakpoint and auto-collapse
 */
function checkEventLogMobileBreakpoint() {
  if (!eventLogEl) return;

  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

  if (isMobile && !eventLogMinimized) {
    toggleEventLogMinimize();
  }

  // Adjust width and position on mobile
  if (isMobile) {
    eventLogEl.style.width = '220px';
    eventLogEl.style.right = '8px';
    eventLogEl.style.top = '280px';
  } else {
    eventLogEl.style.width = '280px';
    eventLogEl.style.right = '10px';
    eventLogEl.style.top = '340px';
  }
}

/**
 * Update event log with game log entries
 * @param {object} state - Game state with log array
 */
export function updateEventLog(state) {
  const content = document.getElementById('event-log-content');
  if (!content) return;

  // Clear and repopulate
  content.innerHTML = '';

  const logs = state.log || [];

  if (logs.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = `
      padding: 12px;
      color: #555566;
      font-style: italic;
      text-align: center;
    `;
    empty.textContent = 'No events yet...';
    content.appendChild(empty);
    return;
  }

  // Show most recent entries (newest first, limited)
  const recentLogs = logs.slice(-MAX_EVENT_LOG_ENTRIES).reverse();

  for (const log of recentLogs) {
    const entry = document.createElement('div');
    const borderColor = getLogBorderColor(log.message);
    entry.style.cssText = `
      padding: 6px 10px;
      margin: 4px 0;
      background: rgba(35, 35, 50, 0.8);
      border-radius: 4px;
      border-left: 3px solid ${borderColor};
      line-height: 1.3;
    `;

    // Tick number
    const tickEl = document.createElement('span');
    tickEl.style.cssText = `
      color: #666677;
      font-size: 9px;
      margin-right: 6px;
    `;
    tickEl.textContent = `[${log.tick}]`;
    entry.appendChild(tickEl);

    // Message text
    const textEl = document.createElement('span');
    textEl.style.color = getLogTextColor(log.message);
    textEl.textContent = log.message;
    entry.appendChild(textEl);

    content.appendChild(entry);
  }

  // Auto-scroll to top (newest)
  content.scrollTop = 0;
}

/**
 * Get border color based on log message content
 */
function getLogBorderColor(message) {
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes('arrives') || lowerMsg.includes('arrival')) return '#66aa88';
  if (lowerMsg.includes('biome:') || lowerMsg.includes('region')) return '#8866cc';
  if (lowerMsg.includes('history') || lowerMsg.includes('tensions')) return '#aa8866';
  if (lowerMsg.includes('merchant') || lowerMsg.includes('human')) return '#66aaaa';
  if (lowerMsg.includes('perish') || lowerMsg.includes('death') || lowerMsg.includes('died')) return '#aa6666';
  if (lowerMsg.includes('food') || lowerMsg.includes('eating')) return '#aaaa66';
  if (lowerMsg.includes('connected') || lowerMsg.includes('engine')) return '#6688aa';
  if (lowerMsg.includes('explore') || lowerMsg.includes('begin')) return '#88aa66';

  return '#6677aa';
}

/**
 * Get text color based on log message content
 */
function getLogTextColor(message) {
  const lowerMsg = message.toLowerCase();

  if (lowerMsg.includes('perish') || lowerMsg.includes('death') || lowerMsg.includes('died')) return '#cc8888';
  if (lowerMsg.includes('biome:')) return '#bbaadd';

  return '#aabbcc';
}

/**
 * Inject scrollbar styles for event log
 */
function injectEventLogStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* Scrollbar styling for event log */
    #event-log-content::-webkit-scrollbar {
      width: 6px;
    }

    #event-log-content::-webkit-scrollbar-track {
      background: rgba(30, 30, 40, 0.5);
    }

    #event-log-content::-webkit-scrollbar-thumb {
      background: rgba(100, 100, 120, 0.5);
      border-radius: 3px;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Programmatically collapse the event log widget
 */
export function collapseEventLog() {
  if (!eventLogMinimized) {
    toggleEventLogMinimize();
  }
}

/**
 * Programmatically expand the event log widget
 */
export function expandEventLog() {
  if (eventLogMinimized) {
    toggleEventLogMinimize();
  }
}
