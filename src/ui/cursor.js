/**
 * Cursor system - tracks mouse position and converts to grid coordinates
 * Handles smooth cursor with grid snapping and cell highlighting
 */

import { inspectPosition, getTooltipLabel } from './inspection.js';

/**
 * Create a cursor controller attached to the renderer grid
 * @param {HTMLElement} gridEl - The ASCII grid element
 * @param {number} width - Map width in cells
 * @param {number} height - Map height in cells
 * @param {function} onHover - Callback(x, y, inspection) when cell changes
 * @param {function} onClick - Callback(x, y, inspection) on click
 * @returns {object} Cursor controller with update() and destroy()
 */
export function createCursor(gridEl, width, height, onHover, onClick) {
  // Current grid position (null = not over grid)
  let currentX = null;
  let currentY = null;
  let isActive = false;

  // Highlight element
  const highlightEl = document.createElement('div');
  highlightEl.className = 'cursor-highlight';
  highlightEl.style.cssText = `
    position: absolute;
    pointer-events: none;
    border: 2px solid rgba(255, 255, 100, 0.8);
    box-shadow: 0 0 8px rgba(255, 255, 100, 0.4), inset 0 0 4px rgba(255, 255, 100, 0.2);
    border-radius: 2px;
    transition: transform 0.08s ease-out, opacity 0.15s ease;
    opacity: 0;
    z-index: 100;
    box-sizing: border-box;
  `;

  // Create tooltip element
  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'cursor-tooltip';
  tooltipEl.style.cssText = `
    position: absolute;
    pointer-events: none;
    background: rgba(20, 20, 25, 0.95);
    border: 1px solid rgba(255, 255, 100, 0.5);
    border-radius: 4px;
    padding: 4px 8px;
    font-family: 'Courier New', monospace;
    font-size: 12px;
    color: #eee;
    white-space: nowrap;
    z-index: 101;
    opacity: 0;
    transition: opacity 0.15s ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  `;

  // Ensure grid container has relative positioning
  const gridContainer = gridEl.parentElement || gridEl;
  if (getComputedStyle(gridContainer).position === 'static') {
    gridContainer.style.position = 'relative';
  }

  gridContainer.appendChild(highlightEl);
  gridContainer.appendChild(tooltipEl);

  // World state reference (set via update)
  let worldState = null;

  /**
   * Convert pixel position to grid coordinates
   */
  function pixelToGrid(clientX, clientY) {
    const rect = gridEl.getBoundingClientRect();
    const relX = clientX - rect.left;
    const relY = clientY - rect.top;

    const cellWidth = rect.width / width;
    const cellHeight = rect.height / height;

    const gridX = Math.floor(relX / cellWidth);
    const gridY = Math.floor(relY / cellHeight);

    // Clamp to valid range
    if (gridX < 0 || gridX >= width || gridY < 0 || gridY >= height) {
      return null;
    }

    return { x: gridX, y: gridY, cellWidth, cellHeight };
  }

  /**
   * Update highlight position
   */
  function updateHighlight(x, y, cellWidth, cellHeight) {
    highlightEl.style.width = `${cellWidth}px`;
    highlightEl.style.height = `${cellHeight}px`;
    highlightEl.style.transform = `translate(${x * cellWidth}px, ${y * cellHeight}px)`;
    highlightEl.style.opacity = '1';
  }

  /**
   * Update tooltip position and content
   */
  function updateTooltip(x, y, cellWidth, cellHeight, label) {
    tooltipEl.textContent = label;
    tooltipEl.style.opacity = '1';

    // Position tooltip above and to the right of cursor
    const tooltipX = (x + 1) * cellWidth + 4;
    const tooltipY = y * cellHeight - 4;

    // Check if tooltip would overflow right edge
    const rect = gridEl.getBoundingClientRect();
    const tooltipRect = tooltipEl.getBoundingClientRect();

    let finalX = tooltipX;
    let finalY = tooltipY;

    // Adjust if too close to right edge
    if (tooltipX + tooltipRect.width > rect.width) {
      finalX = (x - 1) * cellWidth - tooltipRect.width;
    }

    // Adjust if too close to top
    if (tooltipY < 0) {
      finalY = (y + 1) * cellHeight + 4;
    }

    tooltipEl.style.transform = `translate(${finalX}px, ${finalY}px)`;
  }

  /**
   * Hide cursor elements
   */
  function hideCursor() {
    highlightEl.style.opacity = '0';
    tooltipEl.style.opacity = '0';
    currentX = null;
    currentY = null;
    isActive = false;
  }

  /**
   * Mouse move handler
   */
  function handleMouseMove(e) {
    const gridPos = pixelToGrid(e.clientX, e.clientY);

    if (!gridPos) {
      hideCursor();
      return;
    }

    const { x, y, cellWidth, cellHeight } = gridPos;

    // Only update if position changed
    if (x !== currentX || y !== currentY) {
      currentX = x;
      currentY = y;
      isActive = true;

      updateHighlight(x, y, cellWidth, cellHeight);

      // Get inspection data if we have world state
      if (worldState) {
        const inspection = inspectPosition(worldState, x, y);
        const label = getTooltipLabel(inspection);
        updateTooltip(x, y, cellWidth, cellHeight, label);

        if (onHover) {
          onHover(x, y, inspection);
        }
      } else {
        tooltipEl.textContent = `(${x}, ${y})`;
        tooltipEl.style.opacity = '1';
      }
    }
  }

  /**
   * Mouse leave handler
   */
  function handleMouseLeave() {
    hideCursor();
  }

  /**
   * Click handler
   */
  function handleClick(e) {
    const gridPos = pixelToGrid(e.clientX, e.clientY);
    if (!gridPos) return;

    const { x, y } = gridPos;

    if (worldState && onClick) {
      const inspection = inspectPosition(worldState, x, y);
      onClick(x, y, inspection);
    }
  }

  // Attach event listeners
  gridEl.addEventListener('mousemove', handleMouseMove);
  gridEl.addEventListener('mouseleave', handleMouseLeave);
  gridEl.addEventListener('click', handleClick);

  return {
    /**
     * Update world state reference (call each frame)
     * @param {object} state - Current world state
     */
    update(state) {
      worldState = state;

      // Refresh tooltip if cursor is active
      if (isActive && currentX !== null && currentY !== null) {
        const inspection = inspectPosition(state, currentX, currentY);
        const label = getTooltipLabel(inspection);
        tooltipEl.textContent = label;
      }
    },

    /**
     * Get current cursor position
     * @returns {{ x: number, y: number } | null}
     */
    getPosition() {
      if (!isActive || currentX === null || currentY === null) {
        return null;
      }
      return { x: currentX, y: currentY };
    },

    /**
     * Check if cursor is active over grid
     * @returns {boolean}
     */
    isOver() {
      return isActive;
    },

    /**
     * Set highlight color (for selection modes)
     * @param {string} color - CSS color
     */
    setHighlightColor(color) {
      highlightEl.style.borderColor = color;
      highlightEl.style.boxShadow = `0 0 8px ${color}40, inset 0 0 4px ${color}20`;
    },

    /**
     * Clean up cursor system
     */
    destroy() {
      gridEl.removeEventListener('mousemove', handleMouseMove);
      gridEl.removeEventListener('mouseleave', handleMouseLeave);
      gridEl.removeEventListener('click', handleClick);
      highlightEl.remove();
      tooltipEl.remove();
    },
  };
}
