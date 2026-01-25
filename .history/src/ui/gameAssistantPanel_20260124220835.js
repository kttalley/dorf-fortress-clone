/**
 * Game Assistant Panel - Chat UI for fortress analysis
 * Read-only conversational interface powered by LLM with fallback heuristics
 */

import { askGame, clearHistory, getHistory } from '../llm/gameAssistant.js';
import { EXAMPLE_QUESTIONS } from '../llm/prompts/gameAssistant.js';

/**
 * Initialize the game assistant chat panel
 * @param {HTMLElement} containerEl - Container to attach panel to
 * @param {function} getWorld - Function that returns current world state
 * @param {object} scenarioContext - Optional scenario data (title, description, parameters, victoryConditions)
 * @returns {object} Panel controller with show(), hide(), toggle()
 */
export function initGameAssistant(containerEl, getWorld, scenarioContext = null) {
  // Create main panel
  const panelEl = document.createElement('div');
  panelEl.className = 'game-assistant-panel';
  panelEl.style.cssText = `
    position: fixed;
    left: 10px;
    bottom: 110px;
    width: 340px;
    max-height: 480px;
    background: rgba(15, 15, 20, 0.95);
    border: 1px solid rgba(100, 100, 120, 0.5);
    border-radius: 6px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #ddd;
    z-index: 999;
    display: flex;
    flex-direction: column;
    opacity: 0;
    pointer-events: none;
    transition: opacity 200ms ease, transform 200ms ease;
    transform: translateY(10px);
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(4px);
  `;

  // Mobile adjustments for panel
  function checkPanelMobile() {
    const isMobile = window.innerWidth <= 728;
    if (isMobile) {
      panelEl.style.width = '280px';
      panelEl.style.left = '8px';
      panelEl.style.bottom = '100px';
      panelEl.style.maxHeight = '400px';
    } else {
      panelEl.style.width = '340px';
      panelEl.style.left = '10px';
      panelEl.style.bottom = '110px';
      panelEl.style.maxHeight = '480px';
    }
  }

  checkPanelMobile();
  window.addEventListener('resize', checkPanelMobile);

  // Header
  const headerEl = document.createElement('div');
  headerEl.style.cssText = `
    padding: 10px 12px;
    border-bottom: 1px solid rgba(100, 100, 120, 0.3);
    display: flex;
    justify-content: space-between;
    align-items: center;
  `;
  headerEl.innerHTML = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <span style="color: #4aff9e;">🤖</span>
      <span style="font-weight: bold; color: #fff;">Chat with the game engine</span>
    </div>
    <div style="display: flex; gap: 8px;">
      <button class="info-btn" title="How it works" style="
        background: none;
        border: 1px solid rgba(100, 100, 120, 0.5);
        color: #888;
        width: 22px;
        height: 22px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 12px;
      ">i</button>
      <button class="close-btn" style="
        background: none;
        border: 1px solid rgba(100, 100, 120, 0.5);
        color: #888;
        width: 22px;
        height: 22px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 14px;
      ">×</button>
    </div>
  `;

  // Message list
  const messagesEl = document.createElement('div');
  messagesEl.className = 'messages';
  messagesEl.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    min-height: 200px;
    max-height: 320px;
  `;

  // Example questions (shown when empty)
  const examplesEl = document.createElement('div');
  examplesEl.className = 'examples';
  examplesEl.style.cssText = `
    padding: 8px 0;
  `;
  examplesEl.innerHTML = `
    <div style="color: #666; margin-bottom: 8px; font-size: 11px;">Try asking:</div>
    ${EXAMPLE_QUESTIONS.slice(0, 5).map(q => `
      <button class="example-q" style="
        display: block;
        width: 100%;
        text-align: left;
        background: rgba(50, 50, 60, 0.4);
        border: 1px solid rgba(100, 100, 120, 0.3);
        border-radius: 4px;
        padding: 6px 10px;
        margin: 4px 0;
        color: #aaa;
        font-family: inherit;
        font-size: 11px;
        cursor: pointer;
        transition: background 150ms;
      ">${q}</button>
    `).join('')}
  `;
  messagesEl.appendChild(examplesEl);

  // Input area
  const inputAreaEl = document.createElement('div');
  inputAreaEl.style.cssText = `
    padding: 10px 12px;
    border-top: 1px solid rgba(100, 100, 120, 0.3);
  `;
  inputAreaEl.innerHTML = `
    <div style="display: flex; gap: 8px;">
      <input type="text" placeholder="Ask about your fortress..." style="
        flex: 1;
        background: rgba(30, 30, 40, 0.8);
        border: 1px solid rgba(100, 100, 120, 0.4);
        border-radius: 4px;
        padding: 8px 10px;
        color: #ddd;
        font-family: inherit;
        font-size: 12px;
        outline: none;
      " />
      <button class="send-btn" style="
        background: rgba(74, 158, 255, 0.2);
        border: 1px solid rgba(74, 158, 255, 0.5);
        border-radius: 4px;
        padding: 8px 12px;
        color: #4a9eff;
        font-family: inherit;
        font-size: 12px;
        cursor: pointer;
        transition: background 150ms;
      ">Ask</button>
    </div>
    <div style="
      margin-top: 8px;
      font-size: 10px;
      color: #555;
      text-align: center;
    ">Read-only analysis • No game commands</div>
  `;

  // Info modal (hidden by default)
  const infoModalEl = document.createElement('div');
  infoModalEl.className = 'info-modal';
  infoModalEl.style.cssText = `
    position: absolute;
    top: 40px;
    left: 12px;
    right: 12px;
    background: rgba(25, 25, 35, 0.98);
    border: 1px solid rgba(100, 100, 120, 0.5);
    border-radius: 6px;
    padding: 16px;
    z-index: 10;
    display: none;
    max-height: 600px;
    overflow-y: auto;
  `;
  infoModalEl.innerHTML = `

  <div style="font-weight: bold; color: #fff; margin-bottom: 10px; font-size: 13px;">About this project:</div>

  <p style="margin: 0 0 10px;">an agent-based simulation inspired by Dwarf Fortress emphasizing emergent storytelling through mechanics.</p>
  
  <p style="margin: 0 0 10px;"><strong style="color: #88aacc;">Built by:</strong> Kristian Talley.</p>
      
    <p style="margin-top: 4px; color: #666; font-size: 10px;">Uses LLM when available, falls back to heuristics offline. Dwarf Fortress and all related creative and intellectual property are property of Bay12 Games</p>  
  
  

    <div style="color: #aaa; font-size: 11px; line-height: 1.6;">
      <p style="margin: 0 0 10px;"><strong style="color: #4aff9e;">📊 Colony Analysis:</strong><br/>
      Analyzes your fortress's state and answers questions about dwarves, resources, and relationships. Identifies trends and potential issues.</p>
      
      <p style="margin: 0 0 10px;"><strong style="color: #4aff9e;">🌍 World Context:</strong><br/>
      Understands the current biome, world history, historical events, and inter-racial relations (dwarves, humans, goblins, elves).</p>
      
      <p style="margin: 0 0 10px;"><strong style="color: #4aff9e;">🏗️ Architecture & Design:</strong><br/>
      Can explain how the simulation works, the project's design philosophy (simulation-first, emergent behavior), tech stack (JS/Vite/Ollama), and world generation systems.</p>
      
      <p style="margin: 0 0 10px;"><strong style="color: #ff9e4a;">What it won't do:</strong><br/>
      • Suggest game commands<br/>
      • Tell you what actions to take<br/>
      • Modify the game state</p>
      
      
    </div>
    <button class="close-info" style="
      margin-top: 12px;
      background: rgba(100, 100, 120, 0.3);
      border: 1px solid rgba(100, 100, 120, 0.4);
      border-radius: 4px;
      padding: 6px 12px;
      color: #aaa;
      font-family: inherit;
      font-size: 11px;
      cursor: pointer;
    ">Got it</button>
  `;

  // Assemble panel
  panelEl.appendChild(headerEl);
  panelEl.appendChild(messagesEl);
  panelEl.appendChild(inputAreaEl);
  panelEl.appendChild(infoModalEl);
  containerEl.appendChild(panelEl);

  // State
  let isVisible = false;
  let isLoading = false;

  // Get elements
  const inputEl = inputAreaEl.querySelector('input');
  const sendBtn = inputAreaEl.querySelector('.send-btn');
  const closeBtn = headerEl.querySelector('.close-btn');
  const infoBtn = headerEl.querySelector('.info-btn');
  const closeInfoBtn = infoModalEl.querySelector('.close-info');
  const exampleBtns = examplesEl.querySelectorAll('.example-q');

  /**
   * Render a message in the chat
   */
  function renderMessage(role, content, source = null) {
    // Hide examples after first message
    if (examplesEl.style.display !== 'none') {
      examplesEl.style.display = 'none';
    }

    const msgEl = document.createElement('div');
    msgEl.style.cssText = `
      margin: 8px 0;
      padding: 10px;
      border-radius: 6px;
      ${role === 'user'
        ? 'background: rgba(74, 158, 255, 0.15); border: 1px solid rgba(74, 158, 255, 0.3); margin-left: 20px;'
        : 'background: rgba(50, 50, 60, 0.5); border: 1px solid rgba(100, 100, 120, 0.3); margin-right: 20px;'}
    `;

    const labelColor = role === 'user' ? '#4a9eff' : '#4aff9e';
    const label = role === 'user' ? 'You' : 'Analyst';

    msgEl.innerHTML = `
      <div style="font-size: 10px; color: ${labelColor}; margin-bottom: 4px;">
        ${label}
        ${source === 'fallback' ? '<span style="color: #666; margin-left: 6px;">(offline)</span>' : ''}
      </div>
      <div style="line-height: 1.4; white-space: pre-wrap;">${escapeHtml(content)}</div>
    `;

    messagesEl.appendChild(msgEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  /**
   * Render loading indicator
   */
  function renderLoading() {
    const loadingEl = document.createElement('div');
    loadingEl.className = 'loading-msg';
    loadingEl.style.cssText = `
      margin: 8px 0;
      padding: 10px;
      background: rgba(50, 50, 60, 0.5);
      border: 1px solid rgba(100, 100, 120, 0.3);
      border-radius: 6px;
      margin-right: 20px;
      color: #888;
    `;
    loadingEl.innerHTML = `
      <div style="font-size: 10px; color: #4aff9e; margin-bottom: 4px;">Analyst</div>
      <div style="animation: pulse 1s infinite;">Analyzing fortress data...</div>
    `;

    messagesEl.appendChild(loadingEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;

    return loadingEl;
  }

  /**
   * Send a question
   */
  async function sendQuestion(question) {
    if (!question.trim() || isLoading) return;

    const q = question.trim();
    inputEl.value = '';

    // Render user message
    renderMessage('user', q);

    // Show loading
    isLoading = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '...';
    const loadingEl = renderLoading();

    try {
      const world = getWorld();
      const result = await askGame(q, world, null, scenarioContext);

      // Remove loading
      loadingEl.remove();

      // Render response
      renderMessage('assistant', result.response, result.source);
    } catch (err) {
      loadingEl.remove();
      renderMessage('assistant', 'ANALYSIS: Unable to process request. Please try again.', 'fallback');
      console.error('[GameAssistant] Error:', err);
    } finally {
      isLoading = false;
      sendBtn.disabled = false;
      sendBtn.textContent = 'Ask';
    }
  }

  /**
   * Escape HTML for safe rendering
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Event handlers
  sendBtn.addEventListener('click', () => sendQuestion(inputEl.value));

  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendQuestion(inputEl.value);
    }
  });

  closeBtn.addEventListener('click', () => {
    controller.hide();
  });

  infoBtn.addEventListener('click', () => {
    infoModalEl.style.display = infoModalEl.style.display === 'none' ? 'block' : 'none';
  });

  closeInfoBtn.addEventListener('click', () => {
    infoModalEl.style.display = 'none';
  });

  // Example question buttons
  exampleBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      sendQuestion(btn.textContent);
    });

    btn.addEventListener('mouseenter', () => {
      btn.style.background = 'rgba(74, 158, 255, 0.2)';
    });

    btn.addEventListener('mouseleave', () => {
      btn.style.background = 'rgba(50, 50, 60, 0.4)';
    });
  });

  // Controller
  const controller = {
    /**
     * Show the panel
     */
    show() {
      isVisible = true;
      panelEl.style.opacity = '1';
      panelEl.style.pointerEvents = 'auto';
      panelEl.style.transform = 'translateY(0)';
      inputEl.focus();
    },

    /**
     * Hide the panel
     */
    hide() {
      isVisible = false;
      panelEl.style.opacity = '0';
      panelEl.style.pointerEvents = 'none';
      panelEl.style.transform = 'translateY(10px)';
      infoModalEl.style.display = 'none';
    },

    /**
     * Toggle visibility
     */
    toggle() {
      if (isVisible) {
        this.hide();
      } else {
        this.show();
      }
    },

    /**
     * Check if visible
     */
    isVisible() {
      return isVisible;
    },

    /**
     * Clear chat history
     */
    clearChat() {
      clearHistory();
      // Remove all messages except examples
      const messages = messagesEl.querySelectorAll('div:not(.examples)');
      messages.forEach(m => m.remove());
      examplesEl.style.display = 'block';
    },

    /**
     * Destroy panel
     */
    destroy() {
      panelEl.remove();
    },
  };

  return controller;
}

/**
 * Create a toggle button for the game assistant
 * @param {HTMLElement} containerEl - Container for button
 * @param {object} assistantController - Controller from initGameAssistant
 * @returns {HTMLElement} The button element
 */
export function createAssistantToggle(containerEl, assistantController) {
  const btnEl = document.createElement('button');
  btnEl.className = 'assistant-toggle';
  btnEl.id = 'assistant-toggle-btn';
  btnEl.title = 'Ask the Game (?)';
  btnEl.style.cssText = `
    position: fixed;
    left: 10px;
    bottom: 64px;
    padding: 8px 14px;
    height: 40px;
    background: rgba(15, 15, 20, 0.95);
    border: 1px solid rgba(74, 158, 255, 0.5);
    border-radius: 6px;
    color: #4a9eff;
    font-family: 'Courier New', monospace;
    font-size: 11px;
    font-weight: bold;
    cursor: pointer;
    z-index: 700;
    transition: background 150ms, transform 150ms, border-color 150ms;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(4px);
  `;
  btnEl.textContent = '🤖 Chat with the game engine';

  // Ensure visibility on mobile
  function checkMobileVisibility() {
    const isMobile = window.innerWidth <= 728;
    if (isMobile) {
      btnEl.style.left = '8px';
      btnEl.style.bottom = '60px';
      btnEl.style.fontSize = '10px';
      btnEl.style.padding = '6px 10px';
      btnEl.style.height = '36px';
    } else {
      btnEl.style.left = '10px';
      btnEl.style.bottom = '64px';
      btnEl.style.fontSize = '11px';
      btnEl.style.padding = '8px 14px';
      btnEl.style.height = '40px';
    }
  }

  checkMobileVisibility();
  window.addEventListener('resize', checkMobileVisibility);

  btnEl.addEventListener('click', () => {
    assistantController.toggle();
    // Hide button when panel is shown
    btnEl.style.display = assistantController.isVisible() ? 'none' : 'flex';
  });

  btnEl.addEventListener('mouseenter', () => {
    btnEl.style.background = 'rgba(15, 15, 20, 0.95)';
    btnEl.style.transform = 'scale(1.05)';
  });

  btnEl.addEventListener('mouseleave', () => {
    btnEl.style.background = 'rgba(15, 15, 20, 0.95)';
    btnEl.style.transform = 'scale(1)';
  });

  containerEl.appendChild(btnEl);

  // Update button visibility when panel closes
  const originalHide = assistantController.hide.bind(assistantController);
  assistantController.hide = function() {
    originalHide();
    btnEl.style.display = 'flex';
  };

  return btnEl;
}
