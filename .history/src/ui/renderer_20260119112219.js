/**
 * ASCII Renderer
 * Renders map tiles and entities to a grid of <span> elements.
 * Entities overlay tiles based on zIndex (higher = on top).
 * Scales to fill available browser space.
 */

import { getTileDef } from '../map/tiles.js';
import { getTile } from '../map/map.js';
import { getDigDesignations, getBuildProjects, getStructures } from '../sim/construction.js';

/**
 * Calculate optimal font size to fill container while maintaining aspect ratio.
 * @param {HTMLElement} containerEl - Container element
 * @param {number} width - Map width in cells
 * @param {number} height - Map height in cells
 * @returns {number} Optimal font size in pixels
 */
function calculateFontSize(containerEl, width, height) {
  const rect = containerEl.getBoundingClientRect();
  const availableWidth = rect.width - 8;  // padding
  const availableHeight = rect.height - 8;

  // Character aspect ratio ~0.6 (width:height)
  const charAspect = 0.6;
  const lineHeight = 1.15;

  // Calculate font size based on width and height constraints
  const fontByWidth = availableWidth / (width * charAspect);
  const fontByHeight = availableHeight / (height * lineHeight);

  // Use the smaller to ensure it fits
  return Math.floor(Math.min(fontByWidth, fontByHeight));
}

/**
 * Creates an ASCII renderer attached to a container element.
 * Automatically scales to fill available space.
 * @param {HTMLElement} containerEl - Container to render into
 * @param {number} width - Map width in cells
 * @param {number} height - Map height in cells
 * @returns {object} Renderer instance with render() and destroy() methods
 */
