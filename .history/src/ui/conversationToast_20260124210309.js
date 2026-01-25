/**
 * Conversation toast container - displays conversation thread between dwarves
 * Styled to match event log and thought widgets
 */

// Container for conversation messages
let conversationContainer = null;
let conversationMessages = [];
const MAX_MESSAGES = 50; // Limit messages to prevent memory issues
let isMinimized = false;
const MOBILE_BREAKPOINT = 728;

/**
 * Initialize the conversation toast container
 * @param {HTMLElement} parentElement - Parent element to attach container to
 */
export function initConversationToast(parentElement) {
  if (conversationContainer) return; // Already initialized

  conversationContainer = document.createElement('div');
  conversationContainer.id = 'conversation-toast';
  conversationContainer.className = 'floating-widget';
  conversationContainer.style.cssText = `
    position: fixed;
    top: 50px;
    left: 10px;
    width: 280px;
    max-height: 280px;
    background: rgba(20, 20, 30, 0.95);
    border: 1px solid rgba(100, 100, 120, 0.5);
    border-radius: 8px;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #aabbdd;
    z-index: 600;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
    transition: max-height 0.3s ease, opacity 0.3s ease;
    overflow: hidden;
  `;

  // Header with minimize button (matching other widgets)
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

  // Title with icon
  const title = document.createElement('div');
  title.style.cssText = `
    font-weight: bold;
    font-size: 12px;
    color: #88aacc;
    text-transform: uppercase;
    letter-spacing: 1px;
  `;
  title.innerHTML = '<span style="margin-right: 6px;">💬</span> Conversations';

  // Minimize button (matching other widgets)
  const minimizeButton = document.createElement('button');
  minimizeButton.id = 'conversation-minimize-btn';
  minimizeButton.textContent = '−';
  minimizeButton.title = 'Minimize';
  minimizeButton.style.cssText = `
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

  minimizeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleMinimize();
  });

  // Allow clicking header to toggle
  header.addEventListener('click', toggleMinimize);

  header.appendChild(title);
  header.appendChild(minimizeButton);
  conversationContainer.appendChild(header);

  // Content container
  const contentContainer = document.createElement('div');
  contentContainer.id = 'conversation-content';
  contentContainer.style.cssText = `
    max-height: 220px;
    overflow-y: auto;
    padding: 8px;
    transition: max-height 0.3s ease;
  `;

  conversationContainer.appendChild(contentContainer);
  parentElement.appendChild(conversationContainer);

  // Inject scrollbar styles
  injectConversationStyles();

  // Check for mobile and auto-collapse
  checkMobileBreakpoint();
  window.addEventListener('resize', checkMobileBreakpoint);
}

/**
 * Inject scrollbar styles for conversation widget
 */
function injectConversationStyles() {
  const style = document.createElement('style');
  style.textContent = `
    #conversation-content::-webkit-scrollbar {
      width: 6px;
    }
    #conversation-content::-webkit-scrollbar-track {
      background: rgba(30, 30, 40, 0.5);
    }
    #conversation-content::-webkit-scrollbar-thumb {
      background: rgba(100, 100, 120, 0.5);
      border-radius: 3px;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Apply mobile styling based on breakpoint and minimized state
 * Called after manual toggle and on resize
 */
