/**
 * LLM Name Generation System - Event Integration
 * Hooks the name generation pipeline into the UI and game events
 */

import { on, EVENTS } from '../events/eventBus.js';
import { isNamePending, hasGeneratedName } from '../llm/nameGenerator.js';

/**
 * Set up all LLM name generation event listeners
 * Call this once during game initialization
 */
export function initializeNameGenerationEvents() {
  // Listen for name generation completion
  on(EVENTS.DWARF_NAME_GENERATED, handleDwarfNameGenerated);
  on(EVENTS.DWARF_NAME_PENDING, handleDwarfNamePending);

  console.log('[LLM Events] Name generation event listeners initialized');
}

/**
 * Handle dwarf name generation completion
 * @param {object} payload - { entity, name, bio, source }
 */
function handleDwarfNameGenerated({ entity, name, bio, source }) {
  console.log(`[LLM] ${name}: "${bio}" (${source})`);

  // Could trigger:
  // - UI update for dwarf panel
  // - Show a notification
  // - Add to world log
  // - Update memory records

  // Example: Add to world log
  if (entity.type === 'dwarf') {
    const logMessage = source === 'llm'
      ? `⭐ ${name} has arrived - "${bio}"`
      : `${name} joins the settlement`;
    
    // This would be called with state parameter from your game
    // addLog(state, logMessage);
  }
}

/**
 * Handle dwarf name generation pending state
 * @param {object} payload - { entity }
 */
function handleDwarfNamePending({ entity }) {
  // Could show loading indicator
  console.log(`[LLM] Generating name for entity ${entity.id}...`);
}

/**
 * Format dwarf name/bio for display in various contexts
 */
export const DwarfDisplayFormatters = {
  /**
   * Short name card (for dwarf list)
   */
  shortCard: (dwarf) => {
    const name = dwarf.generatedName || dwarf.name;
    const pending = isNamePending(dwarf);
    return pending ? `${name} ⧖` : name;
  },

  /**
   * Full card (for inspection panel)
   */
  fullCard: (dwarf) => {
    const name = dwarf.generatedName || dwarf.name;
    const bio = dwarf.generatedBio || 'A dwarf of quiet determination.';
    const pending = isNamePending(dwarf);
    const status = pending ? ' (generating...)' : '';
    return `${name}${status}\n${bio}`;
  },

  /**
   * Inline format (for logs/messages)
   */
  inline: (dwarf) => {
    return dwarf.generatedName || dwarf.name;
  },

  /**
   * Verbose format (for tooltips)
   */
  verbose: (dwarf) => {
    const parts = [];
    parts.push(`Name: ${dwarf.generatedName || dwarf.name}`);
    if (dwarf.generatedBio) {
      parts.push(`Bio: ${dwarf.generatedBio}`);
    }
    if (isNamePending(dwarf)) {
      parts.push('Status: Generating name from LLM...');
    } else if (hasGeneratedName(dwarf)) {
      const source = dwarf.llm?.nameBio?.source || 'unknown';
      parts.push(`Source: ${source}`);
    }
    return parts.join('\n');
  },
};

/**
 * Watch a dwarf for name generation completion
 * Useful for testing or special handling
 * @param {object} dwarf
 * @returns {Promise<object>} Resolves when name generation complete
 */
export function watchDwarfNameGeneration(dwarf) {
  return new Promise((resolve) => {
    if (hasGeneratedName(dwarf)) {
      resolve({
        name: dwarf.generatedName,
        bio: dwarf.generatedBio,
        source: dwarf.llm?.nameBio?.source,
      });
      return;
    }

    const unsubscribe = on(EVENTS.DWARF_NAME_GENERATED, (payload) => {
      if (payload.entity.id === dwarf.id) {
        unsubscribe();
        resolve({
          name: payload.name,
          bio: payload.bio,
          source: payload.source,
        });
      }
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      unsubscribe();
      resolve(null);
    }, 30000);
  });
}

/**
 * Get a dwarf's full narrative description (name + bio + traits)
 * @param {object} dwarf
 * @returns {string}
 */
export function getDwarfNarrative(dwarf) {
  const { getDominantTraits } = require('../sim/entities.js');
  
  const name = dwarf.generatedName || dwarf.name;
  const bio = dwarf.generatedBio || '';
  const traits = getDominantTraits(dwarf).join(', ');

  return `${name} - ${bio} [${traits}]`;
}

/**
 * Batch wait for name generation of multiple dwarves
 * @param {Array} dwarves
 * @param {number} timeoutMs - Max wait time
 * @returns {Promise<Map>} Map of dwarf.id -> { name, bio, source }
 */
export async function waitForMultipleDwarfNames(dwarves, timeoutMs = 10000) {
  const startTime = Date.now();
  const results = new Map();

  for (const dwarf of dwarves) {
    const elapsed = Date.now() - startTime;
    if (elapsed > timeoutMs) break;

    const remaining = timeoutMs - elapsed;
    const watch = watchDwarfNameGeneration(dwarf);
    const result = await Promise.race([
      watch,
      new Promise(resolve => setTimeout(() => resolve(null), remaining))
    ]);

    if (result) {
      results.set(dwarf.id, result);
    } else {
      results.set(dwarf.id, {
        name: dwarf.generatedName || dwarf.name,
        bio: dwarf.generatedBio,
        source: 'timeout',
      });
    }
  }

  return results;
}
