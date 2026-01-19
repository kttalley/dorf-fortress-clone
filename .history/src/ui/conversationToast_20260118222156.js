/**
 * Conversation toast container - displays conversation thread between dwarves
 */

// Container for conversation messages
let conversationContainer = null;
let conversationMessages = [];
const MAX_MESSAGES = 50; // Limit messages to prevent memory issues

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
    bottom: 10px;
    right: 10px;
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
  
  // Add title
  const title = document.createElement('div');
  title.textContent = 'Conversation Log';
  title.style.cssText = `
    font-weight: bold;
    font-size: 12px;
    color: #88aacc;
    margin-bottom: 4px;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 1px solid #6688aa;
    padding-bottom: 2px;
  `;
  
  conversationContainer.appendChild(title);
  
  parentElement.appendChild(conversationContainer);
}

/**
 * Add a message to the conversation toast
 * @param {string} message - Message to display
 * @param {string} type - Type of message ('speech', 'thought', 'system')
 * @param {object} dwarf - Dwarf involved in conversation (optional)
 */
export function addConversationMessage(message, type = 'speech', dwarf = null) {
  if (!conversationContainer) return;
  
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
  conversationContainer.appendChild(messageEl);
  
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
  conversationContainer.scrollTop = conversationContainer.scrollHeight;
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
  
  // Remove all child elements except the title
  while (conversationContainer.children.length > 1) {
    conversationContainer.removeChild(conversationContainer.lastChild);
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