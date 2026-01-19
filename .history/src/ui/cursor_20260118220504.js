/**
 * Cursor system - tracks mouse position and converts to grid coordinates
 * Handles smooth cursor with grid snapping and cell highlighting
 */

import { inspectPosition, getTooltipLabel } from './inspection.js';

/**
 * Create a cursor controller attached to the renderer grid
 * @param {HTMLElement} gridEl - The grid element
 * @param {number} width - Map width in cells
 * @param {number} height - Map height in cells
 * @param {function} onHover - Callback when hovering over a cell
 * @param {function} onClick - Callback when clicking on a cell
 * @returns {object} Cursor controller with update() and destroy() methods
 */
export function createCursor(gridEl, width, height, onHover, onClick) {
  // Current grid position (null = not over grid)
  let currentX = null;
  let currentY = null;
  let isActive = false;

  // Highlight element - snaps smoothly between tiles
  const highlightEl = document.createElement('div');
  highlightEl.className = 'cursor-highlight';
  highlightEl.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
    pointer-events: none;
    border: 2px solid rgba(255, 255, 100, 0.8);
    box-shadow: 0 0 8px rgba(255, 255, 100, 0.4), inset 0 0 4px rgba(255, 255, 100, 0.2);
    border-radius: 2px;
    transition: transform 320ms ease-in-out, opacity 150ms ease;
    opacity: 0;
    z-index: 100;
    box-sizing: border-box;
  `;

  // Create tooltip element - follows cursor with same smooth motion
  const tooltipEl = document.createElement('div');
  tooltipEl.className = 'cursor-tooltip';
  tooltipEl.style.cssText = `
    position: absolute;
    left: 0;
    top: 0;
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
    transition: transform 320ms ease-in-out, opacity 150ms ease;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.5);
  `;

  // Close button for tooltip
  const closeButton = document.createElement('button');
  closeButton.className = 'tooltip-close-button';
  closeButton.textContent = '×';
  closeButton.style.cssText = `
    position: absolute;
    top: 2px;
    right: 2px;
    width: 16px;
    height: 16px;
    background: rgba(255, 255, 255, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.3);
    border-radius: 50%;
    color: #fff;
    font-size: 12px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0.7;
    transition: opacity 0.2s;
  `;
  closeButton.addEventListener('mouseenter', () => {
    closeButton.style.opacity = '1';
  });
  closeButton.addEventListener('mouseleave', () => {
    closeButton.style.opacity = '0.7';
  });
  closeButton.addEventListener('click', (e) => {
    e.stopPropagation();
    hideCursor();
  });

  // Ensure grid container has relative positioning
  const gridContainer = gridEl.parentElement || gridEl;
  if (getComputedStyle(gridContainer).position === 'static') {
    gridContainer.style.position = 'relative';
  }

  gridContainer.appendChild(highlightEl);
  gridContainer.appendChild(tooltipEl);
  tooltipEl.appendChild(closeButton);

  // World state reference (set via update)
  let worldState = null;

  /**
   * Convert pixel position to grid coordinates
   * @param {number} clientX - Mouse X position
   * @param {number} clientY - Mouse Y position
   * @returns {object|null} Grid position or null if outside grid
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
   * @param {number} x - Grid X position
   * @param {number} y - Grid Y position
   * @param {number} cellWidth - Cell width
   * @param {number} cellHeight - Cell height
   */
  function updateHighlight(x, y, cellWidth, cellHeight) {
    highlightEl.style.width = `${cellWidth}px`;
    highlightEl.style.height = `${cellHeight}px`;
    highlightEl.style.transform = `translate(${x * cellWidth}px, ${y * cellHeight}px)`;
    highlightEl.style.opacity = '1';
  }

  /**
   * Update tooltip position and content
   * Positions tooltip to top-right of the cursor cell
   * @param {number} x - Grid X position
   * @param {number} y - Grid Y position
   * @param {number} cellWidth - Cell width
   * @param {number} cellHeight - Cell height
   * @param {string} label - Tooltip content
   */
  function updateTooltip(x, y, cellWidth, cellHeight, label) {
    tooltipEl.textContent = label;
    tooltipEl.style.opacity = '1';

    // Get grid bounds for edge detection
    const gridRect = gridEl.getBoundingClientRect();

    // Measure tooltip size (use a temp measurement if needed)
    const tooltipWidth = tooltipEl.offsetWidth || 100;
    const tooltipHeight = tooltipEl.offsetHeight || 24;

    // Default position: top-right of the cell
    // Offset by 6px gap from the cell edge
    let tooltipX = (x + 1) * cellWidth + 6;
    let tooltipY = y * cellHeight - tooltipHeight - 6;

    // Adjust if tooltip would overflow right edge
    if (tooltipX + tooltipWidth > gridRect.width) {
      // Position to top-left instead
      tooltipX = x * cellWidth - tooltipWidth - 6;
    }

    // Adjust if tooltip would overflow top
    if (tooltipY < 0) {
      // Position below the cell instead
      tooltipY = (y + 1) * cellHeight + 6;
    }

    // Ensure X doesn't go negative
    if (tooltipX < 0) {
      tooltipX = (x + 1) * cellWidth + 6;
    }

    tooltipEl.style.transform = `translate(${tooltipX}px, ${tooltipY}px)`;
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
   * @param {Event} e - Mouse move event
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
   * @param {Event} e - Click event
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

      // Refresh tooltip content if cursor is active
      if (isActive && currentX !== null && currentY !== null) {
        const inspection = inspectPosition(state, currentX, currentY);
        const label = getTooltipLabel(inspection);

        // Only update text if content changed (avoid layout thrashing)
        if (tooltipEl.textContent !== label) {
          tooltipEl.textContent = label;
        }
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
