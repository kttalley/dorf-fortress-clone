/**
 * Name & Bio Generator
 * Async LLM pipeline for generating dwarf names and personality bios
 *
 * Design:
 * - Called only on entity creation (not in tick loop)
 * - Stores results deterministically in entity.llm.nameBio
 * - Falls back to local generation if LLM unavailable
 * - Emits events for UI updates
 */

import {
  SYSTEM_DWARF_NAME_BIO,
  formatDwarfNameBioPrompt,
  parseNameBioResponse,
} from './prompts/dwarf.js';

import { generateNameBioLocal } from './fallbacks.js';
import { emit, EVENTS } from '../events/eventBus.js';
import { checkLLMHealth } from '../ai/llmClient.js';

// === CONFIGURATION ===

const CONFIG = {
  TIMEOUT_MS: 5000,         // LLM request timeout
  MAX_RETRIES: 1,           // Retry attempts before fallback
  MODEL: 'gemma3:latest',   // Default model
  MAX_TOKENS: 100,          // Response token limit
  TEMPERATURE: 0.85,        // Creativity level
};

// === STATE ===

// Pending requests by entity ID
const pendingRequests = new Map();

// LLM availability flag (set by external check)
let llmAvailable = false;

/**
 * Set LLM availability status
 * @param {boolean} available
 */
export function setLLMAvailable(available) {
  llmAvailable = available;
}

/**
 * Check if LLM is currently available
 * @returns {boolean}
 */
export function isLLMAvailable() {
  return llmAvailable;
}

/**
 * Initialize LLM availability check
 * Call this on game startup to detect LLM server
 * @returns {Promise<boolean>} True if LLM is available
 */
export async function initializeLLM() {
  try {
    console.log('[LLM] Checking server health at startup...');
    const available = await checkLLMHealth();
    setLLMAvailable(available);
    if (available) {
      console.log('[LLM] ✓ Server available, using LLM for name generation');
    } else {
      console.log('[LLM] ✗ Server unavailable, using local fallback names');
    }
    return available;
  } catch (error) {
    console.warn('[LLM] Initialization failed:', error.message);
    setLLMAvailable(false);
    return false;
  }
}

// === MAIN API ===

/**
 * Request name and bio generation for an entity
 * Async - returns immediately, stores result in entity.llm when complete
 *
 * @param {object} entity - Dwarf entity (must have id, personality)
 * @param {object} worldSnapshot - Optional world context
 * @param {object} options - Optional overrides
 * @returns {Promise<object>} Resolves with { name, bio } when complete
 */
export async function requestNameBio(entity, worldSnapshot = null, options = {}) {
  // Validate entity
  if (!entity || typeof entity.id === 'undefined') {
    throw new Error('requestNameBio: entity with id required');
  }

  // Check for pending request
  if (pendingRequests.has(entity.id)) {
    return pendingRequests.get(entity.id);
  }

  // Initialize llm storage on entity
  if (!entity.llm) {
    entity.llm = {};
  }

  // Create promise for this request
  const requestPromise = executeNameBioRequest(entity, worldSnapshot, options);
  pendingRequests.set(entity.id, requestPromise);

  try {
    const result = await requestPromise;
    return result;
  } finally {
    pendingRequests.delete(entity.id);
  }
}

/**
 * Execute the actual name/bio request
 * @private
 */
async function executeNameBioRequest(entity, worldSnapshot, options) {
  const startTime = Date.now();

  // Mark as pending
  entity.llm.nameBio = {
    status: 'pending',
    requestedAt: startTime,
  };

  // Emit pending event
  emit(EVENTS.DWARF_NAME_PENDING, { entity });

  // Try LLM generation
  if (llmAvailable) {
    try {
      const result = await generateWithLLM(entity, worldSnapshot, options);

      // Store successful result
      entity.llm.nameBio = {
        status: 'complete',
        source: 'llm',
        model: options.model || CONFIG.MODEL,
        name: result.name,
        bio: result.bio,
        requestedAt: startTime,
        completedAt: Date.now(),
        prompt: result._prompt, // Store for debugging
      };

      // Update entity display name
      entity.generatedName = result.name;
      entity.generatedBio = result.bio;

      // Emit success event
      emit(EVENTS.DWARF_NAME_GENERATED, {
        entity,
        name: result.name,
        bio: result.bio,
        source: 'llm',
      });

      return { name: result.name, bio: result.bio };

    } catch (error) {
      console.warn(`[NameGenerator] LLM failed for entity ${entity.id}:`, error.message);
      // Fall through to local fallback
    }
  }

  // Fallback to local generation
  const localResult = generateNameBioLocal(entity);

  entity.llm.nameBio = {
    status: 'complete',
    source: 'local',
    name: localResult.name,
    bio: localResult.bio,
    requestedAt: startTime,
    completedAt: Date.now(),
    fallbackReason: llmAvailable ? 'llm_error' : 'llm_unavailable',
  };

  // Update entity display name
  entity.generatedName = localResult.name;
  entity.generatedBio = localResult.bio;

  // Emit success event (with fallback flag)
  emit(EVENTS.DWARF_NAME_GENERATED, {
    entity,
    name: localResult.name,
    bio: localResult.bio,
    source: 'local',
  });

  return localResult;
}

