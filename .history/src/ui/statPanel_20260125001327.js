/**
 * Stat Panel - displays detailed entity information
 * Shows dwarf stats, personality, fulfillment, and relationships
 * Includes chat feature for conversing with entities
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

/**
 * Create a stat panel component
 * @param {HTMLElement} containerEl - Container to attach panel to
 * @param {HTMLElement} gridEl - The ASCII grid element for position calculations
 * @param {number} mapWidth - Map width in cells
 * @param {number} mapHeight - Map height in cells
 * @returns {object} Panel controller with show(), hide(), update()
 */
export function createStatPanel(containerEl, gridEl, mapWidth, mapHeight) {
  // Mobile breakpoint
  const MOBILE_BREAKPOINT = 728;

  // Create panel element - positioned relative to cursor (or fixed on mobile)
  const panelEl = document.createElement('div');
  panelEl.className = 'stat-panel';
  panelEl.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
    width: 260px;
    max-height: 400px;
    overflow-y: auto;
    background: rgba(15, 15, 20, 0.95);
    border: 1px solid rgba(255, 255, 100, 0.4);
    border-radius: 4px;
    font-family: 'Courier New', monospace;
    font-size: 15px;
    color: #ddd;
    z-index: 999;
    opacity: 0;
    transition: transform 320ms ease-in-out, opacity 200ms ease;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  `;
  // Set initial pointer-events state (hidden by default)
  panelEl.style.pointerEvents = 'none';

  // Mobile-specific positioning - use fixed position for full visibility
  function applyMobileStyles() {
    if (window.innerWidth <= MOBILE_BREAKPOINT) {
      panelEl.style.position = 'fixed';
      panelEl.style.left = '50%';
      panelEl.style.top = '50%';
      panelEl.style.transform = 'translate(-50%, -50%)';
      panelEl.style.width = 'calc(100vw - 32px)';
      panelEl.style.maxWidth = '320px';
      panelEl.style.maxHeight = 'calc(100vh - 100px)';
    } else {
      panelEl.style.position = 'absolute';
      panelEl.style.width = '260px';
      panelEl.style.maxWidth = '';
      panelEl.style.maxHeight = '400px';
    }
  }

  // Apply on resize
  window.addEventListener('resize', applyMobileStyles);
  applyMobileStyles();

  containerEl.appendChild(panelEl);

  // Current displayed entity and position
  let currentEntity = null;
  let currentType = null;
  let currentGridX = 0;
  let currentGridY = 0;
  let worldState = null;

  // Chat mode state
  let chatMode = false;
  let chatLoading = false;

  /**
   * Event delegation handler for panel clicks
   */
  function handlePanelClick(e) {
    // Allow close button to work even if panel is transitioning
    const closeBtn = e.target.closest('.panel-close-btn');
    if (closeBtn) {
      e.stopPropagation();
      e.preventDefault();
      hide();
      return;
    }

    // For other buttons, check if panel is actually visible and interactive
    if (panelEl.style.pointerEvents === 'none' || panelEl.style.opacity === '0') {
      return;
    }

    const toggleBtn = e.target.closest('.chat-toggle-btn');
    if (toggleBtn) {
      e.stopPropagation();
      e.preventDefault();
      chatMode = true;
      renderCurrentView();
      return;
    }

    const backBtn = e.target.closest('.chat-back-btn');
    if (backBtn) {
      e.stopPropagation();
      e.preventDefault();
      chatMode = false;
      renderCurrentView();
      return;
    }

    const clearBtn = e.target.closest('.chat-clear-btn');
    if (clearBtn) {
      e.stopPropagation();
      e.preventDefault();
      clearEntityHistory(currentEntity, currentType);
      renderCurrentView();
      return;
    }

    const starter = e.target.closest('.chat-starter');
    if (starter) {
      e.stopPropagation();
      e.preventDefault();
      sendChatMessage(starter.textContent, currentEntity, currentType, () => renderCurrentView());
      return;
    }

    const sendBtn = e.target.closest('.chat-send-btn');
    if (sendBtn) {
      e.stopPropagation();
      e.preventDefault();
      const inputEl = panelEl.querySelector('.chat-input');
      if (inputEl) {
        const msg = inputEl.value.trim();
        if (msg) {
          sendChatMessage(msg, currentEntity, currentType, () => renderCurrentView());
        }
      }
      return;
    }
  }

  // Attach event delegation listener with capture phase for better reliability
  panelEl.addEventListener('click', handlePanelClick, true);

  /**
   * Handle keydown in chat input
   */
  function handleInputKeydown(e) {
    if (e.key === 'Enter' && !e.shiftKey && e.target.matches('.chat-input')) {
      e.preventDefault();
      const msg = e.target.value.trim();
      if (msg) {
        sendChatMessage(msg, currentEntity, currentType, () => renderCurrentView());
      }
    }
  }

  // Attach keydown listener with delegation
  panelEl.addEventListener('keydown', handleInputKeydown);

  /**
   * Calculate and set panel position near a grid cell (desktop only)
   * Uses viewport coordinates for accurate positioning
   */
  function positionPanel(gridX, gridY) {
    // Never reposition on mobile - mobile uses fixed centering
    if (window.innerWidth <= MOBILE_BREAKPOINT) {
      return;
    }

    if (!gridEl) return;

    const gridRect = gridEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();

    const cellWidth = gridRect.width / mapWidth;
    const cellHeight = gridRect.height / mapHeight;

    // Calculate cell position relative to container
    const cellLeft = (gridRect.left - containerRect.left) + (gridX * cellWidth);
    const cellTop = (gridRect.top - containerRect.top) + (gridY * cellHeight);

    const panelWidth = 260;
    const panelHeight = panelEl.offsetHeight || 300;

    // Default: position to the right of the cell
    let panelX = cellLeft + cellWidth + 12;
    let panelY = cellTop;

    // If panel would overflow right, position to the left
    if (panelX + panelWidth > containerRect.width) {
      panelX = cellLeft - panelWidth - 12;
    }

    // If panel would overflow left, center it horizontally
    if (panelX < 0) {
      panelX = Math.max(8, (containerRect.width - panelWidth) / 2);
    }

    // Clamp X to viewport bounds
    panelX = Math.max(8, Math.min(panelX, containerRect.width - panelWidth - 8));

    // If panel would overflow bottom, shift up
    if (panelY + panelHeight > containerRect.height) {
      panelY = Math.max(8, containerRect.height - panelHeight - 8);
    }

    // If panel would overflow top, shift down
    if (panelY < 0) {
      panelY = 8;
    }

    // Clamp Y to viewport bounds
    panelY = Math.max(8, Math.min(panelY, containerRect.height - panelHeight - 8));

    panelEl.style.transform = `translate(${panelX}px, ${panelY}px)`;
  }

  /**
   * Create a stat bar element
   */
  function createStatBar(label, value, max, color) {
    const pct = Math.round((value / max) * 100);
    return `
      <div style="margin: 4px 0;">
        <div style="display: flex; justify-content: space-between; margin-bottom: 2px;">
          <span style="color: #888;">${label}</span>
          <span>${value}/${max}</span>
        </div>
        <div style="background: #222; height: 6px; border-radius: 3px; overflow: hidden;">
          <div style="width: ${pct}%; height: 100%; background: ${color}; transition: width 0.3s;"></div>
        </div>
      </div>
    `;
  }

  /**
   * Create fulfillment display
   */
  function createFulfillmentSection(fulfillment) {
    if (!fulfillment) return '';

    const needs = [
      { key: 'social', label: 'Social', color: '#4a9eff' },
      { key: 'exploration', label: 'Exploration', color: '#4aff9e' },
      { key: 'creativity', label: 'Creativity', color: '#ff9e4a' },
      { key: 'tranquility', label: 'Tranquility', color: '#9e4aff' },
    ];

    const bars = needs.map(n =>
      createStatBar(n.label, fulfillment[n.key], 100, n.color)
    ).join('');

    return `
      <div style="margin-top: 12px; border-top: 1px solid #333; padding-top: 8px;">
        <div style="color: #aaa; margin-bottom: 6px; font-weight: bold;">Fulfillment</div>
        ${bars}
      </div>
    `;
  }

  /**
   * Create personality traits display
   */
  function createTraitsDisplay(traits) {
    if (!traits || traits.length === 0) return '';

    const traitTags = traits.map(t =>
      `<span style="
        display: inline-block;
        background: rgba(100, 100, 120, 0.3);
        border: 1px solid rgba(100, 100, 120, 0.5);
        font-size: 13px;
      ">${t}</span>`
    ).join('');

    return `
      <div style="margin: 8px 0;">
        <span style="color: #888;">Traits: </span>
        ${traitTags}
      </div>
    `;
  }

  /**
   * Render dwarf stats
   */
  function renderDwarf(stats) {
    const moodColor = stats.mood > 60 ? '#4aff4a' : stats.mood > 30 ? '#ffff4a' : '#ff4a4a';
    const hungerColor = stats.hunger < 30 ? '#4aff4a' : stats.hunger < 60 ? '#ffff4a' : '#ff4a4a';

    // Bio section (from LLM or fallback)
    let bioSection = '';
    if (stats.bio) {
      bioSection = `
        <div style="margin: 8px 0; padding: 8px; background: rgba(40, 35, 30, 0.6); border-left: 2px solid #887755; font-style: italic; color: #aa9977; font-size: 14px;">
          ${stats.bio}
        </div>
      `;
    }

    let thoughtSection = '';
    if (stats.currentThought) {
      thoughtSection = `
        <div style="margin: 8px 0; padding: 8px; background: rgba(50, 50, 60, 0.5); border-radius: 4px; font-style: italic; color: #bbb;">
          "${stats.currentThought}"
        </div>
      `;
    }

    let relationshipSection = '';
    if (stats.relationshipCount > 0) {
      relationshipSection = `
        <div style="margin-top: 8px; color: #888; font-size: 14px;">
          Knows ${stats.relationshipCount} dwarf${stats.relationshipCount > 1 ? 's' : ''}
          ${stats.bestFriend ? ` (closest: ID ${stats.bestFriend.id})` : ''}
        </div>
      `;
    }

    return `
      <div style="padding: 12px;">
        <!-- Header with close button -->
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 24px; color: #ff0; margin-right: 8px;">🧌</span>
          <div style="flex: 1;">
            <div style="font-size: 18px; font-weight: bold; color: #fff;">${stats.generatedName || stats.name}</div>
            <div style="font-size: 13px; color: #666;">Dwarf #${stats.id}</div>
          </div>
          <button class="panel-close-btn" style="
            background: rgba(100, 100, 120, 0.3);
            border: 1px solid rgba(100, 100, 120, 0.5);
            border-radius: 4px;
            color: #888;
            font-size: 16px;
            width: 28px;
            height: 28px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            transition: background 0.15s, color 0.15s;
          " title="Close">×</button>
        </div>

        ${bioSection}

        

        <!-- State -->
        <div style="margin: 8px 0; padding: 6px; background: rgba(40, 40, 50, 0.8); border-radius: 4px;">
          <span style="color: #888;">Status:</span>
          <span style="color: #4aff9e; margin-left: 4px;">${stats.state}</span>
        </div>

        ${thoughtSection}

        <!-- Chat button -->
        ${renderChatButton('dwarf')}

        <!-- Vitals -->
        <div style="margin-top: 12px;">
          <div style="color: #aaa; margin-bottom: 6px; font-weight: bold;">Vitals</div>
          ${createStatBar(`Mood (${getMoodDescriptor(stats.mood)})`, stats.mood, 100, moodColor)}
          ${createStatBar(`Hunger (${getHungerDescriptor(stats.hunger)})`, 100 - stats.hunger, 100, hungerColor)}
          ${createStatBar('Wellbeing', stats.wellbeing, 100, '#4affff')}
        </div>

        ${createTraitsDisplay(stats.traits)}
        ${createFulfillmentSection(stats.fulfillment)}
        ${relationshipSection}

        

      </div>
    `;
  }

  /**
   * Render food stats
   */
  function renderFood(stats) {
    return `
      <div style="padding: 12px;">
        <div style="display: flex; align-items: center; margin-bottom: 12px;">
          <span style="font-size: 24px; color: #32cd32; margin-right: 8px;">%</span>
          <div style="flex: 1;">
            <div style="font-size: 19px; font-weight: bold; color: #fff;">Food Source</div>
            <div style="font-size: 14px; color: #888;">ID ${stats.id}</div>
          </div>
          <button class="panel-close-btn" style="
            background: rgba(100, 100, 120, 0.3);
            border: 1px solid rgba(100, 100, 120, 0.5);
            border-radius: 4px;
            color: #888;
            font-size: 16px;
            width: 28px;
            height: 28px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            transition: background 0.15s, color 0.15s;
          " title="Close">×</button>
        </div>

        <div style="margin: 8px 0;">
          <span style="color: #888;">Servings remaining:</span>
          <span style="color: #4aff4a; font-size: 21px; margin-left: 8px;">${stats.amount}</span>
        </div>

        <div style="color: #666; font-size: 14px; margin-top: 8px;">
          Position: (${stats.position.x}, ${stats.position.y})
        </div>
      </div>
    `;
  }

  /**
   * Render visitor stats (humans, elves, goblins, etc.)
   */
  function renderVisitor(stats) {
    const dispositionColor = 
      stats.disposition > 50 ? '#4aff4a' : 
      stats.disposition > 25 ? '#4aff9e' : 
      stats.disposition > 0 ? '#aaaa66' : 
      stats.disposition > -25 ? '#ffaa66' : '#ff4a4a';

    const stateColor =
      stats.state === 'Trading' ? '#4aff9e' :
      stats.state === 'Raiding' || stats.state === 'In Combat' ? '#ff4a4a' :
      stats.state === 'Fleeing' ? '#ffff4a' :
      stats.state === 'Leaving' || stats.state === 'Arriving' ? '#aaaaaa' : '#88aaff';

    // Bio section
    let bioSection = '';
    if (stats.bio) {
      bioSection = `
        <div style="margin: 8px 0; padding: 8px; background: rgba(40, 35, 30, 0.6); border-left: 2px solid #887755; font-style: italic; color: #aa9977; font-size: 14px;">
          ${stats.bio}
        </div>
      `;
    }

    return `
      <div style="padding: 12px;">
        <!-- Header with close button -->
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 20px; margin-right: 8px;">${getRaceEmoji(stats.race)}</span>
          <div style="flex: 1;">
            <div style="font-size: 18px; font-weight: bold; color: #fff;">${stats.name}</div>
            <div style="font-size: 13px; color: #666;">${stats.race} ${stats.role} #${stats.id}</div>
          </div>
          <button class="panel-close-btn" style="
            background: rgba(100, 100, 120, 0.3);
            border: 1px solid rgba(100, 100, 120, 0.5);
            border-radius: 4px;
            color: #888;
            font-size: 16px;
            width: 28px;
            height: 28px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            transition: background 0.15s, color 0.15s;
          " title="Close">×</button>
        </div>

        ${bioSection}

        <!-- State & Disposition -->
        <div style="margin: 8px 0; padding: 6px; background: rgba(40, 40, 50, 0.8); border-radius: 4px;">
          <div style="display: flex; justify-content: space-between; margin-bottom: 4px;">
            <span style="color: #888;">State:</span>
            <span style="color: ${stateColor};">${stats.state}</span>
          </div>
          <div style="display: flex; justify-content: space-between;">
            <span style="color: #888;">Disposition:</span>
            <span style="color: ${dispositionColor};">${stats.dispositionLabel}</span>
          </div>
        </div>

        <!-- Combat Stats -->
        <div style="margin-top: 12px;">
          <div style="color: #aaa; margin-bottom: 6px; font-weight: bold;">Combat</div>
          ${createStatBar('HP', stats.hp, stats.maxHp, stats.hpPercent > 50 ? '#4aff4a' : stats.hpPercent > 25 ? '#ffff4a' : '#ff4a4a')}
          <div style="margin: 4px 0; color: #888; font-size: 14px;">Damage: <span style="color: #ffaa66;">${stats.damage}</span></div>
        </div>

        <!-- Goal Progress -->
        ${stats.satisfactionThreshold ? `
          <div style="margin-top: 12px;">
            <div style="color: #aaa; margin-bottom: 6px; font-weight: bold;">Goal Progress</div>
            ${createStatBar('Satisfaction', stats.satisfaction, stats.satisfactionThreshold, '#4a9eff')}
          </div>
        ` : ''}

        <!-- Chat button -->
        ${renderChatButton(stats.race?.toLowerCase() || 'visitor')}
      </div>
    `;
  }

  /**
   * Get emoji for race display
   */
  function getRaceEmoji(race) {
    const emojis = {
      'Human': '🧙‍♂️',
      'Goblin': '👹',
      'Elf': '🧝🏻‍♀️',
    };
    return emojis[race] || '❓';
  }

  /**
   * Render tile info
   */
  function renderTile(tile, x, y) {
    const def = tile.def || {};
    const tileChar = def.char || '?';
    const tileFg = def.fg || '#888';
    const tileBg = def.bg || '#000';
    const walkable = def.walkable !== undefined ? def.walkable : false;
    const harvestable = def.harvestable || false;

    return `
      <div style="padding: 12px;">
        <div style="display: flex; align-items: center; margin-bottom: 12px;">
          <span style="font-size: 24px; color: ${tileFg}; background: ${tileBg}; padding: 4px 8px; border-radius: 4px; margin-right: 8px;">${tileChar}</span>
          <div style="flex: 1;">
            <div style="font-size: 19px; font-weight: bold; color: #fff;">${formatTileName(tile.type)}</div>
            <div style="font-size: 14px; color: #888;">(${x}, ${y})</div>
          </div>
          <button class="panel-close-btn" style="
            background: rgba(100, 100, 120, 0.3);
            border: 1px solid rgba(100, 100, 120, 0.5);
            border-radius: 4px;
            color: #888;
            font-size: 16px;
            width: 28px;
            height: 28px;
            cursor: pointer;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 0;
            transition: background 0.15s, color 0.15s;
          " title="Close">×</button>
        </div>

        <div style="margin: 8px 0; color: #888;">
          <div>Walkable: ${walkable ? '<span style="color: #4aff4a;">Yes</span>' : '<span style="color: #ff4a4a;">No</span>'}</div>
          ${harvestable ? `<div>Harvestable: <span style="color: #4aff9e;">Yes</span></div>` : ''}
          ${tile.resourceAmount > 0 ? `<div>Resources: ${tile.resourceAmount}</div>` : ''}
        </div>
      </div>
    `;
  }

  /**
   * Render chat button for entities
   */
  function renderChatButton(entityType) {
    return `
      <button class="chat-toggle-btn" style="
        width: 100%;
        margin-top: 8px;
        padding: 8px;
        background: rgba(74, 158, 255, 0.15);
        border: 1px solid rgba(74, 158, 255, 0.4);
        border-radius: 4px;
        color: #4a9eff;
        font-family: inherit;
        font-size: 14px;
        cursor: pointer;
        transition: background 150ms;
      ">Chat with this ${entityType}</button>
    `;
  }

  /**
   * Render the chat interface
   */
  function renderChatUI(entity, entityType) {
    const name = entity.generatedName || entity.name || 'Entity';
    const history = getEntityHistory(entity, entityType);
    const starters = ENTITY_CHAT_STARTERS[entityType] || ENTITY_CHAT_STARTERS.dwarf;

    let messagesHtml = '';
    if (history.length === 0) {
      // Show conversation starters
      messagesHtml = `
        <div style="color: #666; font-size: 13px; margin-bottom: 8px;">Conversation starters:</div>
        ${starters.slice(0, 3).map(s => `
          <button class="chat-starter" style="
            display: block;
            width: 100%;
            text-align: left;
            background: rgba(50, 50, 60, 0.4);
            border: 1px solid rgba(100, 100, 120, 0.3);
            border-radius: 4px;
            padding: 6px 8px;
            margin: 4px 0;
            color: #aaa;
            font-family: inherit;
            font-size: 13px;
            cursor: pointer;
          ">${s}</button>
        `).join('')}
      `;
    } else {
      // Show conversation history
      messagesHtml = history.map(msg => `
        <div style="
          margin: 6px 0;
          padding: 8px;
          border-radius: 6px;
          ${msg.role === 'user'
            ? 'background: rgba(74, 158, 255, 0.15); border: 1px solid rgba(74, 158, 255, 0.3); margin-left: 16px;'
            : 'background: rgba(74, 255, 158, 0.1); border: 1px solid rgba(74, 255, 158, 0.3); margin-right: 16px;'}
        ">
          <div style="font-size: 12px; color: ${msg.role === 'user' ? '#4a9eff' : '#4aff9e'}; margin-bottom: 3px;">
            ${msg.role === 'user' ? 'You' : name}
          </div>
          <div style="font-size: 14px; line-height: 1.4;">${escapeHtml(msg.content)}</div>
        </div>
      `).join('');
    }

    return `
      <div style="padding: 12px;">
        <!-- Header with back button -->
        <div style="display: flex; align-items: center; margin-bottom: 12px; gap: 8px;">
          <button class="chat-back-btn" style="
            background: rgba(100, 100, 120, 0.3);
            border: 1px solid rgba(100, 100, 120, 0.4);
            border-radius: 4px;
            padding: 4px 8px;
            color: #888;
            font-family: inherit;
            font-size: 14px;
            cursor: pointer;
          ">< Back</button>
          <div style="flex: 1;">
            <div style="font-size: 16px; font-weight: bold; color: #fff;">Chat with ${name}</div>
          </div>
          ${history.length > 0 ? `
            <button class="chat-clear-btn" style="
              background: none;
              border: 1px solid rgba(255, 100, 100, 0.3);
              border-radius: 4px;
              padding: 4px 6px;
              color: #ff6666;
              font-family: inherit;
              font-size: 12px;
              cursor: pointer;
            ">Clear</button>
          ` : ''}
        </div>

        <!-- Messages area -->
        <div class="chat-messages" style="
          max-height: 180px;
          overflow-y: auto;
          margin-bottom: 10px;
          padding-right: 4px;
        ">
          ${messagesHtml}
        </div>

        <!-- Loading indicator (hidden by default) -->
        <div class="chat-loading" style="
          display: none;
          text-align: center;
          padding: 8px;
          color: #888;
          font-size: 14px;
        ">
          <span style="animation: pulse 1s infinite;">${name} is thinking...</span>
        </div>

        <!-- Input area -->
        <div style="display: flex; gap: 6px;">
          <input type="text" class="chat-input" placeholder="Say something..." style="
            flex: 1;
            background: rgba(30, 30, 40, 0.8);
            border: 1px solid rgba(100, 100, 120, 0.4);
            border-radius: 4px;
            padding: 8px;
            color: #ddd;
            font-family: inherit;
            font-size: 14px;
            outline: none;
          " />
          <button class="chat-send-btn" style="
            background: rgba(74, 158, 255, 0.2);
            border: 1px solid rgba(74, 158, 255, 0.5);
            border-radius: 4px;
            padding: 8px 12px;
            color: #4a9eff;
            font-family: inherit;
            font-size: 14px;
            cursor: pointer;
          ">Send</button>
        </div>

        <div style="margin-top: 6px; font-size: 12px; color: #555; text-align: center;">
          Roleplay conversation - responses reflect personality
        </div>
      </div>
    `;
  }

  /**
   * Escape HTML for safe rendering
   */
  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /**
   * Send a chat message and get response
   */
  async function sendChatMessage(message, entity, entityType, onRefresh) {
    if (chatLoading) return;

    chatLoading = true;

    // Show loading state
    const loadingEl = panelEl.querySelector('.chat-loading');
    const inputEl = panelEl.querySelector('.chat-input');
    const sendBtn = panelEl.querySelector('.chat-send-btn');

    if (loadingEl) loadingEl.style.display = 'block';
    if (inputEl) {
      inputEl.value = '';
      inputEl.disabled = true;
    }
    if (sendBtn) sendBtn.disabled = true;

    try {
      await chatWithEntity(message, entity, entityType);
    } catch (err) {
      console.error('[EntityChat] Error:', err);
    } finally {
      chatLoading = false;
      onRefresh();
    }
  }

  /**
   * Render and wire up the appropriate view for current entity
   */
  function renderCurrentView() {
    if (!currentEntity || !currentType) return;

    if (currentType === 'dwarf') {
      if (chatMode) {
        panelEl.innerHTML = renderChatUI(currentEntity, 'dwarf');
      } else {
        const stats = getDwarfStats(currentEntity);
        panelEl.innerHTML = renderDwarf(stats);
      }
    } else if (currentType === 'visitor') {
      if (chatMode) {
        panelEl.innerHTML = renderChatUI(currentEntity, 'visitor');
      } else {
        const stats = getVisitorStats(currentEntity);
        panelEl.innerHTML = renderVisitor(stats);
      }
    } else if (currentType === 'food') {
      const stats = getFoodStats(currentEntity);
      panelEl.innerHTML = renderFood(stats);
    }

    // Focus chat input if in chat mode
    if (chatMode) {
      setTimeout(() => {
        const inputEl = panelEl.querySelector('.chat-input');
        if (inputEl) inputEl.focus();
      }, 50);
    }
  }

  return {
    /**
     * Show panel with inspection data at cursor position
     * @param {object} inspection - From inspectPosition()
     */
    show(inspection) {
      const { x, y, tile, entities } = inspection;

      // Store grid position for repositioning
      currentGridX = x;
      currentGridY = y;

      // Reset chat mode when showing a new entity
      chatMode = false;

      // Priority: dwarf > visitor > food > tile
      if (entities.length > 0) {
        const first = entities[0];
        if (first.type === 'dwarf') {
          currentEntity = first.entity;
          currentType = 'dwarf';
        } else if (first.type === 'visitor') {
          currentEntity = first.entity;
          currentType = 'visitor';
        } else if (first.type === 'food') {
          currentEntity = first.entity;
          currentType = 'food';
        }
      } else if (tile) {
        currentEntity = null;
        currentType = 'tile';
        panelEl.innerHTML = renderTile(tile, x, y);
      } else {
        return; // Nothing to show
      }

      // Render the appropriate view
      if (currentType !== 'tile') {
        renderCurrentView();
        
        // Scroll chat messages to bottom if in chat mode
        if (chatMode) {
          setTimeout(() => {
            const messagesEl = panelEl.querySelector('.chat-messages');
            if (messagesEl) {
              messagesEl.scrollTop = messagesEl.scrollHeight;
            }
          }, 0);
        }
      }

      // Position panel near the clicked cell (unless mobile - centered)
      if (window.innerWidth > MOBILE_BREAKPOINT) {
        positionPanel(x, y);
      }

      panelEl.style.opacity = '1';
      panelEl.style.pointerEvents = 'auto';
    },

    /**
     * Hide the panel
     */
    hide() {
      panelEl.style.opacity = '0';
      panelEl.style.pointerEvents = 'none';
      currentEntity = null;
      currentType = null;
      chatMode = false;
      chatLoading = false;
    },

    /**
     * Check if panel is visible
     */
    isVisible() {
      return panelEl.style.opacity === '1';
    },

    /**
     * Update panel with fresh data (call each frame if visible)
     * @param {object} state - World state
     */
    update(state) {
      worldState = state;

      // Don't update while in chat mode (would disrupt conversation)
      if (chatMode || chatLoading) {
        // Still update entity reference for position tracking
        if (currentType === 'dwarf') {
          const dwarf = state.dwarves.find(d => d.id === currentEntity.id);
          if (!dwarf) {
            this.hide();
            return;
          }
          // Update position if dwarf moved (desktop only)
          if (window.innerWidth > MOBILE_BREAKPOINT && (dwarf.x !== currentGridX || dwarf.y !== currentGridY)) {
            currentGridX = dwarf.x;
            currentGridY = dwarf.y;
            positionPanel(dwarf.x, dwarf.y);
          }
          currentEntity = dwarf;
        } else if (currentType === 'visitor') {
          const visitor = state.visitors?.find(v => v.id === currentEntity.id);
          if (!visitor || visitor.state === 'dead') {
            this.hide();
            return;
          }
          // Update position if visitor moved (desktop only)
          if (window.innerWidth > MOBILE_BREAKPOINT && (visitor.x !== currentGridX || visitor.y !== currentGridY)) {
            currentGridX = visitor.x;
            currentGridY = visitor.y;
            positionPanel(visitor.x, visitor.y);
          }
          currentEntity = visitor;
        }
        return;
      }

      if (currentType === 'dwarf') {
        // Find the dwarf in current state (might have moved)
        const dwarf = state.dwarves.find(d => d.id === currentEntity.id);
        if (!dwarf) {
          this.hide();
          return;
        }

        // Update position if dwarf moved (desktop only)
        if (window.innerWidth > MOBILE_BREAKPOINT && (dwarf.x !== currentGridX || dwarf.y !== currentGridY)) {
          currentGridX = dwarf.x;
          currentGridY = dwarf.y;
          positionPanel(dwarf.x, dwarf.y);
        }

        // Re-render with fresh data
        currentEntity = dwarf;
        renderCurrentView();
      } else if (currentType === 'visitor') {
        // Find the visitor in current state (might have moved)
        const visitor = state.visitors?.find(v => v.id === currentEntity.id);
        if (!visitor || visitor.state === 'dead') {
          this.hide();
          return;
        }

        // Update position if visitor moved (desktop only)
        if (window.innerWidth > MOBILE_BREAKPOINT && (visitor.x !== currentGridX || visitor.y !== currentGridY)) {
          currentGridX = visitor.x;
          currentGridY = visitor.y;
          positionPanel(visitor.x, visitor.y);
        }

        // Re-render with fresh data
        currentEntity = visitor;
        renderCurrentView();
      }
    },

    /**
     * Get currently displayed entity
     */
    getEntity() {
      return currentEntity;
    },

    /**
     * Clean up panel
     */
    destroy() {
      panelEl.remove();
    },
  };
}


