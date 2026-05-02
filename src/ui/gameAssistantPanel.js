/**
 * Game Assistant Panel - Chat UI for fortress analysis
 * Read-only conversational interface powered by LLM with fallback heuristics
 * Renders as a large centered modal popover with markdown support.
 */

import { askGame, clearHistory, getHistory } from '../llm/gameAssistant.js';
import { EXAMPLE_QUESTIONS } from '../llm/prompts/gameAssistant.js';

// Minimal markdown renderer (safe: escapes HTML first)
function renderMarkdown(text) {
  if (!text) return '';
  let h = text
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  h = h.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  h = h.replace(/(?<![*])\*([^*\n]+)\*(?![*])/g, '<em>$1</em>');
  h = h.replace(/`([^`\n]+)`/g, '<code style="background:rgba(255,255,255,0.1);padding:1px 5px;border-radius:3px;font-size:0.88em">$1</code>');
  h = h.replace(/^###\s+(.+)$/gm, '<strong style="color:#ccc">$1</strong>');
  h = h.replace(/^##\s+(.+)$/gm, '<strong style="font-size:1.05em;color:#ddd">$1</strong>');
  h = h.replace(/^[-*]\s+(.+)$/gm, '&nbsp;&nbsp;• $1');
  h = h.replace(/\n\n+/g, '<br><br>');
  h = h.replace(/\n/g, '<br>');
  return h;
}

/**
 * Initialize the game assistant chat panel
 * @param {HTMLElement} containerEl - Unused; panel attaches to document.body
 * @param {function} getWorld - Function that returns current world state
 * @param {object} scenarioContext - Optional scenario data
 * @returns {object} Panel controller with show(), hide(), toggle()
 */
export function initGameAssistant(containerEl, getWorld, scenarioContext = null) {
  // Backdrop
  const backdropEl = document.createElement('div');
  backdropEl.className = 'popover-backdrop';
  document.body.appendChild(backdropEl);

  // Panel — centered modal popover (same UI as entity chat)
  const panelEl = document.createElement('div');
  panelEl.className = 'game-assistant-panel';
  panelEl.style.cssText = `
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%) scale(0.96);
    width: min(380px, 92vw);
    max-height: 82vh;
    background: rgba(12, 12, 18, 0.98);
    border: 1px solid rgba(100, 100, 120, 0.4);
    border-radius: 10px;
    font-family: 'Courier New', monospace;
    font-size: 14px;
    color: #ddd;
    display: flex;
    flex-direction: column;
    opacity: 0;
    pointer-events: none;
    transition: opacity 220ms ease, transform 220ms ease;
    box-shadow: 0 16px 56px rgba(0, 0, 0, 0.9);
    backdrop-filter: blur(8px);
  `;
  document.body.appendChild(panelEl);

  // Header
  const headerEl = document.createElement('div');
  headerEl.style.cssText = `
    padding: 12px 14px;
    border-bottom: 1px solid rgba(100, 100, 120, 0.3);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  `;
  headerEl.innerHTML = `
    <div style="display:flex;align-items:center;gap:8px;">
      <span style="color:#4aff9e">🤖</span>
      <span style="font-weight:bold;color:#fff">Chat with the game engine</span>
    </div>
    <div style="display:flex;gap:8px;">
      <button class="info-btn" title="About" style="
        background:none;border:1px solid rgba(100,100,120,0.5);
        color:#888;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:12px;
      ">i</button>
      <button class="close-btn" style="
        background:none;border:1px solid rgba(100,100,120,0.5);
        color:#888;width:24px;height:24px;border-radius:4px;cursor:pointer;font-size:20px;line-height:1;
      ">×</button>
    </div>
  `;

  // Message list
  const messagesEl = document.createElement('div');
  messagesEl.className = 'messages';
  messagesEl.style.cssText = `
    flex: 1;
    overflow-y: auto;
    padding: 10px 12px;
    min-height: 120px;
  `;

  // Example questions (shown when empty)
  const examplesEl = document.createElement('div');
  examplesEl.className = 'examples';
  examplesEl.style.cssText = 'padding: 4px 0;';
  examplesEl.innerHTML = `
    <div style="color:#666;margin-bottom:10px;font-size:14px;">Try asking:</div>
    ${EXAMPLE_QUESTIONS.slice(0, 5).map(q => `
      <button class="example-q" style="
        display:block;width:100%;text-align:left;
        background:rgba(50,50,60,0.4);border:1px solid rgba(100,100,120,0.3);
        border-radius:4px;padding:7px 12px;margin:5px 0;color:#aaa;
        font-family:inherit;font-size:14px;cursor:pointer;transition:background 150ms;
      ">${q}</button>
    `).join('')}
  `;
  messagesEl.appendChild(examplesEl);

  // Input area
  const inputAreaEl = document.createElement('div');
  inputAreaEl.style.cssText = `
    padding: 12px 14px;
    border-top: 1px solid rgba(100, 100, 120, 0.3);
    flex-shrink: 0;
  `;
  inputAreaEl.innerHTML = `
    <div style="display:flex;gap:8px;">
      <input type="text" placeholder="Ask about your fortress..." style="
        flex:1;background:rgba(30,30,40,0.8);border:1px solid rgba(100,100,120,0.4);
        border-radius:4px;padding:9px 12px;color:#ddd;font-family:inherit;font-size:16px;outline:none;
      " />
      <button class="send-btn" style="
        background:rgba(74,158,255,0.2);border:1px solid rgba(74,158,255,0.5);
        border-radius:4px;padding:9px 14px;color:#4a9eff;font-family:inherit;
        font-size:15px;cursor:pointer;transition:background 150ms;white-space:nowrap;
      ">Ask</button>
    </div>
    <div style="margin-top:8px;font-size:13px;color:#555;text-align:center;">
      Read-only analysis • No game commands
    </div>
  `;

  // Info modal (absolute within panel)
  const infoModalEl = document.createElement('div');
  infoModalEl.className = 'info-modal';
  infoModalEl.style.cssText = `
    position: absolute;
    top: 48px;
    left: 14px;
    right: 14px;
    background: rgba(18, 18, 28, 0.99);
    border: 1px solid rgba(100, 100, 120, 0.5);
    border-radius: 6px;
    padding: 16px;
    display: none;
    max-height: 70vh;
    overflow-y: auto;
  `;
  infoModalEl.innerHTML = `
    <div style="font-weight:bold;color:#fff;margin-bottom:10px;font-size:16px;">About this project</div>
    <p style="margin:0 0 10px">An agent-based simulation inspired by Dwarf Fortress emphasising emergent storytelling.</p>
    <p style="margin:0 0 10px"><strong style="color:#88aacc">Built by:</strong> Kristian Talley.</p>
    <div style="color:#aaa;font-size:14px;line-height:1.6;">
      <p style="margin:0 0 10px"><strong style="color:#4aff9e">📊 Fortress Analysis:</strong><br/>
      Analyses your fortress's state and answers questions about dwarves, resources, and relationships.</p>
      <p style="margin:0 0 10px"><strong style="color:#4aff9e">🌍 World Context:</strong><br/>
      Understands the current biome, world history, and inter-racial relations.</p>
      <p style="margin:0 0 10px"><strong style="color:#ff9e4a">What it won't do:</strong><br/>
      Suggest game commands • Tell you what actions to take • Modify the game state</p>
    </div>
    <p style="color:#666;font-size:13px">Uses LLM when available, heuristics offline. Dwarf Fortress IP belongs to Bay12 Games.</p>
    <button class="close-info" style="
      margin-top:12px;background:rgba(100,100,120,0.3);border:1px solid rgba(100,100,120,0.4);
      border-radius:4px;padding:6px 14px;color:#aaa;font-family:inherit;font-size:14px;cursor:pointer;
    ">Got it</button>
  `;

  panelEl.appendChild(headerEl);
  panelEl.appendChild(messagesEl);
  panelEl.appendChild(inputAreaEl);
  panelEl.appendChild(infoModalEl);

  // State
  let isVisible = false;
  let isLoading = false;

  const inputEl = inputAreaEl.querySelector('input');
  const sendBtn = inputAreaEl.querySelector('.send-btn');
  const closeBtn = headerEl.querySelector('.close-btn');
  const infoBtn = headerEl.querySelector('.info-btn');
  const closeInfoBtn = infoModalEl.querySelector('.close-info');
  const exampleBtns = examplesEl.querySelectorAll('.example-q');

  /**
   * Typewriter reveal with markdown rendered at completion.
   */
  function typeOut(targetEl, text) {
    return new Promise((resolve) => {
      const baseDelay = text.length > 400 ? 3 : text.length > 200 ? 5 : 8;
      let i = 0;
      const cursorEl = document.createElement('span');
      cursorEl.textContent = '▍';
      cursorEl.style.cssText = 'opacity:0.7;margin-left:1px';
      targetEl.textContent = '';
      targetEl.style.whiteSpace = 'pre-wrap';
      targetEl.appendChild(cursorEl);

      const wasAtBottom = () =>
        messagesEl.scrollHeight - messagesEl.scrollTop - messagesEl.clientHeight < 24;
      let stickToBottom = true;
      const onScroll = () => { stickToBottom = wasAtBottom(); };
      messagesEl.addEventListener('scroll', onScroll);

      const step = () => {
        if (i >= text.length) {
          cursorEl.remove();
          messagesEl.removeEventListener('scroll', onScroll);
          // Switch to markdown HTML on completion
          targetEl.style.whiteSpace = '';
          targetEl.innerHTML = renderMarkdown(text);
          if (stickToBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
          resolve();
          return;
        }
        const chunk = Math.min(text.length - i, 5);
        cursorEl.before(document.createTextNode(text.slice(i, i + chunk)));
        i += chunk;
        if (stickToBottom) messagesEl.scrollTop = messagesEl.scrollHeight;
        setTimeout(step, baseDelay);
      };
      step();
    });
  }

  /**
   * Render a message bubble. Assistant messages use markdown + optional typewriter.
   */
  function renderMessage(role, content, source = null, { typewriter = false } = {}) {
    if (examplesEl.style.display !== 'none') examplesEl.style.display = 'none';

    const msgEl = document.createElement('div');
    msgEl.style.cssText = `
      margin: 8px 0;
      padding: 10px 12px;
      border-radius: 6px;
      ${role === 'user'
        ? 'background:rgba(74,158,255,0.15);border:1px solid rgba(74,158,255,0.3);margin-left:20px;'
        : 'background:rgba(50,50,60,0.5);border:1px solid rgba(100,100,120,0.3);margin-right:20px;'}
    `;

    const labelColor = role === 'user' ? '#4a9eff' : '#4aff9e';
    const label = role === 'user' ? 'You' : 'Analyst';

    msgEl.innerHTML = `
      <div style="font-size:13px;color:${labelColor};margin-bottom:4px;">
        ${label}${source === 'fallback' ? '<span style="color:#666;margin-left:6px">(offline)</span>' : ''}
      </div>
      <div class="msg-body" style="line-height:1.5;"></div>
    `;

    const bodyEl = msgEl.querySelector('.msg-body');
    messagesEl.appendChild(msgEl);
    requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });

    if (!typewriter || role === 'user') {
      if (role === 'user') {
        bodyEl.textContent = content;
      } else {
        bodyEl.innerHTML = renderMarkdown(content);
      }
      requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
      return Promise.resolve();
    }

    return typeOut(bodyEl, content);
  }

  function renderLoading() {
    const loadingEl = document.createElement('div');
    loadingEl.className = 'loading-msg';
    loadingEl.style.cssText = `
      margin: 8px 0;
      padding: 10px 12px;
      background: rgba(50,50,60,0.5);
      border: 1px solid rgba(100,100,120,0.3);
      border-radius: 6px;
      margin-right: 20px;
      color: #888;
    `;
    loadingEl.innerHTML = `
      <div style="font-size:13px;color:#4aff9e;margin-bottom:4px;">Analyst</div>
      <div style="animation:pulse 1s infinite">Analysing fortress data...</div>
    `;
    messagesEl.appendChild(loadingEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
    return loadingEl;
  }

  async function sendQuestion(question) {
    if (!question.trim() || isLoading) return;
    const q = question.trim();
    inputEl.value = '';
    renderMessage('user', q);
    isLoading = true;
    sendBtn.disabled = true;
    sendBtn.textContent = '...';
    const loadingEl = renderLoading();

    try {
      const world = getWorld();
      const result = await askGame(q, world, null, scenarioContext);
      loadingEl.remove();
      await renderMessage('assistant', result.response, result.source, { typewriter: true });
    } catch (err) {
      loadingEl.remove();
      await renderMessage('assistant', 'Unable to process request. Please try again.', 'fallback', { typewriter: true });
      console.error('[GameAssistant] Error:', err);
    } finally {
      isLoading = false;
      sendBtn.disabled = false;
      sendBtn.textContent = 'Ask';
      requestAnimationFrame(() => { messagesEl.scrollTop = messagesEl.scrollHeight; });
    }
  }

  // Events
  sendBtn.addEventListener('click', () => sendQuestion(inputEl.value));
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendQuestion(inputEl.value); }
  });
  closeBtn.addEventListener('click', () => controller.hide());
  infoBtn.addEventListener('click', () => {
    infoModalEl.style.display = infoModalEl.style.display === 'none' ? 'block' : 'none';
  });
  closeInfoBtn.addEventListener('click', () => { infoModalEl.style.display = 'none'; });

  exampleBtns.forEach(btn => {
    btn.addEventListener('click', () => sendQuestion(btn.textContent));
    btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(74,158,255,0.2)'; });
    btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(50,50,60,0.4)'; });
  });

  const controller = {
    /** Called before showing to allow other popovers to close first. */
    onBeforeShow: null,

    show() {
      if (this.onBeforeShow) this.onBeforeShow();
      isVisible = true;
      backdropEl.classList.add('active');
      panelEl.style.opacity = '1';
      panelEl.style.pointerEvents = 'auto';
      panelEl.style.transform = 'translate(-50%, -50%) scale(1)';
      setTimeout(() => inputEl.focus(), 50);
    },

    hide() {
      isVisible = false;
      backdropEl.classList.remove('active');
      panelEl.style.opacity = '0';
      panelEl.style.pointerEvents = 'none';
      panelEl.style.transform = 'translate(-50%, -50%) scale(0.96)';
      infoModalEl.style.display = 'none';
    },

    toggle() {
      if (isVisible) this.hide(); else this.show();
    },

    isVisible() {
      return isVisible;
    },

    clearChat() {
      clearHistory();
      const messages = messagesEl.querySelectorAll('div:not(.examples)');
      messages.forEach(m => m.remove());
      examplesEl.style.display = 'block';
    },

    destroy() {
      panelEl.remove();
      backdropEl.remove();
    },
  };

  backdropEl.addEventListener('click', () => controller.hide());

  return controller;
}

/**
 * Create the game assistant toggle button (bottom-left).
 */
export function createAssistantToggle(containerEl, assistantController) {
  const btnEl = document.createElement('button');
  btnEl.className = 'assistant-toggle floating-widget';
  btnEl.id = 'assistant-toggle-btn';
  btnEl.title = 'Ask the Game (?)';
  btnEl.style.cssText = `
    position: fixed;
    left: 10px;
    bottom: 64px;
    padding: 8px 14px;
    height: 40px;
    background: rgba(15,15,20,0.95);
    border: 1px solid rgba(74,158,255,0.5);
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
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
    backdrop-filter: blur(4px);
  `;
  btnEl.textContent = '🤖 Chat with the game engine';

  function checkMobile() {
    const mobile = window.innerWidth <= 728;
    btnEl.style.left = mobile ? '8px' : '10px';
    btnEl.style.bottom = mobile ? '60px' : '64px';
    btnEl.style.fontSize = mobile ? '10px' : '11px';
    btnEl.style.padding = mobile ? '6px 10px' : '8px 14px';
    btnEl.style.height = mobile ? '36px' : '40px';
  }
  checkMobile();
  window.addEventListener('resize', checkMobile);

  btnEl.addEventListener('click', () => {
    assistantController.toggle();
    btnEl.style.display = assistantController.isVisible() ? 'none' : 'flex';
  });
  btnEl.addEventListener('mouseenter', () => { btnEl.style.transform = 'scale(1.05)'; });
  btnEl.addEventListener('mouseleave', () => { btnEl.style.transform = 'scale(1)'; });

  document.body.appendChild(btnEl);

  // Restore button when panel closes
  const originalHide = assistantController.hide.bind(assistantController);
  assistantController.hide = function () {
    originalHide();
    btnEl.style.display = 'flex';
  };

  return btnEl;
}
