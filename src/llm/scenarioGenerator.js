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

// ============================================================
// DUOTONE COLOR PALETTE GENERATION
// ============================================================

/**
 * Generate a duotone complementary color palette based on a seed
 * Returns primary/secondary/tertiary/quaternary/quinary colors in HSL
 *
 * @param {number} seed - Random seed (e.g., Date.now())
 * @returns {object} Palette with five HSL color objects
 */
export function generateDuotonePalette(seed) {
  // Seeded random number generator for deterministic results
  const seededRandom = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };

  // Base hue (0-360) - wide range for variety
  const baseHue = Math.floor(seededRandom() * 360);

  // Complementary hue (opposite on color wheel)
  const complementHue = (baseHue + 180) % 360;

  // Saturation: moderate to vivid range (40-75%)
  const baseSat = 40 + Math.floor(seededRandom() * 35);

  // Lightness: dark to mid range for ASCII readability (20-45%)
  const baseLit = 20 + Math.floor(seededRandom() * 25);

  return {
    primary: {
      h: baseHue,
      s: baseSat,
      l: baseLit,
    },
    secondary: {
      h: complementHue,
      s: Math.max(20, baseSat - 10),
      l: Math.min(55, baseLit + 15),
    },
    tertiary: {
      h: (baseHue + 30) % 360,  // Analogous (adjacent on wheel)
      s: Math.max(25, baseSat - 15),
      l: Math.min(50, baseLit + 10),
    },
    quaternary: {
      h: (baseHue + 60) % 360,  // Triadic offset
      s: Math.max(20, baseSat - 20),
      l: Math.min(45, baseLit + 5),
    },
    quinary: {
      h: (complementHue + 30) % 360,  // Complement analogous
      s: Math.max(15, baseSat - 25),
      l: Math.min(60, baseLit + 20),
    },
  };
}

/**
 * Convert HSL palette to CSS custom properties
 * @param {object} palette - From generateDuotonePalette
 * @returns {object} CSS variable map
 */
export function paletteToCSS(palette) {
  const toHSL = (c) => `hsl(${c.h}, ${c.s}%, ${c.l}%)`;
  const toHSLLight = (c) => `hsl(${c.h}, ${c.s}%, ${Math.min(85, c.l + 40)}%)`;

  return {
    '--color-primary': toHSL(palette.primary),
    '--color-primary-light': toHSLLight(palette.primary),
    '--color-secondary': toHSL(palette.secondary),
    '--color-secondary-light': toHSLLight(palette.secondary),
    '--color-tertiary': toHSL(palette.tertiary),
    '--color-quaternary': toHSL(palette.quaternary),
    '--color-quinary': toHSL(palette.quinary),
    // Raw HSL values for advanced usage
    '--hue-primary': palette.primary.h,
    '--hue-secondary': palette.secondary.h,
  };
}

/**
 * Convert palette to biome color modifiers
 * Maps the duotone palette to the -30 to +30 range used by biome system
 *
 * @param {object} palette - From generateDuotonePalette
 * @returns {object} Color mod compatible with biome generator
 */
export function paletteToBiomeColorMod(palette) {
  // Map primary hue to shift value
  // 0 = no shift, 180 = maximum shift, wraps around
  const hueFromCenter = palette.primary.h - 180;
  const hueShift = Math.round((hueFromCenter / 180) * 30);

  // Saturation shift from neutral (50)
  const satShift = Math.round((palette.primary.s - 50) / 50 * 30);

  // Brightness shift from center (35)
  const litShift = Math.round((palette.primary.l - 35) / 35 * 30);

  return {
    hue: Math.max(-30, Math.min(30, hueShift)),
    saturation: Math.max(-30, Math.min(30, satShift)),
    brightness: Math.max(-30, Math.min(30, litShift)),
  };
}

/**
 * Apply palette to document as CSS custom properties
 * @param {object} palette - From generateDuotonePalette
 */
export function applyPaletteToDocument(palette) {
  const cssVars = paletteToCSS(palette);
  const root = document.documentElement;

  for (const [key, value] of Object.entries(cssVars)) {
    root.style.setProperty(key, value);
  }
}

/**
 * Generate and apply a fresh palette on page load
 * Uses current timestamp as seed for uniqueness
 * @returns {object} Generated palette
 */
export function initSessionPalette() {
  const seed = Date.now();
  const palette = generateDuotonePalette(seed);
  applyPaletteToDocument(palette);
  console.log('[Palette] Generated duotone palette:', {
    primary: `hsl(${palette.primary.h}, ${palette.primary.s}%, ${palette.primary.l}%)`,
    secondary: `hsl(${palette.secondary.h}, ${palette.secondary.s}%, ${palette.secondary.l}%)`,
  });
  return palette;
}
