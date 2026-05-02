/**
 * Stat Panel - displays detailed entity information
 * Shows dwarf stats, personality, fulfillment, and relationships.
 * Rendered as a large centered modal popover.
 * Entity chat supports streaming (typewriter) and markdown.
 */

import {
  getDwarfStats,
  getVisitorStats,
  getFoodStats,
  getMoodDescriptor,
  getHungerDescriptor,
  formatTileName
} from './inspection.js';
import { chatWithEntity, getEntityHistory, clearEntityHistory } from '../llm/entityChat.js';
import { ENTITY_CHAT_STARTERS } from '../llm/prompts/entityChat.js';

// Minimal markdown renderer (escapes HTML first)
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

function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

export function createStatPanel(containerEl, gridEl, mapWidth, mapHeight) {
  // Backdrop
  const backdropEl = document.createElement('div');
  backdropEl.className = 'popover-backdrop';
  document.body.appendChild(backdropEl);

  // Panel — large centered modal
  const panelEl = document.createElement('div');
  panelEl.className = 'stat-panel';
  panelEl.style.cssText = `
    position: fixed;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%) scale(0.96);
    width: min(380px, 92vw);
    max-height: 82vh;
    overflow-y: auto;
    background: rgba(12, 12, 18, 0.98);
    border: 1px solid rgba(255, 255, 100, 0.25);
    border-radius: 10px;
    font-family: 'Courier New', monospace;
    font-size: 15px;
    color: #ddd;
    opacity: 0;
    pointer-events: none;
    transition: opacity 220ms ease, transform 220ms ease;
    box-shadow: 0 16px 56px rgba(0,0,0,0.9);
    backdrop-filter: blur(8px);
  `;
  document.body.appendChild(panelEl);

  // Current state
  let currentEntity = null;
  let currentType = null;
  let worldState = null;
  let chatMode = false;
  let chatLoading = false;

  function hide() {
    panelEl.style.opacity = '0';
    panelEl.style.pointerEvents = 'none';
    panelEl.style.transform = 'translate(-50%, -50%) scale(0.96)';
    backdropEl.classList.remove('active');
    setTimeout(() => {
      currentEntity = null;
      currentType = null;
      chatMode = false;
      chatLoading = false;
    }, 230);
  }

  backdropEl.addEventListener('click', hide);

  // ── Event delegation ──────────────────────────────────────────

  panelEl.addEventListener('click', (e) => {
    if (e.target.closest('.panel-close-btn')) { e.stopPropagation(); hide(); return; }
    if (e.target.closest('.chat-toggle-btn')) {
      e.stopPropagation(); chatMode = true; renderCurrentView(); return;
    }
    if (e.target.closest('.chat-back-btn')) {
      e.stopPropagation(); chatMode = false; renderCurrentView(); return;
    }
    if (e.target.closest('.chat-clear-btn')) {
      e.stopPropagation();
      clearEntityHistory(currentEntity, currentType);
      renderCurrentView();
      return;
    }
    if (e.target.closest('.chat-starter')) {
      e.stopPropagation();
      sendChatMessage(e.target.closest('.chat-starter').textContent, currentEntity, currentType);
      return;
    }
    if (e.target.closest('.chat-send-btn')) {
      e.stopPropagation();
      const inputEl = panelEl.querySelector('.chat-input');
      if (inputEl) {
        const msg = inputEl.value.trim();
        if (msg) sendChatMessage(msg, currentEntity, currentType);
      }
      return;
    }
  });

  panelEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey && e.target.matches('.chat-input')) {
      e.preventDefault();
      const msg = e.target.value.trim();
      if (msg) sendChatMessage(msg, currentEntity, currentType);
    }
  });

  // ── Typewriter for entity chat ────────────────────────────────

  function typewriterInto(targetEl, text, scrollEl) {
    return new Promise((resolve) => {
      const delay = text.length > 400 ? 3 : text.length > 200 ? 5 : 8;
      let i = 0;
      const cursor = document.createElement('span');
      cursor.textContent = '▍';
      cursor.style.cssText = 'opacity:0.7;margin-left:1px';
      targetEl.textContent = '';
      targetEl.style.whiteSpace = 'pre-wrap';
      targetEl.appendChild(cursor);

      let stick = true;
      const onScroll = () => {
        if (!scrollEl) return;
        stick = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 24;
      };
      if (scrollEl) scrollEl.addEventListener('scroll', onScroll);

      const step = () => {
        if (i >= text.length) {
          cursor.remove();
          if (scrollEl) scrollEl.removeEventListener('scroll', onScroll);
          targetEl.style.whiteSpace = '';
          targetEl.innerHTML = renderMarkdown(text);
          if (stick && scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
          resolve();
          return;
        }
        const chunk = Math.min(5, text.length - i);
        cursor.before(document.createTextNode(text.slice(i, i + chunk)));
        i += chunk;
        if (stick && scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
        setTimeout(step, delay);
      };
      step();
    });
  }

  // ── Send chat message with streaming animation ────────────────

  async function sendChatMessage(message, entity, entityType) {
    if (chatLoading) return;
    chatLoading = true;

    // Lock UI immediately
    const inputEl = panelEl.querySelector('.chat-input');
    const sendBtn = panelEl.querySelector('.chat-send-btn');
    if (inputEl) { inputEl.value = ''; inputEl.disabled = true; }
    if (sendBtn) sendBtn.disabled = true;

    // Show user message immediately so it's visible during the thinking state
    const messagesEl = panelEl.querySelector('.chat-messages');
    if (messagesEl) {
      // If conversation starters are still shown, clear them first
      if (messagesEl.querySelector('.chat-starter')) {
        messagesEl.innerHTML = '';
      }
      const userEl = document.createElement('div');
      userEl.style.cssText = `margin:6px 0;padding:9px 11px;border-radius:6px;
        background:rgba(74,158,255,0.15);border:1px solid rgba(74,158,255,0.3);margin-left:20px;`;
      userEl.innerHTML = `
        <div style="font-size:12px;color:#4a9eff;margin-bottom:3px">You</div>
        <div style="font-size:14px;line-height:1.45">${escapeHtml(message)}</div>`;
      messagesEl.appendChild(userEl);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }

    // Show thinking indicator
    const loadingEl = panelEl.querySelector('.chat-loading');
    if (loadingEl) loadingEl.style.display = 'block';

    let result = null;
    try {
      result = await chatWithEntity(message, entity, entityType);
    } catch (err) {
      console.error('[EntityChat] Error:', err);
    }

    chatLoading = false;

    // Re-render chat, then animate the last assistant message
    renderCurrentView();

    const messagesElAfter = panelEl.querySelector('.chat-messages');
    if (messagesElAfter && result) {
      // Find the last assistant body (rendered with data-raw attribute)
      const bodies = messagesElAfter.querySelectorAll('.chat-assistant-body');
      const lastBody = bodies[bodies.length - 1];
      if (lastBody) {
        const rawText = lastBody.getAttribute('data-raw') || '';
        lastBody.innerHTML = '';
        // Re-lock input during animation
        const inp2 = panelEl.querySelector('.chat-input');
        const btn2 = panelEl.querySelector('.chat-send-btn');
        if (inp2) inp2.disabled = true;
        if (btn2) btn2.disabled = true;

        await typewriterInto(lastBody, rawText, messagesElAfter);
      }
    }

    // Re-enable input
    const inp3 = panelEl.querySelector('.chat-input');
    const btn3 = panelEl.querySelector('.chat-send-btn');
    if (inp3) { inp3.disabled = false; inp3.focus(); }
    if (btn3) btn3.disabled = false;
  }

  // ── Stat bar helper ───────────────────────────────────────────

  function statBar(label, value, max, color) {
    const pct = Math.round((value / max) * 100);
    return `
      <div style="margin:4px 0;">
        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
          <span style="color:#888">${label}</span>
          <span>${value}/${max}</span>
        </div>
        <div style="background:#222;height:6px;border-radius:3px;overflow:hidden;">
          <div style="width:${pct}%;height:100%;background:${color};transition:width 0.3s"></div>
        </div>
      </div>
    `;
  }

  function fulfillmentSection(fulfillment) {
    if (!fulfillment) return '';
    const needs = [
      { key: 'social', label: 'Social', color: '#4a9eff' },
      { key: 'exploration', label: 'Exploration', color: '#4aff9e' },
      { key: 'creativity', label: 'Creativity', color: '#ff9e4a' },
      { key: 'tranquility', label: 'Tranquility', color: '#9e4aff' },
    ];
    return `
      <div style="margin-top:12px;border-top:1px solid #333;padding-top:8px;">
        <div style="color:#aaa;margin-bottom:6px;font-weight:bold">Fulfillment</div>
        ${needs.map(n => statBar(n.label, fulfillment[n.key], 100, n.color)).join('')}
      </div>
    `;
  }

  function traitsDisplay(traits) {
    if (!traits || traits.length === 0) return '';
    const tags = traits.map(t =>
      `<span style="display:inline-block;background:rgba(100,100,120,0.3);
        border:1px solid rgba(100,100,120,0.5);font-size:13px;padding:1px 6px;
        border-radius:3px;margin:2px;">${t}</span>`
    ).join('');
    return `<div style="margin:8px 0;"><span style="color:#888">Traits:</span> ${tags}</div>`;
  }

  function closeBtn() {
    return `<button class="panel-close-btn" style="
      background:rgba(100,100,120,0.3);border:1px solid rgba(100,100,120,0.5);
      border-radius:4px;color:#888;font-size:16px;width:28px;height:28px;
      cursor:pointer;display:flex;align-items:center;justify-content:center;
      padding:0;flex-shrink:0;" title="Close">×</button>`;
  }

  function chatButton(entityType) {
    return `<button class="chat-toggle-btn" style="
      width:100%;margin-top:10px;padding:9px;
      background:rgba(74,158,255,0.15);border:1px solid rgba(74,158,255,0.4);
      border-radius:4px;color:#4a9eff;font-family:inherit;font-size:14px;
      cursor:pointer;transition:background 150ms;
    ">Chat with this ${entityType}</button>`;
  }

  function getRaceEmoji(race) {
    return { Human: '🧙‍♂️', Goblin: '👹', Elf: '🧝🏻‍♀️' }[race] || '❓';
  }

  // ── Entity renderers ──────────────────────────────────────────

  function renderDwarf(stats) {
    const moodColor = stats.mood > 60 ? '#4aff4a' : stats.mood > 30 ? '#ffff4a' : '#ff4a4a';
    const hungerColor = stats.hunger < 30 ? '#4aff4a' : stats.hunger < 60 ? '#ffff4a' : '#ff4a4a';
    const bio = stats.bio
      ? `<div style="margin:8px 0;padding:8px;background:rgba(40,35,30,0.6);border-left:2px solid #887755;
           font-style:italic;color:#aa9977;font-size:14px;">${stats.bio}</div>` : '';
    const thought = stats.currentThought
      ? `<div style="margin:8px 0;padding:8px;background:rgba(50,50,60,0.5);border-radius:4px;
           font-style:italic;color:#bbb;">"${stats.currentThought}"</div>` : '';
    const rels = stats.relationshipCount > 0
      ? `<div style="margin-top:8px;color:#888;font-size:14px;">
           Knows ${stats.relationshipCount} dwarf${stats.relationshipCount > 1 ? 's' : ''}
           ${stats.bestFriend ? ` (closest: ID ${stats.bestFriend.id})` : ''}
         </div>` : '';
    return `
      <div style="padding:16px;">
        <div style="display:flex;align-items:center;margin-bottom:10px;">
          <span style="font-size:26px;color:#ff0;margin-right:10px">🧌</span>
          <div style="flex:1">
            <div style="font-size:20px;font-weight:bold;color:#fff">${stats.generatedName || stats.name}</div>
            <div style="font-size:13px;color:#666">Dwarf #${stats.id}</div>
          </div>
          ${closeBtn()}
        </div>
        ${bio}
        <div style="margin:8px 0;padding:6px;background:rgba(40,40,50,0.8);border-radius:4px;">
          <span style="color:#888">Status:</span>
          <span style="color:#4aff9e;margin-left:4px">${stats.state}</span>
        </div>
        ${chatButton('dwarf')}
        ${thought}
        <div style="margin-top:14px;">
          <div style="color:#aaa;margin-bottom:6px;font-weight:bold">Vitals</div>
          ${statBar(`Mood (${getMoodDescriptor(stats.mood)})`, stats.mood, 100, moodColor)}
          ${statBar(`Hunger (${getHungerDescriptor(stats.hunger)})`, 100 - stats.hunger, 100, hungerColor)}
          ${statBar('Wellbeing', stats.wellbeing, 100, '#4affff')}
        </div>
        ${traitsDisplay(stats.traits)}
        ${fulfillmentSection(stats.fulfillment)}
        ${rels}
      </div>
    `;
  }

  function renderVisitor(stats) {
    const dispColor =
      stats.disposition > 50 ? '#4aff4a' : stats.disposition > 25 ? '#4aff9e' :
      stats.disposition > 0 ? '#aaaa66' : stats.disposition > -25 ? '#ffaa66' : '#ff4a4a';
    const stateColor =
      stats.state === 'Trading' ? '#4aff9e' :
      stats.state === 'Raiding' || stats.state === 'In Combat' ? '#ff4a4a' :
      stats.state === 'Fleeing' ? '#ffff4a' :
      stats.state === 'Leaving' || stats.state === 'Arriving' ? '#aaaaaa' : '#88aaff';
    const bio = stats.bio
      ? `<div style="margin:8px 0;padding:8px;background:rgba(40,35,30,0.6);border-left:2px solid #887755;
           font-style:italic;color:#aa9977;font-size:14px;">${stats.bio}</div>` : '';
    return `
      <div style="padding:16px;">
        <div style="display:flex;align-items:center;margin-bottom:10px;">
          <span style="font-size:22px;margin-right:10px">${getRaceEmoji(stats.race)}</span>
          <div style="flex:1">
            <div style="font-size:20px;font-weight:bold;color:#fff">${stats.name}</div>
            <div style="font-size:13px;color:#666">${stats.race} ${stats.role} #${stats.id}</div>
          </div>
          ${closeBtn()}
        </div>
        ${bio}
        <div style="margin:8px 0;padding:6px;background:rgba(40,40,50,0.8);border-radius:4px;">
          <div style="display:flex;justify-content:space-between;margin-bottom:4px;">
            <span style="color:#888">State:</span>
            <span style="color:${stateColor}">${stats.state}</span>
          </div>
          <div style="display:flex;justify-content:space-between;">
            <span style="color:#888">Disposition:</span>
            <span style="color:${dispColor}">${stats.dispositionLabel}</span>
          </div>
        </div>
        <div style="margin-top:14px;">
          <div style="color:#aaa;margin-bottom:6px;font-weight:bold">Combat</div>
          ${statBar('HP', stats.hp, stats.maxHp, stats.hpPercent > 50 ? '#4aff4a' : stats.hpPercent > 25 ? '#ffff4a' : '#ff4a4a')}
          <div style="margin:4px 0;color:#888;font-size:14px">Damage: <span style="color:#ffaa66">${stats.damage}</span></div>
        </div>
        ${stats.satisfactionThreshold ? `
          <div style="margin-top:14px;">
            <div style="color:#aaa;margin-bottom:6px;font-weight:bold">Goal Progress</div>
            ${statBar('Satisfaction', stats.satisfaction, stats.satisfactionThreshold, '#4a9eff')}
          </div>
        ` : ''}
        ${chatButton(stats.race?.toLowerCase() || 'visitor')}
      </div>
    `;
  }

  function renderFood(stats) {
    return `
      <div style="padding:16px;">
        <div style="display:flex;align-items:center;margin-bottom:14px;">
          <span style="font-size:26px;color:#32cd32;margin-right:10px">%</span>
          <div style="flex:1">
            <div style="font-size:20px;font-weight:bold;color:#fff">Food Source</div>
            <div style="font-size:14px;color:#888">ID ${stats.id}</div>
          </div>
          ${closeBtn()}
        </div>
        <div style="margin:8px 0;">
          <span style="color:#888">Servings remaining:</span>
          <span style="color:#4aff4a;font-size:22px;margin-left:8px">${stats.amount}</span>
        </div>
        <div style="color:#666;font-size:14px;margin-top:8px">
          Position: (${stats.position.x}, ${stats.position.y})
        </div>
      </div>
    `;
  }

  function renderTile(tile, x, y) {
    const def = tile.def || {};
    const walkable = def.walkable !== undefined ? def.walkable : false;
    return `
      <div style="padding:16px;">
        <div style="display:flex;align-items:center;margin-bottom:14px;">
          <span style="font-size:26px;color:${def.fg || '#888'};background:${def.bg || '#000'};
            padding:4px 8px;border-radius:4px;margin-right:10px">${def.char || '?'}</span>
          <div style="flex:1">
            <div style="font-size:20px;font-weight:bold;color:#fff">${formatTileName(tile.type)}</div>
            <div style="font-size:14px;color:#888">(${x}, ${y})</div>
          </div>
          ${closeBtn()}
        </div>
        <div style="margin:8px 0;color:#888;">
          <div>Walkable: ${walkable
            ? '<span style="color:#4aff4a">Yes</span>'
            : '<span style="color:#ff4a4a">No</span>'}</div>
          ${def.harvestable ? '<div>Harvestable: <span style="color:#4aff9e">Yes</span></div>' : ''}
          ${tile.resourceAmount > 0 ? `<div>Resources: ${tile.resourceAmount}</div>` : ''}
        </div>
      </div>
    `;
  }

  // ── Chat UI renderer ──────────────────────────────────────────

  function renderChatUI(entity, entityType) {
    const name = entity.generatedName || entity.name || 'Entity';
    const history = getEntityHistory(entity, entityType);
    const starters = ENTITY_CHAT_STARTERS[entityType] || ENTITY_CHAT_STARTERS.dwarf;

    let messagesHtml = '';
    if (history.length === 0) {
      messagesHtml = `
        <div style="color:#666;font-size:13px;margin-bottom:8px">Conversation starters:</div>
        ${starters.slice(0, 3).map(s => `
          <button class="chat-starter" style="
            display:block;width:100%;text-align:left;
            background:rgba(50,50,60,0.4);border:1px solid rgba(100,100,120,0.3);
            border-radius:4px;padding:7px 10px;margin:4px 0;color:#aaa;
            font-family:inherit;font-size:13px;cursor:pointer;transition:background 150ms;
          ">${s}</button>
        `).join('')}
      `;
    } else {
      messagesHtml = history.map(msg => {
        const isUser = msg.role === 'user';
        if (isUser) {
          return `
            <div style="margin:6px 0;padding:9px 11px;border-radius:6px;
              background:rgba(74,158,255,0.15);border:1px solid rgba(74,158,255,0.3);margin-left:20px;">
              <div style="font-size:12px;color:#4a9eff;margin-bottom:3px">You</div>
              <div style="font-size:14px;line-height:1.45">${escapeHtml(msg.content)}</div>
            </div>
          `;
        }
        // Assistant: store raw text as data-raw so typewriter can animate it
        return `
          <div style="margin:6px 0;padding:9px 11px;border-radius:6px;
            background:rgba(74,255,158,0.1);border:1px solid rgba(74,255,158,0.3);margin-right:20px;">
            <div style="font-size:12px;color:#4aff9e;margin-bottom:3px">${name}</div>
            <div class="chat-assistant-body" data-raw="${escapeAttr(msg.content)}"
              style="font-size:14px;line-height:1.45">${renderMarkdown(msg.content)}</div>
          </div>
        `;
      }).join('');
    }

    return `
      <div style="padding:16px;">
        <div style="display:flex;align-items:center;margin-bottom:14px;gap:8px;">
          <button class="chat-back-btn" style="
            background:rgba(100,100,120,0.3);border:1px solid rgba(100,100,120,0.4);
            border-radius:4px;padding:5px 10px;color:#888;font-family:inherit;
            font-size:14px;cursor:pointer;">← Back</button>
          <div style="flex:1;font-size:20px;font-weight:bold;color:#fff">Chat with ${name}</div>
          ${history.length > 0 ? `
            <button class="chat-clear-btn" style="
              background:none;border:1px solid rgba(255,100,100,0.3);border-radius:4px;
              padding:4px 8px;color:#ff6666;font-family:inherit;font-size:14px;cursor:pointer;">
              Clear</button>` : ''}
        </div>

        <div class="chat-messages" style="
          max-height: 340px;
          overflow-y: auto;
          margin-bottom: 12px;
          padding-right: 4px;
        ">
          ${messagesHtml}
        </div>

        <div class="chat-loading" style="
          display:none;text-align:center;padding:8px;color:#888;font-size:14px;">
          <span style="animation:pulse 1s infinite">${name} is thinking...</span>
        </div>

        <div style="display:flex;gap:6px;">
          <input type="text" class="chat-input" placeholder="Say something..." style="
            flex:1;background:rgba(30,30,40,0.8);border:1px solid rgba(100,100,120,0.4);
            border-radius:4px;padding:9px 10px;color:#ddd;font-family:inherit;
            font-size:16px;outline:none;" />
          <button class="chat-send-btn" style="
            background:rgba(74,158,255,0.2);border:1px solid rgba(74,158,255,0.5);
            border-radius:4px;padding:9px 14px;color:#4a9eff;font-family:inherit;
            font-size:14px;cursor:pointer;">Send</button>
        </div>
        <div style="margin-top:6px;font-size:12px;color:#555;text-align:center;">
          Roleplay conversation — responses reflect personality
        </div>
      </div>
    `;
  }

  function escapeAttr(str) {
    return str
      .replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Main render ───────────────────────────────────────────────

  function renderCurrentView() {
    if (!currentEntity || !currentType) return;
    if (currentType === 'dwarf') {
      panelEl.innerHTML = chatMode
        ? renderChatUI(currentEntity, 'dwarf')
        : renderDwarf(getDwarfStats(currentEntity));
    } else if (currentType === 'visitor') {
      panelEl.innerHTML = chatMode
        ? renderChatUI(currentEntity, 'visitor')
        : renderVisitor(getVisitorStats(currentEntity));
    } else if (currentType === 'food') {
      panelEl.innerHTML = renderFood(getFoodStats(currentEntity));
    }
    if (chatMode) {
      setTimeout(() => {
        const inp = panelEl.querySelector('.chat-input');
        if (inp) inp.focus();
        const msgs = panelEl.querySelector('.chat-messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
      }, 30);
    }
  }

  // ── Public API ────────────────────────────────────────────────

  return {
    onBeforeShow: null,

    show(inspection) {
      const { x, y, tile, entities } = inspection;
      chatMode = false;

      if (entities.length > 0) {
        const first = entities[0];
        currentEntity = first.entity;
        currentType = first.type;
      } else if (tile) {
        currentEntity = null;
        currentType = 'tile';
        panelEl.innerHTML = renderTile(tile, x, y);
      } else {
        return;
      }

      if (currentType !== 'tile') renderCurrentView();

      if (this.onBeforeShow) this.onBeforeShow();

      backdropEl.classList.add('active');
      panelEl.style.opacity = '1';
      panelEl.style.pointerEvents = 'auto';
      panelEl.style.transform = 'translate(-50%, -50%) scale(1)';
    },

    hide() {
      hide();
    },

    isVisible() {
      return panelEl.style.opacity === '1';
    },

    update(state) {
      worldState = state;
      if (chatMode || chatLoading) {
        // Track entity movement but skip re-render
        if (currentType === 'dwarf') {
          const d = state.dwarves.find(d => d.id === currentEntity?.id);
          if (!d) { this.hide(); return; }
          currentEntity = d;
        } else if (currentType === 'visitor') {
          const v = state.visitors?.find(v => v.id === currentEntity?.id);
          if (!v || v.state === 'dead') { this.hide(); return; }
          currentEntity = v;
        }
        return;
      }

      if (currentType === 'dwarf') {
        const d = state.dwarves.find(d => d.id === currentEntity?.id);
        if (!d) { this.hide(); return; }
        currentEntity = d;
        renderCurrentView();
      } else if (currentType === 'visitor') {
        const v = state.visitors?.find(v => v.id === currentEntity?.id);
        if (!v || v.state === 'dead') { this.hide(); return; }
        currentEntity = v;
        renderCurrentView();
      }
    },

    getEntity() {
      return currentEntity;
    },

    destroy() {
      panelEl.remove();
      backdropEl.remove();
    },
  };
}
