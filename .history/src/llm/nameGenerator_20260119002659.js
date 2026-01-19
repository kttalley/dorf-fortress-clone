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
  TIMEOUT_MS: 15000,         // LLM request timeout (increased for queued requests)
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
      console.warn(`[LLM] LLM failed for entity ${entity.id}:`, error.message);
      console.log('[LLM] Falling back to local generation...');
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

    console.log(`[LLM] Received response (${response?.length || 0} chars):`, response?.substring(0, 150));

    // Parse response
    const parsed = parseNameBioResponse(response);

    console.log(`[LLM] Parsed result:`, parsed);

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

/**
 * Request name/bio for multiple entities in a SINGLE LLM call
 * Much faster than individual requests - all names generated in one batch
 * @param {Array<object>} entities - Dwarf entities (must have id, personality)
 * @param {object} worldSnapshot - Optional world context
 * @param {object} options - Optional overrides
 * @returns {Promise<Array<{ entity, name, bio, source }>>}
 */
export async function requestNameBioBatchSingle(entities, worldSnapshot = null, options = {}) {
  const timeout = options.timeout || (CONFIG.TIMEOUT_MS * 1.5);  // Slightly longer for batch
  const startTime = Date.now();

  console.log(`[LLM Batch] Generating names for ${entities.length} dwarves in single call...`);

  // Mark all as pending
  for (const entity of entities) {
    if (!entity.llm) entity.llm = {};
    entity.llm.nameBio = {
      status: 'pending',
      requestedAt: startTime,
    };
    emit(EVENTS.DWARF_NAME_PENDING, { entity });
  }

  // Try LLM generation
  if (!llmAvailable) {
    console.log('[LLM Batch] LLM unavailable, using local generation for all');
    return generateNameBioBatchLocal(entities);
  }

  try {
    // Build batch prompt
    const batchPrompt = formatBatchNameBioPrompt(entities, { worldContext: worldSnapshot });
    const fullPrompt = `${SYSTEM_DWARF_NAME_BIO}\n\n${batchPrompt}`;

    console.log(`[LLM Batch] Sending batch prompt (${entities.length} dwarves, ~${fullPrompt.length} chars)`);

    const { queueGeneration } = await import('../ai/llmClient.js');

    // Create timeout promise
    const timeoutPromise = new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`Batch request timed out after ${timeout}ms`)), timeout);
    });

    // Race between LLM call and timeout
    const response = await Promise.race([
      queueGeneration(fullPrompt, {
        maxTokens: CONFIG.MAX_TOKENS * 2,  // More tokens for all names
        temperature: CONFIG.TEMPERATURE,
        stop: ['\n\n', 'Human:', 'User:'],
      }),
      timeoutPromise,
    ]);

    console.log(`[LLM Batch] Received response (${response?.length || 0} chars)`);

    // Parse response to extract all names
    const parsed = parseBatchNameBioResponse(response, entities);

    if (!parsed || parsed.length === 0) {
      throw new Error('Failed to parse batch LLM response');
    }

    console.log(`[LLM Batch] Parsed ${parsed.length} names from response`);

    // Store results for all entities
    const results = [];
    for (const result of parsed) {
      const entity = result.entity;

      // Store successful result
      entity.llm.nameBio = {
        status: 'complete',
        source: 'llm',
        model: options.model || CONFIG.MODEL,
        name: result.name,
        bio: result.bio,
        requestedAt: startTime,
        completedAt: Date.now(),
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

      results.push({
        entity,
        name: result.name,
        bio: result.bio,
        source: 'llm',
        success: true,
      });
    }

    // Fallback for any unparsed entities
    for (const entity of entities) {
      if (!results.find(r => r.entity.id === entity.id)) {
        console.log(`[LLM Batch] Using fallback for entity ${entity.id} (not in parsed response)`);
        const localResult = generateNameBioLocal(entity);

        entity.llm.nameBio = {
          status: 'complete',
          source: 'local',
          name: localResult.name,
          bio: localResult.bio,
          requestedAt: startTime,
          completedAt: Date.now(),
          fallbackReason: 'partial_parse',
        };

        entity.generatedName = localResult.name;
        entity.generatedBio = localResult.bio;

        emit(EVENTS.DWARF_NAME_GENERATED, {
          entity,
          name: localResult.name,
          bio: localResult.bio,
          source: 'local',
        });

        results.push({
          entity,
          name: localResult.name,
          bio: localResult.bio,
          source: 'local',
          success: true,
        });
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[LLM Batch] ✓ Complete: ${results.filter(r => r.source === 'llm').length} LLM, ${results.filter(r => r.source === 'local').length} fallback (${elapsed}ms)`);

    return results;

  } catch (error) {
    console.error(`[LLM Batch] Generation error:`, error.message);
    console.log('[LLM Batch] Falling back to local generation for all');
    return generateNameBioBatchLocal(entities, startTime);
  }
}

/**
 * Format prompt for batch name generation
 * @private
 */
function formatBatchNameBioPrompt(entities, options = {}) {
  const list = entities
    .map((e, i) => `${i + 1}. Dwarf ID ${e.id}: ${e.personality ? Object.entries(e.personality).sort((a,b)=>b[1]-a[1]).slice(0,2).map(([t])=>t).join(', ') : 'ordinary'}`)
    .join('\n');

  return `Generate creative names and short one-line bios for ALL ${entities.length} dwarves listed below.

${list}

IMPORTANT: You MUST provide an entry for EVERY SINGLE dwarf. Return a JSON array with exactly ${entities.length} objects.

Return ONLY valid JSON in this format (no markdown, no extra text):
[
  {
    "id": 1,
    "name": "Full Name",
    "bio": "One sentence bio"
  },
  {
    "id": 2,
    "name": "Full Name",
    "bio": "One sentence bio"
  }
]

Generate all ${entities.length} entries now:`;
}

/**
 * Parse batch response to extract all names
 * Flexible parser that handles JSON and text formats
 * @private
 */
function parseBatchNameBioResponse(response, entities) {
  if (!response || response.length === 0) return [];

  console.log(`[Parser] Raw response (${response.length} chars): "${response.substring(0, 200)}..."`);

  const results = [];

  // Strategy 1: Try JSON parsing
  try {
    // Remove markdown code blocks if present
    let jsonStr = response.trim();
    if (jsonStr.includes('```')) {
      jsonStr = jsonStr.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    }

    console.log(`[Parser] Attempting JSON parse...`);
    const parsed = JSON.parse(jsonStr);

    // Handle both array and single object
    const entries = Array.isArray(parsed) ? parsed : [parsed];
    console.log(`[Parser] ✓ JSON parse succeeded, found ${entries.length} entries`);

    for (const entry of entries) {
      const id = entry.id !== undefined ? entry.id : entry.ID;
      const name = entry.name || entry.Name;
      const bio = entry.bio || entry.Bio;

      if (name) {
        const entityIndex = id !== undefined ? (id - 1) : (results.length);
        const entity = entities[entityIndex];

        if (entity) {
          console.log(`[Parser] ✓ Entry: ID ${id}, "${name}", "${bio}"`);
          results.push({ entity, name, bio: bio || 'A dwarf of mysterious purpose.' });
        }
      }
    }

    if (results.length > 0) {
      console.log(`[Parser] ✓ JSON strategy successful: ${results.length} results`);
      return results;
    }
  } catch (error) {
    console.log(`[Parser] JSON parse failed: ${error.message}`);
  }

  // Strategy 2: Split by "---" (text format)
  let sections = response.split('---').filter(s => s.trim());
  console.log(`[Parser] Strategy 2 (split by ---): Found ${sections.length} sections`);

  if (sections.length > 0) {
    for (let sectionIdx = 0; sectionIdx < sections.length; sectionIdx++) {
      const section = sections[sectionIdx].trim();
      if (!section) continue;

      console.log(`[Parser] Section ${sectionIdx}: "${section.substring(0, 100)}..."`);

      const lines = section.split('\n');
      let id = null;
      let name = null;
      let bio = null;

      for (const line of lines) {
        const trimmed = line.trim();

        if (trimmed.includes('ID:') || trimmed.match(/^ID\s+\d/)) {
          const idMatch = trimmed.match(/ID:\s*(\d+)|ID\s+(\d+)/);
          if (idMatch) {
            id = parseInt(idMatch[1] || idMatch[2]);
          }
        }

        if (trimmed.includes('Name:') || trimmed.match(/^Name\s+/i)) {
          name = trimmed.replace(/^.*?Name:\s*/i, '').replace(/^Name\s+/i, '').trim();
        }

        if (trimmed.includes('Bio:') || trimmed.match(/^Bio\s+/i)) {
          bio = trimmed.replace(/^.*?Bio:\s*/i, '').replace(/^Bio\s+/i, '').trim();
        }
      }

      if (name) {
        if (id === null) id = sectionIdx + 1;
        if (!bio) bio = 'A dwarf of mysterious purpose.';

        const entity = entities[id - 1];
        if (entity) {
          console.log(`[Parser] ✓ Adding: ID ${id}, "${name}", "${bio}"`);
          results.push({ entity, name, bio });
        }
      }
    }

    if (results.length > 0) {
      console.log(`[Parser] ✓ Text strategy successful: ${results.length} results`);
      return results;
    }
  }

  // Strategy 3: Try to extract any "Name:" or name-like patterns
  console.log(`[Parser] Strategy 3: Regex extraction of any names...`);
  const nameMatches = response.match(/(?:Name|name):\s*([^\n,}]+)/g);
  if (nameMatches && nameMatches.length > 0) {
    for (let i = 0; i < nameMatches.length && i < entities.length; i++) {
      const name = nameMatches[i].replace(/(?:Name|name):\s*/i, '').trim();
      if (name && name.length > 0) {
        results.push({ entity: entities[i], name, bio: 'A dwarf of mysterious purpose.' });
      }
    }
  }

  console.log(`[Parser] ✓ Final result: ${results.length} parsed entries`);
  return results;
}

/**
 * Generate names/bios locally for batch of entities
 * @private
 */
function generateNameBioBatchLocal(entities, startTime = Date.now()) {
  const results = [];

  for (const entity of entities) {
    const localResult = generateNameBioLocal(entity);

    entity.llm.nameBio = {
      status: 'complete',
      source: 'local',
      name: localResult.name,
      bio: localResult.bio,
      requestedAt: startTime,
      completedAt: Date.now(),
      fallbackReason: 'llm_unavailable',
    };

    entity.generatedName = localResult.name;
    entity.generatedBio = localResult.bio;

    emit(EVENTS.DWARF_NAME_GENERATED, {
      entity,
      name: localResult.name,
      bio: localResult.bio,
      source: 'local',
    });

    results.push({
      entity,
      name: localResult.name,
      bio: localResult.bio,
      source: 'local',
      success: true,
    });
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
