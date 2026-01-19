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
    overflow-y: none;
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
  
  switch (type) {
    case 'speech':
      // Split the message into header and content
      const parts = message.split(': ');
      if (parts.length > 1) {
        const header = parts[0];
        const content = parts.slice(1).join(': ');
        formattedMessage = `<strong>${header}</strong><br>${content}`;
      } else {
        formattedMessage = message;
      }
      messageEl.style.cssText = `
        margin: 8px 0;
        padding: 10px 12px;
        border-left: 3px solid #aaaa66;
        color: #ddddaa;
        background: rgba(50, 50, 60, 0.8);
        border-radius: 6px;
        line-height: 1.4;
      `;
      break;
    case 'thought':
      formattedMessage = `<em>(${message})</em>`;
      messageEl.style.cssText = `
        margin: 8px 0;
        padding: 10px 12px;
        border-left: 3px solid #6688aa;
        color: #aabbdd;
        font-style: italic;
        background: rgba(50, 50, 60, 0.8);
        border-radius: 6px;
        line-height: 1.4;
      `;
      break;
    case 'system':
      formattedMessage = `> ${message}`;
      messageEl.style.cssText = `
        margin: 8px 0;
        padding: 10px 12px;
        border-left: 3px solid #88aa66;
        color: #88aa66;
        background: rgba(50, 50, 60, 0.8);
        border-radius: 6px;
        line-height: 1.4;
      `;
      break;
    default:
      formattedMessage = message;
      messageEl.style.cssText = `
        margin: 8px 0;
        padding: 10px 12px;
        color: #ddddaa;
        background: rgba(50, 50, 60, 0.8);
        border-radius: 6px;
        line-height: 1.4;
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
  if (!conversationContainer) return;

  const contentContainer = conversationContainer.querySelector('#conversation-content');
  // Keep scroll pinned to bottom
  contentContainer.scrollTop = contentContainer.scrollHeight;
}