export function createRenderer(containerEl, width, height) {
  // Calculate initial font size
  let fontSize = calculateFontSize(containerEl, width, height);
  fontSize = Math.max(8, Math.min(fontSize, 24));  // Clamp between 8-24px

  // Create grid container
  const gridEl = document.createElement('div');
  gridEl.className = 'ascii-grid';
  gridEl.style.cssText = `
    display: grid;
    grid-template-columns: repeat(${width}, 1fr);
    grid-template-rows: repeat(${height}, 1fr);
    font-family: 'Courier New', 'Consolas', 'Monaco', monospace;
    font-size: ${fontSize}px;
    line-height: 1.15;
    background: #0a0a0a;
    padding: 4px;
    user-select: none;
    width: 100%;
    height: 100%;
    box-sizing: border-box;
  `;

  // Create cell elements (row-major order)
  const cells = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = document.createElement('span');
      cell.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      `;
      cell.textContent = ' ';
      gridEl.appendChild(cell);
      cells.push(cell);
    }
  }

  containerEl.appendChild(gridEl);

  // Handle window resize
  let resizeTimeout;
  function handleResize() {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      const newFontSize = calculateFontSize(containerEl, width, height);
      const clampedSize = Math.max(8, Math.min(newFontSize, 24));
      gridEl.style.fontSize = `${clampedSize}px`;
    }, 100);
  }

  window.addEventListener('resize', handleResize);

  // Cache for dirty checking
  let prevState = new Array(width * height).fill(null);

  /**
   * Builds a lookup of position -> entity with highest zIndex.
   * @param {Array} entities - Array of entity objects
   * @returns {Map} Map of "x,y" -> entity
   */
  function buildEntityLookup(entities) {
    const lookup = new Map();
    for (const entity of entities) {
      const key = `${entity.x},${entity.y}`;
      const existing = lookup.get(key);
      if (!existing || (entity.zIndex ?? 0) > (existing.zIndex ?? 0)) {
        lookup.set(key, entity);
      }
    }
    return lookup;
  }

  /**
   * Renders the map and entities to the grid.
   * @param {object} map - Map object with tiles flat array
   * @param {Array} entities - Array of entity objects with x, y, char, fg, zIndex
   */
  function render(map, entities = []) {
    const entityLookup = buildEntityLookup(entities);

    // Get biome color modifiers if available
    const biomeColorMod = map.biome?.colorMod || null;

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        const cell = cells[idx];

        // Get tile data (map uses flat array)
        const tile = getTile(map, x, y);
        // Apply biome color modifiers to tile colors
        const tileDef = tile ? getTileDef(tile, biomeColorMod) : null;

        // Check for entity at this position
        const entity = entityLookup.get(`${x},${y}`);

        // Determine what to render
        let char, fg, bg;

        if (entity) {
          // Entity overlays tile
          char = entity.char;
          fg = entity.fg ?? '#fff';
          bg = tileDef?.bg ?? '#000';
        } else if (tileDef) {
          // Just tile
          char = tileDef.char;
          fg = tileDef.fg;
          bg = tileDef.bg ?? '#000';
        } else {
          // Empty/undefined
          char = ' ';
          fg = '#fff';
          bg = '#000';
        }

        // Dirty check: only update DOM if changed
        const stateKey = `${char}|${fg}|${bg}`;
        if (prevState[idx] !== stateKey) {
          cell.textContent = char;
          cell.style.color = fg;
          cell.style.backgroundColor = bg;
          prevState[idx] = stateKey;
        }
      }
    }
  }

  /**
   * Cleans up the renderer and removes elements from DOM.
   */
  function destroy() {
    window.removeEventListener('resize', handleResize);
    gridEl.remove();
    cells.length = 0;
    prevState = [];
  }

  return {
    render,
    destroy,
    /** Expose grid element for styling */
    el: gridEl,
  };
}

/**
 * Default entity render definitions (rot.js inspired palette).
 * Systems should use these when creating entities.
 */
export const EntityGlyph = Object.freeze({
  // Dwarves - yellow/gold like traditional roguelike @
  DWARF: { char: '@', fg: '#ff0', zIndex: 10 },
  DWARF_HUNGRY: { char: '@', fg: '#ffa500', zIndex: 10 },
  DWARF_STARVING: { char: '@', fg: '#ff4444', zIndex: 10 },
  DWARF_WOUNDED: { char: '@', fg: '#ff6666', zIndex: 10 },

  // Visitors - external races
  HUMAN: { char: '@', fg: '#ddcc88', zIndex: 10 },
  HUMAN_HOSTILE: { char: '@', fg: '#cc8844', zIndex: 10 },
  GOBLIN: { char: 'g', fg: '#88cc44', zIndex: 10 },
  GOBLIN_HOSTILE: { char: 'g', fg: '#cc4444', zIndex: 10 },
  ELF: { char: 'e', fg: '#aaddff', zIndex: 10 },

  // Food - green percent sign (traditional roguelike food)
  FOOD: { char: '%', fg: '#32cd32', zIndex: 5 },

  // Corpse - red/gray
  CORPSE: { char: '%', fg: '#8b0000', zIndex: 3 },

  // Items (future)
  ITEM: { char: '?', fg: '#00bfff', zIndex: 4 },

  // Construction
  DIG_DESIGNATION: { char: 'x', fg: '#886644', zIndex: 2 },
  BUILD_MARKER: { char: '░', fg: '#777766', zIndex: 3 },
  RESOURCE_STONE: { char: '∙', fg: '#999988', zIndex: 4 },
  RESOURCE_WOOD: { char: '≡', fg: '#aa8855', zIndex: 4 },
});

/**
 * Update status panel elements
 * @param {object} state - World state
 */
export function updateStatus(state) {
  const tickEl = document.getElementById('tick-display');
  const dwarfEl = document.getElementById('dwarf-count');
  const foodEl = document.getElementById('food-count');

  if (tickEl) tickEl.textContent = state.tick;
  if (dwarfEl) dwarfEl.textContent = state.dwarves.length;
  if (foodEl) foodEl.textContent = state.foodSources.length;
}

/**
 * Build entity list for renderer from world state
 * @param {object} state - World state
 * @returns {Array} Entity objects for render()
 */
export function buildRenderEntities(state) {
  const entities = [];

  // Dig designations (lowest priority - easily overridden)
  try {
    const digDesignations = getDigDesignations();
    for (const dig of digDesignations) {
      entities.push({
        x: dig.x,
        y: dig.y,
        char: EntityGlyph.DIG_DESIGNATION.char,
        fg: EntityGlyph.DIG_DESIGNATION.fg,
        zIndex: EntityGlyph.DIG_DESIGNATION.zIndex,
      });
    }
  } catch (e) {
    // Construction system not initialized yet
  }

  // Build projects in progress
  try {
    const buildProjects = getBuildProjects();
    for (const project of buildProjects) {
      if (project.phase === 'complete') continue;

      // Show build markers at corners and center to indicate project area
      const markers = [
        { x: project.x, y: project.y },
        { x: project.x + project.width - 1, y: project.y },
        { x: project.x, y: project.y + project.height - 1 },
        { x: project.x + project.width - 1, y: project.y + project.height - 1 },
      ];

      // Progress indicator at center
      const cx = project.x + Math.floor(project.width / 2);
      const cy = project.y + Math.floor(project.height / 2);
      const progress = project.progress / project.workRequired;

      // Color shifts from dark to bright as progress increases
      const r = Math.floor(100 + progress * 100);
      const g = Math.floor(100 + progress * 50);
      const b = Math.floor(80 + progress * 20);

      entities.push({
        x: cx,
        y: cy,
        char: project.phase === 'digging' ? '⌂' : '▓',
        fg: `rgb(${r},${g},${b})`,
        zIndex: 3,
      });

      // Corner markers
      for (const marker of markers) {
        entities.push({
          x: marker.x,
          y: marker.y,
          char: EntityGlyph.BUILD_MARKER.char,
          fg: EntityGlyph.BUILD_MARKER.fg,
          zIndex: EntityGlyph.BUILD_MARKER.zIndex,
        });
      }
    }
  } catch (e) {
    // Construction system not initialized yet
  }

  // Resources on the ground
  if (state.resources) {
    for (const resource of state.resources) {
      if (resource.amount <= 0) continue;

      let glyph = EntityGlyph.RESOURCE_STONE;
      if (resource.type === 'wood') {
        glyph = EntityGlyph.RESOURCE_WOOD;
      }

      entities.push({
        x: resource.x,
        y: resource.y,
        char: glyph.char,
        fg: glyph.fg,
        zIndex: glyph.zIndex,
      });
    }
  }

  // Food sources
  for (const food of state.foodSources) {
    if (food.amount > 0) {
      entities.push({
        x: food.x,
        y: food.y,
        char: EntityGlyph.FOOD.char,
        fg: EntityGlyph.FOOD.fg,
        zIndex: EntityGlyph.FOOD.zIndex
      });
    }
  }

  // Dwarves - color indicates hunger/health state
  for (const dwarf of state.dwarves) {
    let glyph = EntityGlyph.DWARF;

    // Health takes priority for coloring
    if (dwarf.hp < dwarf.maxHp * 0.5) {
      glyph = EntityGlyph.DWARF_WOUNDED;
    } else if (dwarf.hunger > 75) {
      glyph = EntityGlyph.DWARF_STARVING;
    } else if (dwarf.hunger > 50) {
      glyph = EntityGlyph.DWARF_HUNGRY;
    }

    entities.push({
      x: dwarf.x,
      y: dwarf.y,
      char: glyph.char,
      fg: glyph.fg,
      zIndex: glyph.zIndex
    });
  }

  // Visitors - external forces
  if (state.visitors) {
    for (const visitor of state.visitors) {
      if (visitor.state === 'dead') continue;

      let char, fg;

      // Determine glyph based on race
      switch (visitor.race) {
        case 'human':
          char = EntityGlyph.HUMAN.char;
          fg = visitor.disposition < -20 ? EntityGlyph.HUMAN_HOSTILE.fg : EntityGlyph.HUMAN.fg;
          break;
        case 'goblin':
          char = EntityGlyph.GOBLIN.char;
          fg = visitor.disposition < -20 ? EntityGlyph.GOBLIN_HOSTILE.fg : EntityGlyph.GOBLIN.fg;
          break;
        case 'elf':
          char = EntityGlyph.ELF.char;
          fg = EntityGlyph.ELF.fg;
          break;
        default:
          char = '?';
          fg = '#ffffff';
      }

      // Tint wounded visitors redder
      if (visitor.hp < visitor.maxHp * 0.5) {
        fg = blendColor(fg, '#ff4444', 0.4);
      }

      entities.push({
        x: visitor.x,
        y: visitor.y,
        char,
        fg,
        zIndex: 10,
        name: visitor.name,
      });
    }
  }

  return entities;
}

/**
 * Blend two hex colors
 */
function blendColor(color1, color2, ratio) {
  const hex = (c) => parseInt(c.slice(1), 16);
  const r = (c) => (c >> 16) & 255;
  const g = (c) => (c >> 8) & 255;
  const b = (c) => c & 255;

  const c1 = hex(color1);
  const c2 = hex(color2);

  const rr = Math.round(r(c1) * (1 - ratio) + r(c2) * ratio);
  const gg = Math.round(g(c1) * (1 - ratio) + g(c2) * ratio);
  const bb = Math.round(b(c1) * (1 - ratio) + b(c2) * ratio);

  return `#${((rr << 16) | (gg << 8) | bb).toString(16).padStart(6, '0')}`;
}
