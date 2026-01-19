/**
 * Dwarf Bio Display Component
 * Shows name, personality bio, and generation status
 * Integrates with LLM name generation pipeline
 */

import { isNamePending, hasGeneratedName } from '../llm/nameGenerator.js';
import { getDominantTraits } from '../sim/entities.js';

/**
 * Create a dwarf bio display element
 * @param {object} dwarf - Dwarf entity
 * @param {object} options - Display options
 * @returns {HTMLElement|string} HTML element or text
 */
export function createDwarfBioDisplay(dwarf, options = {}) {
  const {
    showSource = false,      // Show generation source (llm/local)
    showStatus = false,      // Show pending/complete status
    showTraits = true,       // Show dominant traits
    expandable = false,      // Allow "more lore" expansion
    compact = false,         // Minimal display
  } = options;

  const parts = [];

  // Name section
  const name = dwarf.generatedName || dwarf.name;
  const displayName = compact ? name : `<strong>${name}</strong>`;
  parts.push(displayName);

  // Status indicator
  if (showStatus) {
    if (isNamePending(dwarf)) {
      parts.push(' <span style="color: #999;">⧖ generating...</span>');
    } else if (hasGeneratedName(dwarf)) {
      const source = dwarf.llm?.nameBio?.source || 'unknown';
      if (showSource) {
        parts.push(` <span style="font-size: 0.85em; color: #666;">[${source}]</span>`);
      }
    }
  }

  // Bio section
  if (dwarf.generatedBio && !compact) {
    parts.push(`<div style="margin-top: 8px; font-size: 0.95em; line-height: 1.4; color: #ccc;">${dwarf.generatedBio}</div>`);
  }

  // Traits section
  if (showTraits && !compact) {
    const traits = getDominantTraits(dwarf);
    if (traits && traits.length > 0) {
      const traitString = traits.join(', ');
      parts.push(`<div style="margin-top: 6px; font-size: 0.85em; color: #999;">Traits: ${traitString}</div>`);
    }
  }

  // Expandable "more lore" button
  if (expandable && dwarf.llm?.nameBio?.status === 'complete') {
    parts.push(`<div style="margin-top: 8px;"><button data-dwarf-id="${dwarf.id}" class="bio-expand-btn" style="font-size: 0.85em; padding: 4px 8px; background: #334455; border: 1px solid #555; color: #ccc; cursor: pointer; border-radius: 3px;">More Lore</button></div>`);
  }

  return parts.join('');
}

/**
 * Create a compact dwarf name card
 * @param {object} dwarf - Dwarf entity
 * @returns {string} HTML
 */
export function createDwarfNameCard(dwarf) {
  const name = dwarf.generatedName || dwarf.name;
  const bio = dwarf.generatedBio ? `<div style="font-size: 0.85em; color: #aaa; margin-top: 4px;">${dwarf.generatedBio}</div>` : '';
  
  return `
    <div style="padding: 12px; background: #1a2a2a; border: 1px solid #334455; border-radius: 4px;">
      <strong style="font-size: 1.1em;">${name}</strong>
      ${bio}
    </div>
  `;
}

/**
 * Create dwarf status badge for tooltip/hover
 * @param {object} dwarf - Dwarf entity
 * @returns {string} HTML
 */
export function createDwarfBadge(dwarf) {
  const name = dwarf.generatedName || dwarf.name;
  const pending = isNamePending(dwarf);
  const bio = dwarf.generatedBio || 'A dwarf of quiet determination.';

  const statusColor = pending ? '#999' : '#ccc';
  const statusText = pending ? 'Generating name...' : 'Complete';

  return `
    <div style="background: #111; border: 2px solid #334455; border-radius: 6px; padding: 12px; max-width: 300px; font-size: 0.9em;">
      <div style="font-weight: bold; font-size: 1.1em; margin-bottom: 8px;">${name}</div>
      <div style="color: #aaa; line-height: 1.5; margin-bottom: 8px;">${bio}</div>
      <div style="font-size: 0.8em; color: ${statusColor};">● ${statusText}</div>
    </div>
  `;
}

/**
 * Format dwarf for logging/chat display
 * @param {object} dwarf - Dwarf entity
 * @returns {string} Formatted string
 */
export function formatDwarfForDisplay(dwarf) {
  const name = dwarf.generatedName || dwarf.name;
  return name;
}

/**
 * Create extended lore display (for "More Lore" button)
 * Would call LLM to generate extended bio
 * @param {object} dwarf - Dwarf entity
 * @returns {Promise<string>} Extended bio HTML
 */
export async function createExtendedLore(dwarf) {
  // Placeholder for future LLM-generated extended bio
  // Would call a new endpoint for longer write-up
  const traits = getDominantTraits(dwarf);
  const traitDesc = traits.join(', ');

  return `
    <div style="padding: 16px; background: #1a2a2a; border: 2px solid #444; border-radius: 6px;">
      <h3 style="color: #aaa; margin: 0 0 12px 0;">${dwarf.generatedName || dwarf.name}</h3>
      <p style="color: #ccc; line-height: 1.6; margin: 0 0 12px 0;">${dwarf.generatedBio}</p>
      <p style="color: #999; font-size: 0.9em; margin: 0;">
        <strong>Traits:</strong> ${traitDesc}
      </p>
      <p style="color: #999; font-size: 0.9em; margin: 12px 0 0 0;">
        <strong>Aspiration:</strong> ${dwarf.aspiration || 'Unknown'}
      </p>
    </div>
  `;
}
