/**
 * ASCII Renderer
 * Renders map tiles and entities to a grid of <span> elements.
 * Entities overlay tiles based on zIndex (higher = on top).
 * Scales to fill available browser space.
 */

import { getTileDef } from '../map/tiles.js';
import { getTile } from '../map/map.js';
import { getDigDesignations, getBuildProjects, getStructures } from '../sim/construction.js';
import { composeWeatherTile } from '../ui/weatherRenderer.js';
import { getActiveSpeakers } from '../ui/speechBubble.js';
import { getSprite, hasSprite } from '../ui/sprites.js';

// Fixed font size for consistent tile rendering (no scrunching)
const FIXED_FONT_SIZE = 16;

// Procedural sprites are line-art on a transparent field, so they read smaller
// than the emoji glyphs they replace. Boost every sprite entity above its base
// (emoji-tuned) scale so the figures clearly stand off the surrounding tileset.
const SPRITE_SCALE_BOOST = 1.3;

/**
 * Calculate optimal font size to fill container while maintaining aspect ratio.
 * On mobile/small screens, returns fixed size to prevent scrunching.
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

  const calculatedSize = Math.floor(Math.min(fontByWidth, fontByHeight));

  // On small screens, use fixed size to prevent scrunching (enable scrolling instead)
  // If calculated size would be less than fixed size, use fixed size
  if (calculatedSize < FIXED_FONT_SIZE) {
    return FIXED_FONT_SIZE;
  }

  return calculatedSize;
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

  // Calculate grid dimensions based on font size
  const charAspect = 0.6;
  const lineHeight = 1.15;
  const cellWidth = fontSize * charAspect;
  const cellHeight = fontSize * lineHeight;
  const gridWidth = width * cellWidth + 8; // +8 for padding
  const gridHeight = height * cellHeight + 8;

  // Create grid container with fixed dimensions (no scrunching)
  const gridEl = document.createElement('div');
  gridEl.className = 'ascii-grid';
  gridEl.style.cssText = `
    display: grid;
    grid-template-columns: repeat(${width}, ${cellWidth}px);
    grid-template-rows: repeat(${height}, ${cellHeight}px);
    font-family: 'Courier New', 'Consolas', 'Monaco', monospace;
    font-size: ${fontSize}px;
    line-height: 1.15;
    background: #0a0a0a;
    padding: 4px;
    user-select: none;
    width: ${gridWidth}px;
    min-width: ${gridWidth}px;
    height: ${gridHeight}px;
    min-height: ${gridHeight}px;
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
      const clampedSize = Math.max(FIXED_FONT_SIZE, Math.min(newFontSize, 24));

      // Recalculate grid dimensions
      const newCellWidth = clampedSize * charAspect;
      const newCellHeight = clampedSize * lineHeight;
      const newGridWidth = width * newCellWidth + 8;
      const newGridHeight = height * newCellHeight + 8;

      gridEl.style.fontSize = `${clampedSize}px`;
      gridEl.style.gridTemplateColumns = `repeat(${width}, ${newCellWidth}px)`;
      gridEl.style.gridTemplateRows = `repeat(${height}, ${newCellHeight}px)`;
      gridEl.style.width = `${newGridWidth}px`;
      gridEl.style.minWidth = `${newGridWidth}px`;
      gridEl.style.height = `${newGridHeight}px`;
      gridEl.style.minHeight = `${newGridHeight}px`;
    }, 100);
  }

  window.addEventListener('resize', handleResize);

  // Cache for dirty checking
  let prevState = new Array(width * height).fill(null);

  // Procedural-hybrid sprites are always on; emoji remains the fallback for
  // entity types that don't have a template yet (via hasSprite()).
  const spriteMode = true;

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
    const activeSpeakers = getActiveSpeakers();
    const activeSpeakerIds = new Set(activeSpeakers.map(s => s.id));

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

        // Determine what to render. The tile underlay is always resolved so
        // sprite entities can leave the terrain glyph visible beneath their
        // transparent pixels.
        let tileChar = ' ';
        let tileFg = '#fff';
        if (tileDef) {
          // Tile - check if it has animation frames
          if (tileDef.animated && tileDef.chars && map.state) {
            // Animate the character. Each tile type can set its own
            // animPeriod (ticks per frame) so flowers sway slower than
            // water ripples; a per-position phase offset keeps neighboring
            // tiles out of lockstep for an organic shimmer.
            const period = tileDef.animPeriod || 4;
            const offset = (x * 7 + y * 13) % tileDef.chars.length;
            const phase = (Math.floor(map.state.tick / period) + offset) % tileDef.chars.length;
            tileChar = tileDef.chars[phase];
          } else {
            tileChar = tileDef.char;
          }
          tileFg = tileDef.fg;
        }

        let char, fg;
        let bg = tileDef?.bg ?? '#000';
        if (entity) {
          // Entity overlays tile
          char = entity.char;
          fg = entity.fg ?? '#fff';
        } else {
          char = tileChar;
          fg = tileFg;
        }

        // Phase 3: Apply weather rendering if available.
        // Weather blends with the tile proportionally to intensity and
        // never replaces an entity glyph (only tints its background).
        const weatherSimulator = map.weather || (map.state && map.state.weather);
        if (weatherSimulator) {
          const weatherComposed = composeWeatherTile(
            x, y, { char, fg, bg }, map.state?.tick || 0, weatherSimulator, !!entity
          );
          if (weatherComposed) {
            char = weatherComposed.char;
            fg = weatherComposed.fg;
            bg = weatherComposed.bg;
          }
        }

        // Dirty check: only update DOM if changed
        const isDwarf = entity && entity.spriteKey === 'dwarf';
        const isSpeaking = isDwarf && entity && activeSpeakerIds.has(entity.id);

        // Resolve a procedural-hybrid sprite when enabled and one exists for
        // this entity type; otherwise fall back to the emoji/ASCII glyph.
        let spriteUri = null;
        if (spriteMode && entity && entity.spriteKey && hasSprite(entity.spriteKey)) {
          spriteUri = getSprite(
            entity.spriteKey,
            entity.seed ?? entity.id ?? entity.spriteKey,
            entity.spriteTint || null
          );
        }

        const stateKey = spriteUri
          ? `${spriteUri}|${tileChar}|${tileFg}|${bg}|${isSpeaking}`
          : `${char}|${fg}|${bg}|${isDwarf}|${isSpeaking}`;
        if (prevState[idx] !== stateKey) {
          if (spriteUri) {
            // Sprite cell: the tile keeps rendering in the cell itself
            // (glyph + bg), while the sprite floats above it in a
            // transparent overlay child. Scaling the overlay instead of the
            // cell keeps the cell's bg square from covering neighbor tiles.
            cell.textContent = tileChar;
            cell.style.color = tileFg;
            cell.style.backgroundImage = '';
            cell.style.backgroundColor = bg;
            const overlay = document.createElement('span');
            overlay.style.cssText =
              'position:absolute;inset:0;pointer-events:none;'
              + `background-image:url("${spriteUri}");`
              + 'background-size:contain;background-repeat:no-repeat;'
              + 'background-position:center;image-rendering:pixelated;'
              + `transform:scale(${(entity.scale || 1) * SPRITE_SCALE_BOOST});`;
            if (isSpeaking) {
              // Warm illumination glow — as if lit while speaking
              overlay.style.animation = 'pulse-glow 1.6s ease-in-out infinite';
              overlay.style.filter = 'drop-shadow(0 0 4px rgba(255,235,170,0.95)) drop-shadow(0 0 9px rgba(255,205,120,0.7))';
            } else {
              overlay.style.filter = 'drop-shadow(0 1px 2px rgba(0,0,0,0.6))';
            }
            cell.appendChild(overlay);
            cell.style.position = 'relative';
            cell.style.overflow = 'visible';
            cell.style.transform = 'scale(1)';
            cell.style.fontWeight = 'normal';
            cell.style.zIndex = '100';
            cell.style.textShadow = 'none';
            cell.style.animation = 'none';
            cell.style.filter = 'none';
            prevState[idx] = stateKey;
            continue;
          }

          // Setting textContent also drops any sprite overlay child left
          // from a previous frame.
          cell.textContent = char;
          cell.style.color = fg;
          if (cell.style.backgroundImage) cell.style.backgroundImage = '';
          cell.style.position = '';
          cell.style.overflow = 'hidden';
          cell.style.backgroundColor = bg;

          // Apply visual treatment based on entity type. Sub-1.0 scales
          // matter too: animals render at half humanoid size.
          if (entity && entity.scale && entity.scale !== 1.0) {
            cell.style.transform = `scale(${entity.scale})`;
            cell.style.fontWeight = entity.scale > 1.0 ? 'bold' : 'normal';
            cell.style.zIndex = '100';
            
            // Enhance shadow if speaking - highlight outline effect
            if (isSpeaking && entity.shadow) {
              // Outline-style highlight around speaking entities (semi-transparent)
              cell.style.textShadow = `
                -2px -2px 0 rgba(255, 255, 0, 0.5),
                2px -2px 0 rgba(255, 255, 0, 0.5),
                -2px 2px 0 rgba(255, 255, 0, 0.5),
                2px 2px 0 rgba(255, 255, 0, 0.5),
                -1px 0 0 rgba(255, 255, 0, 0.35),
                1px 0 0 rgba(255, 255, 0, 0.35),
                0 -1px 0 rgba(255, 255, 0, 0.35),
                0 1px 0 rgba(255, 255, 0, 0.35)
              `;
              // Subtle drop shadow only
              cell.style.filter = 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.6))';
              // Pulsing outline animation
              cell.style.animation = 'pulse-outline 1.5s ease-in-out infinite';
            } else if (entity.shadow) {
              cell.style.textShadow = entity.shadow;
              cell.style.animation = 'none';
              if (entity.filter) {
                cell.style.filter = entity.filter;
              }
            }
          } else {
            cell.style.transform = 'scale(1)';
            cell.style.textShadow = 'none';
            cell.style.fontWeight = 'normal';
            cell.style.zIndex = 'auto';
            cell.style.filter = 'none';
            cell.style.animation = 'none';
          }
          
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
    // Cancel any in-flight pan animation, pending return pan, and the
    // follow-the-dwarves watchdog
    animToken++;
    panSeq++;
    clearInterval(followTimerId);
    containerEl.removeEventListener('wheel', markUserInteraction);
    containerEl.removeEventListener('touchmove', markUserInteraction);
    containerEl.removeEventListener('pointerdown', markUserInteraction);
    if (returnTimerId !== null) {
      clearTimeout(returnTimerId);
      returnTimerId = null;
    }
    gridEl.remove();
    cells.length = 0;
    prevState = [];
  }

  // --- Camera pan sequencing --------------------------------------------
  // Rule: every pan that targets something other than the dwarves must
  // conclude by panning back to the dwarves' average position. Each pan
  // bumps `panSeq`; a queued return-pan only fires if no newer pan has
  // started during its dwell, which prevents pan loops and races.
  let dwarvesProvider = null;    // () => current dwarf list (set by main.js)
  let lastDwarves = null;        // Fallback: last dwarf list explicitly panned to
  let panSeq = 0;                // Incremented at the start of every pan
  let returnTimerId = null;      // Pending return-to-dwarves dwell timer
  let animToken = 0;             // Cancels superseded RAF pan animations
  const RETURN_DWELL_MS = 2000;  // Let the player see the event before returning
  const RETURN_PAN_MS = 2200;    // Duration of the chained return pan
  const NATIVE_SCROLL_MS = 500;  // Approx. duration of browser-native smooth scroll

  /**
   * Register a getter for the live dwarf list so non-dwarf pans can chain
   * a return pan even if no dwarf pan has happened yet.
   */
  function setDwarvesProvider(fn) {
    dwarvesProvider = fn;
  }

  function getReturnDwarves() {
    const live = typeof dwarvesProvider === 'function' ? dwarvesProvider() : null;
    if (live && live.length > 0) return live;
    if (lastDwarves && lastDwarves.length > 0) return lastDwarves;
    return null;
  }

  // --- Follow-the-dwarves watchdog ---------------------------------------
  // The camera must ALWAYS end up on the dwarves: event pans chain a return
  // pan, and this loop covers everything else (dwarves wandering away from a
  // settled camera). It stays hands-off while a pan is in flight, while a
  // return pan is queued, or right after the player scrolled manually.
  let panInFlight = false;            // An animated pan is running
  let lastUserInteraction = 0;        // Last manual wheel/touch/drag on the map
  const FOLLOW_INTERVAL_MS = 4000;    // How often the watchdog checks
  const FOLLOW_GRACE_MS = 8000;       // Leave the player alone after manual scrolling
  const FOLLOW_THRESHOLD_CELLS = 7;   // Re-center when the centroid drifts this far

  const markUserInteraction = () => { lastUserInteraction = Date.now(); };
  containerEl.addEventListener('wheel', markUserInteraction, { passive: true });
  containerEl.addEventListener('touchmove', markUserInteraction, { passive: true });
  containerEl.addEventListener('pointerdown', markUserInteraction, { passive: true });

  const followTimerId = setInterval(() => {
    if (panInFlight || returnTimerId !== null) return;
    if (Date.now() - lastUserInteraction < FOLLOW_GRACE_MS) return;

    const dwarves = getReturnDwarves();
    if (!dwarves) return;

    const currentCellWidth = parseFloat(gridEl.style.gridTemplateColumns.match(/[\d.]+/)?.[0]) || cellWidth;
    const currentCellHeight = parseFloat(gridEl.style.gridTemplateRows.match(/[\d.]+/)?.[0]) || cellHeight;
    const rect = containerEl.getBoundingClientRect();

    const avgX = dwarves.reduce((sum, d) => sum + d.x, 0) / dwarves.length;
    const avgY = dwarves.reduce((sum, d) => sum + d.y, 0) / dwarves.length;
    const viewCenterX = (containerEl.scrollLeft + rect.width / 2) / currentCellWidth;
    const viewCenterY = (containerEl.scrollTop + rect.height / 2) / currentCellHeight;

    const drift = Math.abs(avgX - viewCenterX) + Math.abs(avgY - viewCenterY);
    if (drift > FOLLOW_THRESHOLD_CELLS) {
      animateScrollToDwarves(dwarves, 1800);
    }
  }, FOLLOW_INTERVAL_MS);

  /** Marks the start of any pan: cancels a pending return pan. */
  function beginPan() {
    panSeq++;
    if (returnTimerId !== null) {
      clearTimeout(returnTimerId);
      returnTimerId = null;
    }
  }

  /**
   * After a non-dwarf pan settles, wait `delay` ms then pan back to the
   * dwarves. Cancels itself if any other pan starts during the dwell.
   */
  function scheduleReturnToDwarves(delay) {
    const seqAtSchedule = panSeq;
    if (returnTimerId !== null) clearTimeout(returnTimerId);
    returnTimerId = setTimeout(() => {
      returnTimerId = null;
      if (seqAtSchedule !== panSeq) return; // a newer pan superseded us
      const dwarves = getReturnDwarves();
      if (dwarves) animateScrollToDwarves(dwarves, RETURN_PAN_MS);
    }, delay);
  }

  /** Internal: browser-native smooth scroll centering (x, y). */
  function panToPosition(x, y) {
    const currentCellWidth = parseFloat(gridEl.style.gridTemplateColumns.match(/[\d.]+/)?.[0]) || cellWidth;
    const currentCellHeight = parseFloat(gridEl.style.gridTemplateRows.match(/[\d.]+/)?.[0]) || cellHeight;

    const pixelX = x * currentCellWidth;
    const pixelY = y * currentCellHeight;

    // Center in the container viewport
    const containerRect = containerEl.getBoundingClientRect();
    const scrollX = pixelX - containerRect.width / 2 + currentCellWidth / 2;
    const scrollY = pixelY - containerRect.height / 2 + currentCellHeight / 2;

    containerEl.scrollTo({
      left: Math.max(0, scrollX),
      top: Math.max(0, scrollY),
      behavior: 'smooth'
    });
  }

  /**
   * Scroll to center on a specific (non-dwarf) position.
   * Always chains a return pan back to the dwarves after a short dwell.
   * @param {number} x - X coordinate
   * @param {number} y - Y coordinate
   */
  function scrollToPosition(x, y) {
    beginPan();
    panToPosition(x, y);
    // Native smooth scroll exposes no completion callback; approximate its
    // duration, then dwell so the player can see the target before returning.
    scheduleReturnToDwarves(NATIVE_SCROLL_MS + RETURN_DWELL_MS);
  }

  /**
   * Scroll to center on the average position of all dwarves
   * @param {Array} dwarves - Array of dwarf entities
   */
  function scrollToDwarves(dwarves) {
    if (!dwarves || dwarves.length === 0) return;
    beginPan();
    lastDwarves = dwarves;

    // Calculate average position
    const avgX = dwarves.reduce((sum, d) => sum + d.x, 0) / dwarves.length;
    const avgY = dwarves.reduce((sum, d) => sum + d.y, 0) / dwarves.length;

    panToPosition(Math.round(avgX), Math.round(avgY));
  }

  /**
   * Internal RAF-based animated scroll for a slower, more deliberate pan.
   * Browser-native smooth scroll is too quick; this lets us tune duration.
   * @param {Function} [onComplete] - Invoked when the pan finishes naturally
   *   (or immediately if no movement is needed). Not invoked if a newer pan
   *   supersedes this one mid-flight.
   */
  function animatePanToPosition(x, y, duration, onComplete) {
    const token = ++animToken;
    const currentCellWidth = parseFloat(gridEl.style.gridTemplateColumns.match(/[\d.]+/)?.[0]) || cellWidth;
    const currentCellHeight = parseFloat(gridEl.style.gridTemplateRows.match(/[\d.]+/)?.[0]) || cellHeight;

    const pixelX = x * currentCellWidth;
    const pixelY = y * currentCellHeight;
    const containerRect = containerEl.getBoundingClientRect();
    const maxScrollX = Math.max(0, containerEl.scrollWidth - containerRect.width);
    const maxScrollY = Math.max(0, containerEl.scrollHeight - containerRect.height);
    const targetX = Math.min(maxScrollX, Math.max(0, pixelX - containerRect.width / 2 + currentCellWidth / 2));
    const targetY = Math.min(maxScrollY, Math.max(0, pixelY - containerRect.height / 2 + currentCellHeight / 2));

    const startX = containerEl.scrollLeft;
    const startY = containerEl.scrollTop;
    if (Math.abs(targetX - startX) < 1 && Math.abs(targetY - startY) < 1) {
      panInFlight = false;
      if (typeof onComplete === 'function') onComplete();
      return;
    }

    panInFlight = true;
    const startTime = performance.now();
    const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    function step(now) {
      if (token !== animToken) return; // superseded by a newer animated pan (it owns panInFlight)
      const t = Math.min(1, (now - startTime) / duration);
      const e = easeInOutCubic(t);
      containerEl.scrollLeft = startX + (targetX - startX) * e;
      containerEl.scrollTop = startY + (targetY - startY) * e;
      if (t < 1) {
        requestAnimationFrame(step);
      } else {
        panInFlight = false;
        if (typeof onComplete === 'function') onComplete();
      }
    }
    requestAnimationFrame(step);
  }

  /**
   * Animated pan to a specific (non-dwarf) position.
   * When the pan completes, dwells briefly and then chains a return pan
   * back to the dwarves' average position.
   * @param {Function} [onComplete] - Optional completion callback, invoked
   *   before the return pan is scheduled.
   */
  function animateScrollToPosition(x, y, duration = 2200, onComplete) {
    beginPan();
    animatePanToPosition(x, y, duration, () => {
      if (typeof onComplete === 'function') onComplete();
      scheduleReturnToDwarves(RETURN_DWELL_MS);
    });
  }

  function animateScrollToDwarves(dwarves, duration = 2200) {
    if (!dwarves || dwarves.length === 0) return;
    beginPan();
    lastDwarves = dwarves;
    const avgX = dwarves.reduce((sum, d) => sum + d.x, 0) / dwarves.length;
    const avgY = dwarves.reduce((sum, d) => sum + d.y, 0) / dwarves.length;
    animatePanToPosition(Math.round(avgX), Math.round(avgY), duration);
  }

  return {
    render,
    destroy,
    setDwarvesProvider,
    scrollToPosition,
    scrollToDwarves,
    animateScrollToPosition,
    animateScrollToDwarves,
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
  DWARF: { char: '@', fg: '#ff0', zIndex: 10, scale: 1.75, shadow: '0 0 10px rgba(255, 255, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.8)', filter: 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5))' },
  DWARF_HUNGRY: { char: '@', fg: '#ffa500', zIndex: 10, scale: 1.75, shadow: '0 0 10px rgba(255, 165, 0, 0.4), 0 2px 4px rgba(0, 0, 0, 0.8)', filter: 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5))' },
  DWARF_STARVING: { char: '@', fg: '#ff4444', zIndex: 10, scale: 1.75, shadow: '0 0 10px rgba(255, 68, 68, 0.4), 0 2px 4px rgba(0, 0, 0, 0.8)', filter: 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5))' },
  DWARF_WOUNDED: { char: '@', fg: '#ff6666', zIndex: 10, scale: 1.75, shadow: '0 0 10px rgba(255, 102, 102, 0.4), 0 2px 4px rgba(0, 0, 0, 0.8)', filter: 'drop-shadow(0 2px 3px rgba(0, 0, 0, 0.5))' },

  // Visitors - external races
  HUMAN: { char: 'H', fg: '#ddcc88', zIndex: 10, scale: 1.75, shadow: '0 0 6px rgba(221, 204, 136, 0.3), 0 1px 3px rgba(0, 0, 0, 0.6)', filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4))' },
  HUMAN_HOSTILE: { char: 'H', fg: '#cc8844', zIndex: 10, scale: 1.75, shadow: '0 0 6px rgba(204, 136, 68, 0.3), 0 1px 3px rgba(0, 0, 0, 0.6)', filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4))' },
  GOBLIN: { char: 'g', fg: '#88cc44', zIndex: 10, scale: 1.75, shadow: '0 0 6px rgba(136, 204, 68, 0.3), 0 1px 3px rgba(0, 0, 0, 0.6)', filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4))' },
  GOBLIN_HOSTILE: { char: 'g', fg: '#cc4444', zIndex: 10, scale: 1.75, shadow: '0 0 6px rgba(204, 68, 68, 0.3), 0 1px 3px rgba(0, 0, 0, 0.6)', filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4))' },
  ELF: { char: 'e', fg: '#aaddff', zIndex: 10, scale: 1.75, shadow: '0 0 6px rgba(170, 221, 255, 0.3), 0 1px 3px rgba(0, 0, 0, 0.6)', filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.4))' },

  // Animals - different species as roguelike letters. Half humanoid scale
  // (1.75 / 2) so wildlife reads as smaller than the walking races.
  DEER: { char: 'd', fg: '#dd9944', zIndex: 9, scale: 0.875, shadow: '0 0 5px rgba(221, 153, 68, 0.3), 0 1px 2px rgba(0, 0, 0, 0.5)', filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))' },
  RABBIT: { char: 'r', fg: '#bb9966', zIndex: 9, scale: 0.875, shadow: '0 0 4px rgba(187, 153, 102, 0.3), 0 1px 2px rgba(0, 0, 0, 0.5)', filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.3))' },
  WOLF: { char: 'w', fg: '#888888', zIndex: 9, scale: 0.875, shadow: '0 0 5px rgba(136, 136, 136, 0.3), 0 1px 2px rgba(0, 0, 0, 0.5)', filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))' },
  BOAR: { char: 'b', fg: '#664422', zIndex: 9, scale: 0.875, shadow: '0 0 5px rgba(102, 68, 34, 0.3), 0 1px 2px rgba(0, 0, 0, 0.5)', filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))' },
  FROG: { char: 'f', fg: '#66cc66', zIndex: 9, scale: 0.875, shadow: '0 0 4px rgba(102, 204, 102, 0.3), 0 1px 2px rgba(0, 0, 0, 0.5)', filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.3))' },
  BEAR: { char: 'B', fg: '#664444', zIndex: 9, scale: 0.875, shadow: '0 0 5px rgba(102, 68, 68, 0.3), 0 1px 2px rgba(0, 0, 0, 0.5)', filter: 'drop-shadow(0 1px 2px rgba(0, 0, 0, 0.3))' },

  // Food - green percent sign (traditional roguelike food)
  FOOD: { char: '%', fg: '#32cd32', zIndex: 5, scale: 1.1, shadow: '0 0 3px rgba(50, 205, 50, 0.2), 0 1px 1px rgba(0, 0, 0, 0.4)', filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.2))' },

  // Corpse - red/gray
  CORPSE: { char: '%', fg: '#8b0000', zIndex: 3, scale: 1.0, shadow: '0 1px 1px rgba(0, 0, 0, 0.3)', filter: 'none' },

  // Items (future)
  ITEM: { char: '?', fg: '#00bfff', zIndex: 4, scale: 1.1, shadow: '0 0 3px rgba(0, 191, 255, 0.2), 0 1px 1px rgba(0, 0, 0, 0.4)', filter: 'drop-shadow(0 1px 1px rgba(0, 0, 0, 0.2))' },

  // Construction
  DIG_DESIGNATION: { char: 'x', fg: '#886644', zIndex: 2, scale: 1.0, shadow: 'none', filter: 'none' },
  BUILD_MARKER: { char: '░', fg: '#777766', zIndex: 3, scale: 1.0, shadow: 'none', filter: 'none' },
  RESOURCE_STONE: { char: '∙', fg: '#999988', zIndex: 4, scale: 1.1, shadow: '0 0 2px rgba(153, 153, 136, 0.2)', filter: 'none' },
  RESOURCE_WOOD: { char: '≡', fg: '#aa8855', zIndex: 4, scale: 1.1, shadow: '0 0 2px rgba(170, 136, 85, 0.2)', filter: 'none' },
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
    // Sprite-mode state tint mirrors the emoji color swaps below.
    let spriteTint = null;

    // Health takes priority for coloring
    if (dwarf.hp < dwarf.maxHp * 0.5) {
      glyph = EntityGlyph.DWARF_WOUNDED;
      spriteTint = { color: '#ff3a3a', amount: 0.4 };
    } else if (dwarf.hunger > 75) {
      glyph = EntityGlyph.DWARF_STARVING;
      spriteTint = { color: '#ff7a2a', amount: 0.38 };
    } else if (dwarf.hunger > 50) {
      glyph = EntityGlyph.DWARF_HUNGRY;
      spriteTint = { color: '#ffd24a', amount: 0.18 };
    }

    entities.push({
      x: dwarf.x,
      y: dwarf.y,
      char: glyph.char,
      fg: glyph.fg,
      zIndex: glyph.zIndex,
      id: dwarf.id,
      scale: glyph.scale,
      shadow: glyph.shadow,
      filter: glyph.filter,
      // Procedural-hybrid sprite: stable per-dwarf identity from id
      spriteKey: 'dwarf',
      seed: dwarf.id,
      spriteTint,
    });
  }

  // Visitors - external forces
  if (state.visitors) {
    for (const visitor of state.visitors) {
      if (visitor.state === 'dead') continue;

      let glyph;

      // Determine glyph based on race
      switch (visitor.race) {
        case 'human':
          glyph = visitor.disposition < -20 ? EntityGlyph.HUMAN_HOSTILE : EntityGlyph.HUMAN;
          break;
        case 'goblin':
          glyph = visitor.disposition < -20 ? EntityGlyph.GOBLIN_HOSTILE : EntityGlyph.GOBLIN;
          break;
        case 'elf':
          glyph = EntityGlyph.ELF;
          break;
        default:
          glyph = { char: '?', fg: '#ffffff', zIndex: 10, scale: 1.0, shadow: 'none', filter: 'none' };
      }

      let fg = glyph.fg;

      // Sprite state tint mirrors the emoji color treatment.
      let spriteTint = null;
      if (visitor.hp < visitor.maxHp * 0.5) {
        fg = blendColor(fg, '#ff4444', 0.4);
        spriteTint = { color: '#ff3a3a', amount: 0.4 };
      } else if (visitor.disposition < -20) {
        spriteTint = { color: '#cc3333', amount: 0.28 };
      }

      entities.push({
        x: visitor.x,
        y: visitor.y,
        char: glyph.char,
        fg,
        zIndex: glyph.zIndex,
        name: visitor.name,
        id: visitor.id,
        scale: glyph.scale,
        shadow: glyph.shadow,
        filter: glyph.filter,
        // Sprite key per race; types without a template fall back to emoji.
        spriteKey: visitor.race,
        seed: visitor.id,
        spriteTint,
      });
    }
  }

  // Animals
  if (state.animals) {
    for (const animal of state.animals) {
      if (animal.hp <= 0) continue;

      let glyph = EntityGlyph.DEER;  // Default

      // Map species to glyphs
      switch (animal.subtype) {
        case 'deer':
          glyph = EntityGlyph.DEER;
          break;
        case 'rabbit':
          glyph = EntityGlyph.RABBIT;
          break;
        case 'wolf':
          glyph = EntityGlyph.WOLF;
          break;
        case 'boar':
          glyph = EntityGlyph.BOAR;
          break;
        case 'frog':
          glyph = EntityGlyph.FROG;
          break;
        case 'bear':
          glyph = EntityGlyph.BEAR;
          break;
        default:
          glyph = EntityGlyph.DEER;
      }

      // Tint wounded animals
      let fg = glyph.fg;
      let spriteTint = null;
      if (animal.hp < animal.maxHp * 0.5) {
        fg = blendColor(fg, '#ff6666', 0.3);
        spriteTint = { color: '#ff5555', amount: 0.32 };
      }

      entities.push({
        x: animal.x,
        y: animal.y,
        char: glyph.char,
        fg,
        zIndex: glyph.zIndex,
        scale: glyph.scale,
        shadow: glyph.shadow,
        filter: glyph.filter,
        // Sprite key per species; same set as the templates.
        spriteKey: animal.subtype,
        seed: animal.id,
        spriteTint,
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
