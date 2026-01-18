/**
 * Event log UI for v0.1
 * Renders log entries to the log panel
 */

/**
 * Render log entries to the log panel
 * @param {Array} log - Array of {tick, message} entries
 * @param {HTMLElement} container - Container element for log entries
 */
export function renderLog(log, container) {
  if (!container) return;

  // Clear and rebuild (simple approach for v0.1)
  container.innerHTML = '';

  // Show most recent entries first
  const entries = [...log].reverse();

  for (const entry of entries) {
    const div = document.createElement('div');
    div.className = 'log-entry';
    div.innerHTML = `<span class="tick">[${entry.tick}]</span> ${escapeHtml(entry.message)}`;
    container.appendChild(div);
  }
}

/**
 * Escape HTML special characters
 */
function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
