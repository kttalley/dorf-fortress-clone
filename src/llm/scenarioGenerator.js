/**
 * Scenario Generator
 * Async LLM-powered scenario generation with validation and fallback
 *
 * Agent G ownership: coherent, repeatable scenario generation
 * NEVER called in main tick loop - only during game setup
 */

import { queueGeneration, checkConnection } from '../ai/llmClient.js';
import {
  formatScenarioPrompt,
  parseScenarioResponse,
  SYSTEM_SCENARIO_GENERATOR,
} from './prompts/scenarios.js';
import { validateScenario, sanitizeScenario } from '../scenarios/scenarioSchema.js';
import { getRandomPreset, PRESET_SCENARIOS } from '../scenarios/presets.js';

// Track generation state
let isGenerating = false;
let lastGeneratedScenario = null;

/**
 * Generate a new scenario using LLM
 * Falls back to preset if LLM unavailable or output invalid
 *
 * @param {object} options - Generation options
 * @param {string} options.theme - Optional theme hint (mountain, underground, valley, survival, expedition)
 * @param {string} options.customHint - Optional custom flavor hint
 * @param {boolean} options.forcePreset - Skip LLM, use preset directly
 * @returns {Promise<object>} Generated or fallback scenario with seed
 */
export async function generateScenario(options = {}) {
  const { theme, customHint, forcePreset = false } = options;

  // Prevent concurrent generation
  if (isGenerating) {
    console.warn('[ScenarioGen] Generation already in progress, returning fallback');
    return getRandomPreset();
  }

  // Fast path: force preset
  if (forcePreset) {
    const preset = getRandomPreset();
    lastGeneratedScenario = preset;
    return preset;
  }

  isGenerating = true;

  try {
    // Check LLM availability
    const connected = await checkConnection();
    if (!connected) {
      console.log('[ScenarioGen] LLM unavailable, using preset');
      const preset = getRandomPreset();
      lastGeneratedScenario = preset;
      return preset;
    }

    // Build prompt
    const { system, user } = formatScenarioPrompt({ theme, customHint });

    // Combine system + user for Ollama (it uses single prompt)
    const fullPrompt = `${system}\n\n${user}`;

    // Call LLM with generous token limit for JSON
    const response = await queueGeneration(fullPrompt, {
      maxTokens: 400,
      temperature: 0.9,
      stop: ['\n\n\n', '```\n\n'],
    });

    if (!response) {
      console.log('[ScenarioGen] LLM returned empty response, using preset');
      const preset = getRandomPreset();
      lastGeneratedScenario = preset;
      return preset;
    }

    // Parse JSON from response
    const parsed = parseScenarioResponse(response);
    if (!parsed) {
      console.log('[ScenarioGen] Failed to parse LLM response, using preset');
      console.debug('[ScenarioGen] Raw response:', response);
      const preset = getRandomPreset();
      lastGeneratedScenario = preset;
      return preset;
    }

    // Validate against schema
    const validation = validateScenario(parsed);
    if (!validation.valid) {
      console.log('[ScenarioGen] Validation failed:', validation.errors);
      console.debug('[ScenarioGen] Invalid scenario:', parsed);
      const preset = getRandomPreset();
      lastGeneratedScenario = preset;
      return preset;
    }

    // Success! Return sanitized scenario
    const scenario = {
      ...validation.sanitized,
      seed: Date.now(),
      isGenerated: true,
    };

    lastGeneratedScenario = scenario;
    console.log('[ScenarioGen] Generated scenario:', scenario.title);
    return scenario;

  } catch (error) {
    console.error('[ScenarioGen] Generation error:', error.message);
    const preset = getRandomPreset();
    lastGeneratedScenario = preset;
    return preset;

  } finally {
    isGenerating = false;
  }
}

/**
 * Generate scenario with specific theme
 * Convenience wrapper for themed generation
 *
 * @param {string} theme - One of: mountain, underground, valley, survival, expedition
 * @returns {Promise<object>} Generated scenario
 */
export async function generateThemedScenario(theme) {
  return generateScenario({ theme });
}

/**
 * Get the last generated scenario
 * @returns {object|null} Last scenario or null if none generated
 */
export function getLastScenario() {
  return lastGeneratedScenario;
}

/**
 * Check if generation is in progress
 * @returns {boolean}
 */
export function isGenerationInProgress() {
  return isGenerating;
}

/**
 * Get a preset scenario (no LLM call)
 * @param {number} index - Optional specific preset index
 * @returns {object} Preset scenario with seed
 */
export function getPreset(index) {
  if (typeof index === 'number' && index >= 0 && index < PRESET_SCENARIOS.length) {
    return {
      ...PRESET_SCENARIOS[index],
      seed: Date.now(),
      isPreset: true,
    };
  }
  return getRandomPreset();
}

/**
 * Re-roll scenario seed (keeps same parameters)
 * @param {object} scenario - Scenario to re-seed
 * @returns {object} Same scenario with new seed
 */
export function rerollSeed(scenario) {
  return {
    ...scenario,
    seed: Date.now(),
  };
}

/**
 * Create custom scenario from user parameters
 * Validates and sanitizes input
 *
 * @param {object} customParams - User-provided parameters
 * @returns {{ valid: boolean, scenario: object|null, errors: string[] }}
 */
export function createCustomScenario(customParams) {
  const scenario = {
    title: customParams.title || 'Custom Scenario',
    description: customParams.description || 'A custom adventure awaits.',
    parameters: customParams.parameters || {},
    victory_conditions: customParams.victory_conditions || ['Survive'],
  };

  const validation = validateScenario(scenario);

  if (validation.valid) {
    return {
      valid: true,
      scenario: {
        ...validation.sanitized,
        seed: customParams.seed || Date.now(),
        isCustom: true,
      },
      errors: [],
    };
  }

  return {
    valid: false,
    scenario: null,
    errors: validation.errors,
  };
}

/**
 * Serialize scenario for storage/sharing
 * @param {object} scenario - Scenario to serialize
 * @returns {string} JSON string
 */
export function serializeScenario(scenario) {
  return JSON.stringify({
    title: scenario.title,
    description: scenario.description,
    parameters: scenario.parameters,
    victory_conditions: scenario.victory_conditions,
    seed: scenario.seed,
  });
}

/**
 * Deserialize scenario from storage
 * @param {string} json - JSON string
 * @returns {{ valid: boolean, scenario: object|null, errors: string[] }}
 */
export function deserializeScenario(json) {
  try {
    const parsed = JSON.parse(json);
    return createCustomScenario(parsed);
  } catch (error) {
    return {
      valid: false,
      scenario: null,
      errors: [`Invalid JSON: ${error.message}`],
    };
  }
}
