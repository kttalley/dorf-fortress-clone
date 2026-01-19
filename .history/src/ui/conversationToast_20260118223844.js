/**
 * Conversation toast container - displays conversation thread between dwarves
 */

// Container for conversation messages
let conversationContainer = null;
let conversationMessages = [];
const MAX_MESSAGES = 50; // Limit messages to prevent memory issues
let isMinimized = false;

/**
 * Initialize the conversation toast container
 * @param {HTMLElement} parentElement - Parent element to attach container to
 */
export function initConversationToast(parentElement) {
  if (conversationContainer) return; // Already initialized
  
  conversationContainer = document.createElement('div');
  conversationContainer.id = 'conversation-toast';
  conversationContainer.style.cssText = `
    position: fixed;
    top: 10px;
    left: 10px;
    width: 300px;
    max-height: 200px;
    background: rgba(20, 20, 30, 0.95);
    border: 1px solid #6688aa;
    border-radius: 8px;
    padding: 8px;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    color: #aabbdd;
    z-index: 1000;
    overflow-y: auto;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
    animation: fadeIn 0.3s ease-out;
  `;
  
  // Add scroll bar styling
  conversationContainer.style.cssText += `
    scrollbar-width: thin;
    scrollbar-color: #6688aa #151520;
  `;
  
  conversationContainer.style.cssText += `
    &::-webkit-scrollbar {
      width: 6px;
    }
    &::-webkit-scrollbar-track {
      background: #151520;
    }
    &::-webkit-scrollbar-thumb {
      background-color: #6688aa;
      border-radius: 3px;
    }
  `;
  
  // Add title container
  const titleContainer = document.createElement('div');
  titleContainer.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
  `;
  
  // Add title
  const title = document.createElement('div');
  title.textContent = 'Conversation Log';
  title.style.cssText = `
    font-weight: bold;
    font-size: 12px;
    color: #88aacc;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1px solid #6688aa;
    padding-bottom: 2px;
  `;
  
  // Add minimize button
  const minimizeButton = document.createElement('button');
  minimizeButton.textContent = '−';
  minimizeButton.title = 'Minimize';
  minimizeButton.style.cssText = `
    background: rgba(60, 60, 80, 0.8);
    border: 1px solid #6688aa;
    border-radius: 4px;
    color: #88aacc;
    font-size: 12px;
    width: 20px;
    height: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
  `;
  
  minimizeButton.addEventListener('click', toggleMinimize);
  
  titleContainer.appendChild(title);
  titleContainer.appendChild(minimizeButton);
  
  conversationContainer.appendChild(titleContainer);
  
  // Add content container
  const contentContainer = document.createElement('div');
  contentContainer.id = 'conversation-content';
  contentContainer.style.cssText = `
    max-height: 170px;
    overflow-y: auto;
  `;
  
  conversationContainer.appendChild(contentContainer);
  
  parentElement.appendChild(conversationContainer);
}

/**
 * Toggle the minimize state of the conversation toast
 */
function toggleMinimize() {
  if (!conversationContainer) return;
  
  const contentContainer = conversationContainer.querySelector('#conversation-content');
  const minimizeButton = conversationContainer.querySelector('button');
  
  if (isMinimized) {
    // Maximize
    contentContainer.style.display = 'block';
    minimizeButton.textContent = '−';
    minimizeButton.title = 'Minimize';
    conversationContainer.style.height = '200px';
    conversationContainer.style.maxHeight = '200px';
  } else {
    // Minimize
    contentContainer.style.display = 'none';
    minimizeButton.textContent = '+';
    minimizeButton.title = 'Maximize';
    conversationContainer.style.height = '30px';
    conversationContainer.style.maxHeight = '30px';
  }
  
  isMinimized = !isMinimized;
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
  const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  
  switch (type) {
    case 'speech':
      formattedMessage = `[${timestamp}] ${dwarf ? dwarf.name + ': ' : ''}${message}`;
      messageEl.style.cssText = `
        margin: 3px 0;
        padding: 2px 4px;
        border-left: 2px solid #aaaa66;
        color: #ddddaa;
      `;
      break;
    case 'thought':
      formattedMessage = `[${timestamp}] ${dwarf ? dwarf.name + ' thinks: ' : ''}${message}`;
      messageEl.style.cssText = `
        margin: 3px 0;
        padding: 2px 4px;
        border-left: 2px solid #6688aa;
        color: #aabbdd;
        font-style: italic;
      `;
      break;
    case 'system':
      formattedMessage = `[${timestamp}] ${message}`;
      messageEl.style.cssText = `
        margin: 3px 0;
        padding: 2px 4px;
        border-left: 2px solid #88aa66;
        color: #88aa66;
      `;
      break;
    default:
      formattedMessage = `[${timestamp}] ${message}`;
      messageEl.style.cssText = `
        margin: 3px 0;
        padding: 2px 4px;
        color: #ddddaa;
      `;
  }
  
  messageEl.textContent = formattedMessage;
  
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
    message = `${speaker.name} speaks to ${listener.name}: ${text}`;
  } else {
    message = `${speaker.name}: ${text}`;
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
  
  const message = `${dwarf.name} thinks: ${text}`;
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
  // This function can be extended for any dynamic updates
  // Currently, it's mainly for future expansion
}