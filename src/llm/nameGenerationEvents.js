/**
 * LLM Name Generation System - Event Integration
 * Hooks the name generation pipeline into the UI and game events
 */

import { on, EVENTS } from '../events/eventBus.js';
import { isNamePending, hasGeneratedName, requestNameBioBatchSingle } from '../llm/nameGenerator.js';

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
 * Wait for batch name generation to complete
 * Returns immediately once all dwarves have LLM-generated names (or fall back after timeout)
 * @param {Array} dwarves
 * @param {number} timeoutMs - Max wait time (currently ignored since we wait for batch promise)
 * @returns {Promise<Map>} Map of dwarf.id -> { name, bio, source }
 */
export async function waitForBatchNameGeneration(dwarves, timeoutMs = 30000) {
  const startTime = Date.now();
  const results = new Map();

  console.log(`[LLM] Initiating batch name generation for ${dwarves.length} dwarves...`);

  try {
    // Call the batch generation function
    const batchResults = await requestNameBioBatchSingle(dwarves, null, { timeout: timeoutMs });

    // Aggregate into results map
    for (const result of batchResults) {
      results.set(result.entity.id, {
        name: result.name,
        bio: result.bio,
        source: result.source,
      });
    }

    const elapsed = Date.now() - startTime;
    const llmCount = batchResults.filter(r => r.source === 'llm').length;
    const fallbackCount = batchResults.filter(r => r.source === 'local').length;
    console.log(`[LLM] ✓ Batch complete: ${llmCount} LLM, ${fallbackCount} fallback (${elapsed}ms)`);

    return results;

  } catch (error) {
    console.error('[LLM] Batch generation failed:', error.message);
    // Still mark all as complete with available names
    for (const dwarf of dwarves) {
      results.set(dwarf.id, {
        name: dwarf.generatedName || dwarf.name,
        bio: dwarf.generatedBio,
        source: 'timeout',
      });
    }
    return results;
  }
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
 * Watch a dwarf for LLM name generation completion
 * Specifically waits for LLM-generated names, not sync fallbacks
 * @param {object} dwarf
 * @returns {Promise<object>} Resolves when LLM name generation complete
 */
export function watchDwarfNameGeneration(dwarf) {
  return new Promise((resolve) => {
    // Check if already has LLM-generated name
    if (hasGeneratedName(dwarf) && dwarf.llm?.nameBio?.source === 'llm') {
      resolve({
        name: dwarf.generatedName,
        bio: dwarf.generatedBio,
        source: dwarf.llm.nameBio.source,
      });
      return;
    }

    const unsubscribe = on(EVENTS.DWARF_NAME_GENERATED, (payload) => {
      if (payload.entity.id === dwarf.id && payload.source === 'llm') {
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
 * Batch wait for LLM name generation of multiple dwarves
 * Waits for all dwarves to have LLM-generated names before resolving
 * Uses parallel waiting for efficiency
 * @param {Array} dwarves
 * @param {number} timeoutMs - Max wait time
 * @returns {Promise<Map>} Map of dwarf.id -> { name, bio, source }
 */
export async function waitForMultipleDwarfNames(dwarves, timeoutMs = 30000) {
  const startTime = Date.now();
  const results = new Map();

  console.log(`[LLM] Waiting for ${dwarves.length} dwarves' LLM names (timeout: ${timeoutMs}ms)...`);

  // Wait for all dwarves in parallel (faster than sequential)
  const promises = dwarves.map((dwarf) => {
    const elapsed = Date.now() - startTime;
    if (elapsed > timeoutMs) {
      return Promise.resolve({
        dwarf,
        result: { name: dwarf.generatedName || dwarf.name, bio: dwarf.generatedBio, source: 'timeout' }
      });
    }

    const remaining = timeoutMs - elapsed;
    const watch = watchDwarfNameGeneration(dwarf);
    return Promise.race([
      watch.then(result => ({ dwarf, result })),
      new Promise(resolve => setTimeout(() => resolve({
        dwarf,
        result: { name: dwarf.generatedName || dwarf.name, bio: dwarf.generatedBio, source: 'timeout' }
      }), remaining))
    ]);
  });

  // Wait for all to complete
  const allResults = await Promise.all(promises);

  // Aggregate results
  let llmCount = 0;
  let fallbackCount = 0;
  for (const { dwarf, result } of allResults) {
    results.set(dwarf.id, result);
    if (result.source === 'llm') llmCount++;
    else fallbackCount++;
  }

  const elapsed = Date.now() - startTime;
  console.log(`[LLM] ✓ Name generation complete: ${llmCount} LLM, ${fallbackCount} fallback (${elapsed}ms)`);

  return results;
}