function applyMobileStyles() {
  if (!conversationContainer) return;

  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;
  const header = conversationContainer.querySelector('div');
  const title = header?.querySelector('div');
  const minimizeBtn = conversationContainer.querySelector('#conversation-minimize-btn');

  // Adjust for mobile: icon-only round button when collapsed
  if (isMobile) {
    if (isMinimized) {
      // Round icon-only button
      conversationContainer.style.width = '44px';
      conversationContainer.style.height = '44px';
      conversationContainer.style.maxHeight = '44px';
      conversationContainer.style.borderRadius = '50%';
      conversationContainer.style.left = '8px';
      conversationContainer.style.top = '50px';
      if (header) {
        header.style.padding = '10px';
        header.style.justifyContent = 'center';
        header.style.borderBottom = 'none';
      }
      if (title) {
        title.innerHTML = '💬';
        title.style.fontSize = '18px';
        title.style.letterSpacing = '0';
      }
      if (minimizeBtn) minimizeBtn.style.display = 'none';
    } else {
      // Expanded on mobile
      conversationContainer.style.width = '260px';
      conversationContainer.style.height = 'auto';
      conversationContainer.style.maxHeight = '280px';
      conversationContainer.style.borderRadius = '8px';
      conversationContainer.style.left = '8px';
      conversationContainer.style.top = '45px';
      if (header) {
        header.style.padding = '10px 12px';
        header.style.justifyContent = 'space-between';
        header.style.borderBottom = '1px solid rgba(100, 100, 120, 0.3)';
      }
      if (title) {
        title.innerHTML = '<span style="margin-right: 6px;">💬</span> Conversations';
        title.style.fontSize = '12px';
        title.style.letterSpacing = '1px';
      }
      if (minimizeBtn) minimizeBtn.style.display = 'flex';
    }
  } else {
    // Desktop: full width panel
    conversationContainer.style.width = '280px';
    conversationContainer.style.height = 'auto';
    conversationContainer.style.borderRadius = '8px';
    conversationContainer.style.left = '10px';
    conversationContainer.style.top = '50px';
    if (header) {
      header.style.padding = '10px 12px';
      header.style.justifyContent = 'space-between';
      header.style.borderBottom = '1px solid rgba(100, 100, 120, 0.3)';
    }
    if (title) {
      title.innerHTML = '<span style="margin-right: 6px;">💬</span> Conversations';
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
  if (!conversationContainer) return;

  const isMobile = window.innerWidth <= MOBILE_BREAKPOINT;

  // Only auto-collapse if we're on mobile and currently expanded
  if (isMobile && !isMinimized) {
    isMinimized = true;
  }

  applyMobileStyles();
}

/**
 * Toggle the minimize state of the conversation toast
 */
function toggleMinimize() {
  if (!conversationContainer) return;

  const contentContainer = conversationContainer.querySelector('#conversation-content');
  const minimizeButton = conversationContainer.querySelector('#conversation-minimize-btn');

  if (isMinimized) {
    // Expand
    contentContainer.style.display = 'block';
    conversationContainer.style.maxHeight = '280px';
    if (minimizeButton) {
      minimizeButton.textContent = '−';
      minimizeButton.title = 'Minimize';
    }
  } else {
    // Collapse
    contentContainer.style.display = 'none';
    conversationContainer.style.maxHeight = '44px';
    if (minimizeButton) {
      minimizeButton.textContent = '+';
      minimizeButton.title = 'Expand';
    }
  }

  isMinimized = !isMinimized;

  // Re-apply mobile styling after toggle
  checkMobileBreakpoint();
}

/**
 * Add a message to the conversation toast
 * @param {string} message - Message to display
 * @param {string} type - Type of message ('speech', 'thought', 'system')
 * @param {object} dwarf - Dwarf involved in conversation (optional)
 */
export function addConversationMessage(message, type = 'speech', dwarf = null) {
  if (!conversationContainer) return;
  
  // Get content container
  const contentContainer = conversationContainer.querySelector('#conversation-content');
  
  // Create message element
  const messageEl = document.createElement('div');
  messageEl.className = `conversation-message message-${type}`;
  
  // Format message based on type
  let formattedMessage = '';
  
  switch (type) {
    case 'speech':
      // Split the message into header and content
      const parts = message.split(': ');
      if (parts.length > 1) {
        const header = parts[0];
        const content = parts.slice(1).join(': ');
        formattedMessage = `<div style="color: #cccc88; font-weight: bold; margin-bottom: 4px; font-size: 10px;">${header}</div><div style="color: #ddddaa;">${content}</div>`;
      } else {
        formattedMessage = message;
      }
      messageEl.style.cssText = `
        margin: 6px 0;
        padding: 8px 10px;
        border-left: 3px solid #aaaa66;
        background: rgba(40, 40, 55, 0.8);
        border-radius: 4px;
        line-height: 1.3;
      `;
      break;
    case 'thought':
      formattedMessage = `<em style="color: #aabbdd;">"${message}"</em>`;
      messageEl.style.cssText = `
        margin: 6px 0;
        padding: 8px 10px;
        border-left: 3px solid #6688aa;
        background: rgba(40, 40, 55, 0.8);
        border-radius: 4px;
        line-height: 1.3;
      `;
      break;
    case 'system':
      formattedMessage = `<span style="color: #88aa66;">${message}</span>`;
      messageEl.style.cssText = `
        margin: 6px 0;
        padding: 8px 10px;
        border-left: 3px solid #88aa66;
        background: rgba(40, 40, 55, 0.8);
        border-radius: 4px;
        line-height: 1.3;
      `;
      break;
    default:
      formattedMessage = message;
      messageEl.style.cssText = `
        margin: 6px 0;
        padding: 8px 10px;
        border-left: 3px solid #6677aa;
        color: #ccccdd;
        background: rgba(40, 40, 55, 0.8);
        border-radius: 4px;
        line-height: 1.3;
      `;
  }
  
  messageEl.innerHTML = formattedMessage;
  
  // Add to container
  contentContainer.appendChild(messageEl);
  
  // Keep track of messages
  conversationMessages.push({
    element: messageEl,
    timestamp: Date.now(),
    type: type
  });
  
  // Remove oldest messages if we exceed the limit
  if (conversationMessages.length > MAX_MESSAGES) {
    const oldest = conversationMessages.shift();
    if (oldest && oldest.element.parentNode) {
      oldest.element.parentNode.removeChild(oldest.element);
    }
  }
  
  // Scroll to bottom
  contentContainer.scrollTop = contentContainer.scrollHeight;
}

/**
 * Add a speech message between dwarves
 * @param {object} speaker - Speaking dwarf
 * @param {object} listener - Listening dwarf (can be null)
 * @param {string} text - Speech text
 */
export function addSpeechMessage(speaker, listener, text) {
  if (!conversationContainer) return;
  
  let message = '';
  if (listener) {
    message = `${speaker.generatedName || speaker.name} -> ${listener.generatedName || listener.name}: ${text}`;
  } else {
    message = `${speaker.generatedName}: ${text}`;
  }
  
  addConversationMessage(message, 'speech', speaker);
}

/**
 * Add a thought message
 * @param {object} dwarf - Dwarf with the thought
 * @param {string} text - Thought text
 */
export function addThoughtMessage(dwarf, text) {
  if (!conversationContainer) return;
  
  const displayName = dwarf.generatedName || dwarf.name;
  const message = `${displayName} thinks: ${text}`;
  addConversationMessage(message, 'thought', dwarf);
}

/**
 * Add a system message
 * @param {string} text - System message text
 */
export function addSystemMessage(text) {
  if (!conversationContainer) return;
  
  addConversationMessage(text, 'system');
}

/**
 * Clear all conversation messages
 */
export function clearConversation() {
  if (!conversationContainer) return;
  
  // Get content container
  const contentContainer = conversationContainer.querySelector('#conversation-content');
  
  // Remove all child elements except the title
  while (contentContainer.children.length > 0) {
    contentContainer.removeChild(contentContainer.lastChild);
  }
  
  conversationMessages = [];
}

/**
 * Update the conversation toast (call each frame)
 */
export function updateConversationToast() {
  if (!conversationContainer) return;

  const contentContainer = conversationContainer.querySelector('#conversation-content');
  // Keep scroll pinned to bottom
  contentContainer.scrollTop = contentContainer.scrollHeight;
}