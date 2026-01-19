/**
 * Stat Panel - displays detailed entity information
 * Shows dwarf stats, personality, fulfillment, and relationships
 */

import {
  getDwarfStats,
  getVisitorStats,
  getFoodStats,
  getMoodDescriptor,
  getHungerDescriptor,
  formatTileName
} from './inspection.js';

/**
 * Create a stat panel component
 * @param {HTMLElement} containerEl - Container to attach panel to
 * @param {HTMLElement} gridEl - The ASCII grid element for position calculations
 * @param {number} mapWidth - Map width in cells
 * @param {number} mapHeight - Map height in cells
 * @returns {object} Panel controller with show(), hide(), update()
 */
export function createStatPanel(containerEl, gridEl, mapWidth, mapHeight) {
  // Create panel element - positioned relative to cursor
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
    font-size: 12px;
    color: #ddd;
    z-index: 200;
    opacity: 0;
    pointer-events: none;
    transition: transform 320ms ease-in-out, opacity 200ms ease;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.6);
  `;

  containerEl.appendChild(panelEl);

  // Current displayed entity and position
  let currentEntity = null;
  let currentType = null;
  let currentGridX = 0;
  let currentGridY = 0;
  let worldState = null;

  /**
   * Calculate and set panel position near a grid cell
   */
  function positionPanel(gridX, gridY) {
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

    // If panel would overflow left, center it
    if (panelX < 0) {
      panelX = Math.max(8, (containerRect.width - panelWidth) / 2);
    }

    // If panel would overflow bottom, shift up
    if (panelY + panelHeight > containerRect.height) {
      panelY = Math.max(8, containerRect.height - panelHeight - 8);
    }

    // If panel would overflow top, shift down
    if (panelY < 0) {
      panelY = 8;
    }

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
        border-radius: 3px;
        padding: 2px 6px;
        margin: 2px;
        font-size: 10px;
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
        <div style="margin: 8px 0; padding: 8px; background: rgba(40, 35, 30, 0.6); border-left: 2px solid #887755; font-style: italic; color: #aa9977; font-size: 11px;">
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
        <div style="margin-top: 8px; color: #888; font-size: 11px;">
          Knows ${stats.relationshipCount} dwarf${stats.relationshipCount > 1 ? 's' : ''}
          ${stats.bestFriend ? ` (closest: ID ${stats.bestFriend.id})` : ''}
        </div>
      `;
    }

    return `
      <div style="padding: 12px;">
        <!-- Header -->
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 24px; color: #ff0; margin-right: 8px;">🧌</span>
          <div>
            <div style="font-size: 15px; font-weight: bold; color: #fff;">${stats.generatedName || stats.name}</div>
            <div style="font-size: 10px; color: #666;">Dwarf #${stats.id}</div>
          </div>
        </div>

        ${bioSection}

        <!-- State -->
        <div style="margin: 8px 0; padding: 6px; background: rgba(40, 40, 50, 0.8); border-radius: 4px;">
          <span style="color: #888;">Status:</span>
          <span style="color: #4aff9e; margin-left: 4px;">${stats.state}</span>
        </div>

        ${thoughtSection}

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

        <!-- Close hint -->
        <div style="margin-top: 12px; text-align: center; color: #666; font-size: 10px;">
          Click elsewhere to close
        </div>
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
          <div>
            <div style="font-size: 16px; font-weight: bold; color: #fff;">Food Source</div>
            <div style="font-size: 11px; color: #888;">ID ${stats.id}</div>
          </div>
        </div>

        <div style="margin: 8px 0;">
          <span style="color: #888;">Servings remaining:</span>
          <span style="color: #4aff4a; font-size: 18px; margin-left: 8px;">${stats.amount}</span>
        </div>

        <div style="color: #666; font-size: 11px; margin-top: 8px;">
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
        <div style="margin: 8px 0; padding: 8px; background: rgba(40, 35, 30, 0.6); border-left: 2px solid #887755; font-style: italic; color: #aa9977; font-size: 11px;">
          ${stats.bio}
        </div>
      `;
    }

    return `
      <div style="padding: 12px;">
        <!-- Header -->
        <div style="display: flex; align-items: center; margin-bottom: 8px;">
          <span style="font-size: 20px; margin-right: 8px;">${getRaceEmoji(stats.race)}</span>
          <div>
            <div style="font-size: 15px; font-weight: bold; color: #fff;">${stats.name}</div>
            <div style="font-size: 10px; color: #666;">${stats.race} ${stats.role} #${stats.id}</div>
          </div>
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
          <div style="margin: 4px 0; color: #888; font-size: 11px;">Damage: <span style="color: #ffaa66;">${stats.damage}</span></div>
        </div>

        <!-- Goal Progress -->
        ${stats.satisfactionThreshold ? `
          <div style="margin-top: 12px;">
            <div style="color: #aaa; margin-bottom: 6px; font-weight: bold;">Goal Progress</div>
            ${createStatBar('Satisfaction', stats.satisfaction, stats.satisfactionThreshold, '#4a9eff')}
          </div>
        ` : ''}

        <!-- Close hint -->
        <div style="margin-top: 12px; text-align: center; color: #666; font-size: 10px;">
          Click elsewhere to close
        </div>
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
          <div>
            <div style="font-size: 16px; font-weight: bold; color: #fff;">${formatTileName(tile.type)}</div>
            <div style="font-size: 11px; color: #888;">(${x}, ${y})</div>
          </div>
        </div>

        <div style="margin: 8px 0; color: #888;">
          <div>Walkable: ${walkable ? '<span style="color: #4aff4a;">Yes</span>' : '<span style="color: #ff4a4a;">No</span>'}</div>
          ${harvestable ? `<div>Harvestable: <span style="color: #4aff9e;">Yes</span></div>` : ''}
          ${tile.resourceAmount > 0 ? `<div>Resources: ${tile.resourceAmount}</div>` : ''}
        </div>
      </div>
    `;
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

      // Priority: dwarf > visitor > food > tile
      if (entities.length > 0) {
        const first = entities[0];
        if (first.type === 'dwarf') {
          currentEntity = first.entity;
          currentType = 'dwarf';
          const stats = getDwarfStats(first.entity);
          panelEl.innerHTML = renderDwarf(stats);
        } else if (first.type === 'visitor') {
          currentEntity = first.entity;
          currentType = 'visitor';
          const stats = getVisitorStats(first.entity);
          panelEl.innerHTML = renderVisitor(stats);
        } else if (first.type === 'food') {
          currentEntity = first.entity;
          currentType = 'food';
          const stats = getFoodStats(first.entity);
          panelEl.innerHTML = renderFood(stats);
        }
      } else if (tile) {
        currentEntity = null;
        currentType = 'tile';
        panelEl.innerHTML = renderTile(tile, x, y);
      } else {
        return; // Nothing to show
      }

      // Position panel near the clicked cell
      positionPanel(x, y);

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

      if (!currentEntity || currentType !== 'dwarf') return;

      // Find the dwarf in current state (might have moved)
      const dwarf = state.dwarves.find(d => d.id === currentEntity.id);
      if (!dwarf) {
        this.hide();
        return;
      }

      // Update position if dwarf moved
      if (dwarf.x !== currentGridX || dwarf.y !== currentGridY) {
        currentGridX = dwarf.x;
        currentGridY = dwarf.y;
        positionPanel(dwarf.x, dwarf.y);
      }

      // Re-render with fresh data
      currentEntity = dwarf;
      const stats = getDwarfStats(dwarf);
      panelEl.innerHTML = renderDwarf(stats);
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