/**
 * Generate name/bio using LLM
 * @private
 */
async function generateWithLLM(entity, worldSnapshot, options) {
  const timeout = options.timeout || CONFIG.TIMEOUT_MS;
  const model = options.model || CONFIG.MODEL;

  console.log(`[LLM] Generating name for entity ${entity.id} using model: ${model}`);

  // Build world context string (brief)
  const worldContext = worldSnapshot
    ? buildWorldContext(worldSnapshot)
    : null;

  // Format prompt - combine system and user prompt since llmClient doesn't support system prompt
  const userPrompt = formatDwarfNameBioPrompt(entity, { worldContext });
  const fullPrompt = `${SYSTEM_DWARF_NAME_BIO}\n\n${userPrompt}`;

  try {
    // Call LLM using the queueGeneration function for rate limiting
    const { queueGeneration } = await import('../ai/llmClient.js');

    console.log(`[LLM] Queuing generation request (timeout: ${timeout}ms)...`);

    // Create a timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`LLM request timed out after ${timeout}ms`)), timeout);
    });

    // Race between LLM call and timeout
    const response = await Promise.race([
      queueGeneration(fullPrompt, {
        maxTokens: CONFIG.MAX_TOKENS,
        temperature: CONFIG.TEMPERATURE,
        stop: ['\n\n', 'Human:', 'User:'],
      }),
      timeoutPromise,
    ]);

    console.log(`[LLM] Received response (${response?.length || 0} chars)`, response?.substring(0, 100));

    // Parse response
    const parsed = parseNameBioResponse(response);

    if (!parsed) {
      throw new Error('Failed to parse LLM response');
    }

    console.log(`[LLM] ✓ Generated: "${parsed.name}" - "${parsed.bio}"`);

    return {
      name: parsed.name,
      bio: parsed.bio,
      _prompt: fullPrompt, // For debugging
    };

  } catch (error) {
    console.error(`[LLM] Generation error:`, error.message);
    throw error;
  }
}

/**
 * Build brief world context for prompt
 * @private
 */
function buildWorldContext(worldSnapshot) {
  if (!worldSnapshot) return null;

  const parts = [];

  // Population
  const dwarfCount = worldSnapshot.dwarves?.length || 0;
  if (dwarfCount > 0) {
    parts.push(`${dwarfCount} dwarves in settlement`);
  }

  // Recent events (if available)
  if (worldSnapshot.recentEvent) {
    parts.push(worldSnapshot.recentEvent);
  }

  return parts.length > 0 ? parts.join('; ') : null;
}

// === BATCH API ===

/**
 * Request name/bio for multiple entities
 * Processes sequentially to avoid LLM overload
 *
 * @param {Array<object>} entities
 * @param {object} worldSnapshot
 * @returns {Promise<Array<object>>}
 */
export async function requestNameBioBatch(entities, worldSnapshot = null) {
  const results = [];

  for (const entity of entities) {
    try {
      const result = await requestNameBio(entity, worldSnapshot);
      results.push({ entity, ...result, success: true });
    } catch (error) {
      results.push({ entity, success: false, error: error.message });
    }
  }

  return results;
}

// === SYNC FALLBACK ===

/**
 * Generate name/bio synchronously (for immediate use)
 * Always uses local fallback, does not call LLM
 *
 * @param {object} entity
 * @returns {object} { name, bio }
 */
export function generateNameBioSync(entity) {
  const result = generateNameBioLocal(entity);

  // Store in entity
  if (!entity.llm) entity.llm = {};
  entity.llm.nameBio = {
    status: 'complete',
    source: 'local_sync',
    name: result.name,
    bio: result.bio,
    completedAt: Date.now(),
  };

  entity.generatedName = result.name;
  entity.generatedBio = result.bio;

  return result;
}

// === STATUS QUERIES ===

/**
 * Check if entity has pending name generation
 * @param {object} entity
 * @returns {boolean}
 */
export function isNamePending(entity) {
  return entity.llm?.nameBio?.status === 'pending';
}

/**
 * Check if entity has completed name generation
 * @param {object} entity
 * @returns {boolean}
 */
export function hasGeneratedName(entity) {
  return entity.llm?.nameBio?.status === 'complete';
}

/**
 * Get generation source ('llm' | 'local' | null)
 * @param {object} entity
 * @returns {string|null}
 */
export function getNameSource(entity) {
  return entity.llm?.nameBio?.source || null;
}

// === EVENT TYPES ===
// Add to eventBus.js EVENTS object:
// DWARF_NAME_PENDING: 'dwarf:name_pending'
// DWARF_NAME_GENERATED: 'dwarf:name_generated'
