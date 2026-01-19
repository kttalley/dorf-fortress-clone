/**
 * Stat Panel - displays detailed entity information
 * Shows dwarf stats, personality, fulfillment, and relationships
 * Always prefers LLM-generated names/bios
 */

import {
  getDwarfStats,
  getFoodStats,
  getMoodDescriptor,
  getHungerDescriptor,
  formatTileName
} from './inspection.js';
import { isNamePending, hasGeneratedName } from '../llm/nameGenerator.js';

/**
 * Create a stat panel component
 */
export function createStatPanel(containerEl, gridEl, mapWidth, mapHeight) {
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

  let currentEntity = null;
  let currentType = null;
  let currentGridX = 0;
  let currentGridY = 0;
  let worldState = null;

  // --- Positioning ---
  function positionPanel(gridX, gridY) {
    if (!gridEl) return;

    const gridRect = gridEl.getBoundingClientRect();
    const containerRect = containerEl.getBoundingClientRect();

    const cellWidth = gridRect.width / mapWidth;
    const cellHeight = gridRect.height / mapHeight;

    const cellLeft = (gridRect.left - containerRect.left) + (gridX * cellWidth);
    const cellTop = (gridRect.top - containerRect.top) + (gridY * cellHeight);

    const panelWidth = 260;
    const panelHeight = panelEl.offsetHeight || 300;

    let panelX = cellLeft + cellWidth + 12;
    let panelY = cellTop;

    if (panelX + panelWidth > containerRect.width) panelX = cellLeft - panelWidth - 12;
    if (panelX < 0) panelX = Math.max(8, (containerRect.width - panelWidth) / 2);
    if (panelY + panelHeight > containerRect.height) panelY = Math.max(8, containerRect.height - panelHeight - 8);
    if (panelY < 0) panelY = 8;

    panelEl.style.transform = `translate(${panelX}px, ${panelY}px)`;
  }

  // --- Stat bars ---
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

  function createFulfillmentSection(fulfillment) {
    if (!fulfillment) return '';

    const needs = [
      { key: 'social', label: 'Social', color: '#4a9eff' },
      { key: 'exploration', label: 'Exploration', color: '#4aff9e' },
      { key: 'creativity', label: 'Creativity', color: '#ff9e4a' },
      { key: 'tranquility', label: 'Tranquility', color: '#9e4aff' },
    ];

    return `
      <div style="margin-top: 12px; border-top: 1px solid #333; padding-top: 8px;">
        <div style="color: #aaa; margin-bottom: 6px; font-weight: bold;">Fulfillment</div>
        ${needs.map(n => createStatBar(n.label, fulfillment[n.key], 100, n.color)).join('')}
      </div>
    `;
  }

  function createTraitsDisplay(traits) {
    if (!traits || traits.length === 0) return '';
    return `
      <div style="margin: 8px 0;">
        <span style="color: #888;">Traits: </span>
        ${traits.map(t => `<span style="
          display: inline-block;
          background: rgba(100,100,120,0.3);
          border: 1px solid rgba(100,100,120,0.5);
          border-radius: 3px;
          padding: 2px 6px;
          margin: 2px;
          font-size: 10px;
        ">${t}</span>`).join('')}
      </div>
    `;
  }

  // --- Render dwarf ---
  function renderDwarf(stats) {
    const name = stats.generatedName || stats.name;
    const moodColor = stats.mood > 60 ? '#4aff4a' : stats.mood > 30 ? '#ffff4a' : '#ff4a4a';
    const hungerColor = stats.hunger < 30 ? '#4aff4a' : stats.hunger < 60 ? '#ffff4a' : '#ff4a4a';

    const bioSection = stats.generatedBio
      ? `<div style="margin: 8px 0; padding: 8px; background: rgba(40,35,30,0.6); border-left:2px solid #887755; font-style:italic; color:#aa9977; font-size:11px;">
          ${stats.generatedBio}
        </div>`
      : '';

    const thoughtSection = stats.currentThought
      ? `<div style="margin:8px 0; padding:8px; background: rgba(50,50,60,0.5); border-radius:4px; font-style:italic; color:#bbb;">
          "${stats.currentThought}"
        </div>`
      : '';

    const relationshipSection = stats.relationshipCount > 0
      ? `<div style="margin-top:8px; color:#888; font-size:11px;">
          Knows ${stats.relationshipCount} dwarf${stats.relationshipCount>1?'s':''}
          ${stats.bestFriend ? ` (closest: ID ${stats.bestFriend.id})` : ''}
        </div>`
      : '';

    return `
      <div style="padding:12px;">
        <div style="display:flex; align-items:center; margin-bottom:8px;">
          <span style="font-size:24px; color:#ff0; margin-right:8px;">@</span>
          <div>
            <div style="font-size:15px; font-weight:bold; color:#fff;">${name}</div>
            <div style="font-size:10px; color:#666;">Dwarf #${stats.id}</div>
          </div>
        </div>

        ${bioSection}

        <div style="margin:8px 0; padding:6px; background: rgba(40,40,50,0.8); border-radius:4px;">
          <span style="color:#888;">Status:</span>
          <span style="color:#4aff9e; margin-left:4px;">${stats.state}</span>
        </div>

        ${thoughtSection}
        <div style="margin-top:12px;">
          <div style="color:#aaa; margin-bottom:6px; font-weight:bold;">Vitals</div>
          ${createStatBar(`Mood (${getMoodDescriptor(stats.mood)})`, stats.mood, 100, moodColor)}
          ${createStatBar(`Hunger (${getHungerDescriptor(stats.hunger)})`, 100 - stats.hunger, 100, hungerColor)}
          ${createStatBar('Wellbeing', stats.wellbeing, 100, '#4affff')}
        </div>

        ${createTraitsDisplay(stats.traits)}
        ${createFulfillmentSection(stats.fulfillment)}
        ${relationshipSection}

        <div style="margin-top:12px; text-align:center; color:#666; font-size:10px;">
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
    show(inspection) {
      const { x, y, tile, entities } = inspection;
      currentGridX = x;
      currentGridY = y;

      if (entities.length > 0) {
        const first = entities[0];
        if (first.type === 'dwarf') {
          currentEntity = first.entity;
          currentType = 'dwarf';
          const stats = getDwarfStats(currentEntity);
          panelEl.innerHTML = renderDwarf(stats);
        } else if (first.type === 'food') {
          currentEntity = first.entity;
          currentType = 'food';
          const stats = getFoodStats(currentEntity);
          panelEl.innerHTML = renderFood(stats);
        }
      } else if (tile) {
        currentEntity = null;
        currentType = 'tile';
        panelEl.innerHTML = renderTile(tile, x, y);
      } else return;

      positionPanel(x, y);
      panelEl.style.opacity = '1';
      panelEl.style.pointerEvents = 'auto';
    },

    hide() {
      panelEl.style.opacity = '0';
      panelEl.style.pointerEvents = 'none';
      currentEntity = null;
      currentType = null;
    },

    isVisible() {
      return panelEl.style.opacity === '1';
    },

    update(state) {
      worldState = state;
      if (!currentEntity || currentType !== 'dwarf') return;

      const dwarf = state.dwarves.find(d => d.id === currentEntity.id);
      if (!dwarf) {
        this.hide();
        return;
      }

      currentGridX = dwarf.x;
      currentGridY = dwarf.y;
      positionPanel(dwarf.x, dwarf.y);

      // Always use latest LLM-generated name and bio
      currentEntity = dwarf;
      const stats = getDwarfStats(dwarf);
      panelEl.innerHTML = renderDwarf(stats);
    },

    getEntity() {
      return currentEntity;
    },

    destroy() {
      panelEl.remove();
    },
  };
}
