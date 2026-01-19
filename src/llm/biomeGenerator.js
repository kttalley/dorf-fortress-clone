/**
 * Biome Generator
 * LLM-based generation of biome names and color modifiers
 * Called at map generation time (not in tick loop)
 */

import { queueGeneration, checkLLMHealth } from '../ai/llmClient.js';

// LLM availability (set by external check)
let llmAvailable = false;

/**
 * Set LLM availability status
 * @param {boolean} available
 */
export function setBiomeLLMAvailable(available) {
  llmAvailable = available;
}

/**
 * Predefined biome presets for fallback
 * Keyed by climate signature: [tempLevel]-[moistureLevel]-[elevationLevel]
 * Each level is: low, mid, high
 */
const BIOME_PRESETS = {
  // Cold biomes
  'cold-dry-high': { name: 'Frozen Alpine Peaks', hue: -15, saturation: -20, brightness: 10 },
  'cold-dry-mid': { name: 'Arctic Tundra', hue: -10, saturation: -15, brightness: 5 },
  'cold-dry-low': { name: 'Frozen Steppe', hue: -12, saturation: -10, brightness: 0 },
  'cold-mid-high': { name: 'Glacial Highlands', hue: -20, saturation: -25, brightness: 15 },
  'cold-mid-mid': { name: 'Boreal Taiga', hue: -5, saturation: 5, brightness: -5 },
  'cold-mid-low': { name: 'Subpolar Marshland', hue: -8, saturation: 10, brightness: -10 },
  'cold-wet-high': { name: 'Snowy Mountain Forest', hue: -10, saturation: 0, brightness: 5 },
  'cold-wet-mid': { name: 'Temperate Rainforest', hue: 5, saturation: 15, brightness: -5 },
  'cold-wet-low': { name: 'Misty Wetlands', hue: -5, saturation: 20, brightness: -15 },

  // Moderate biomes
  'mid-dry-high': { name: 'Rocky Highlands', hue: 5, saturation: -15, brightness: 0 },
  'mid-dry-mid': { name: 'Temperate Grassland', hue: 10, saturation: 0, brightness: 5 },
  'mid-dry-low': { name: 'Dry Savanna', hue: 20, saturation: -5, brightness: 10 },
  'mid-mid-high': { name: 'Alpine Meadow', hue: 0, saturation: 10, brightness: 0 },
  'mid-mid-mid': { name: 'Temperate Woodland', hue: 5, saturation: 5, brightness: 0 },
  'mid-mid-low': { name: 'River Valley', hue: 0, saturation: 15, brightness: -5 },
  'mid-wet-high': { name: 'Cloud Forest', hue: -5, saturation: 20, brightness: -10 },
  'mid-wet-mid': { name: 'Lush Deciduous Forest', hue: 10, saturation: 20, brightness: -5 },
  'mid-wet-low': { name: 'Temperate Marsh', hue: 5, saturation: 25, brightness: -15 },

  // Hot biomes
  'hot-dry-high': { name: 'Arid Plateau', hue: 25, saturation: -20, brightness: 15 },
  'hot-dry-mid': { name: 'Desert Wasteland', hue: 30, saturation: -25, brightness: 20 },
  'hot-dry-low': { name: 'Salt Flats', hue: 35, saturation: -30, brightness: 25 },
  'hot-mid-high': { name: 'Volcanic Highlands', hue: 15, saturation: -10, brightness: 5 },
  'hot-mid-mid': { name: 'Mediterranean Scrubland', hue: 20, saturation: 5, brightness: 10 },
  'hot-mid-low': { name: 'Tropical Savanna', hue: 15, saturation: 10, brightness: 5 },
  'hot-wet-high': { name: 'Tropical Montane Forest', hue: 10, saturation: 25, brightness: -10 },
  'hot-wet-mid': { name: 'Tropical Rainforest', hue: 15, saturation: 30, brightness: -15 },
  'hot-wet-low': { name: 'Mangrove Swamp', hue: 10, saturation: 20, brightness: -20 },
};

/**
 * Get temperature level string
 */
function getTempLevel(temp) {
  if (temp < 0.35) return 'cold';
  if (temp < 0.65) return 'mid';
  return 'hot';
}

/**
 * Get moisture level string
 */
function getMoistureLevel(moisture) {
  if (moisture < 0.35) return 'dry';
  if (moisture < 0.65) return 'mid';
  return 'wet';
}

/**
 * Get elevation level string
 */
function getElevationLevel(elevation) {
  if (elevation < 0.35) return 'low';
  if (elevation < 0.65) return 'mid';
  return 'high';
}

/**
 * Get fallback biome based on climate parameters
 * @param {object} climate - { avgElevation, avgMoisture, avgTemperature }
 * @returns {object} { name, colorMod: { hue, saturation, brightness } }
 */
export function getFallbackBiome(climate) {
  const tempLevel = getTempLevel(climate.avgTemperature);
  const moistureLevel = getMoistureLevel(climate.avgMoisture);
  const elevationLevel = getElevationLevel(climate.avgElevation);

  const key = `${tempLevel}-${moistureLevel}-${elevationLevel}`;
  const preset = BIOME_PRESETS[key] || BIOME_PRESETS['mid-mid-mid'];

  return {
    name: preset.name,
    description: `A ${tempLevel} ${moistureLevel} region at ${elevationLevel} elevation.`,
    colorMod: {
      hue: preset.hue,
      saturation: preset.saturation,
      brightness: preset.brightness,
    },
    source: 'fallback',
  };
}

/**
 * Build LLM prompt for biome generation
 */
function buildBiomePrompt(climate) {
  const tempDesc = climate.avgTemperature < 0.35 ? 'cold' :
                   climate.avgTemperature < 0.65 ? 'temperate' : 'hot';
  const moistDesc = climate.avgMoisture < 0.35 ? 'arid' :
                    climate.avgMoisture < 0.65 ? 'moderate moisture' : 'humid';
  const elevDesc = climate.avgElevation < 0.35 ? 'lowland' :
                   climate.avgElevation < 0.65 ? 'mid-elevation' : 'highland';

  return `Generate a creative, evocative biome name for a fantasy world region.

Climate characteristics:
- Temperature: ${tempDesc} (${(climate.avgTemperature * 100).toFixed(0)}%)
- Moisture: ${moistDesc} (${(climate.avgMoisture * 100).toFixed(0)}%)
- Elevation: ${elevDesc} (${(climate.avgElevation * 100).toFixed(0)}%)

Examples of good biome names:
- "Windswept Tundra"
- "Subtropical Cloud Forest"
- "Arid Badlands"
- "Temperate River Valley"
- "Frozen Volcanic Highlands"

Return ONLY a JSON object (no markdown, no extra text):
{"name": "Your Biome Name", "hue": 0, "saturation": 0, "brightness": 0}

Where hue/saturation/brightness are color shifts (-30 to +30):
- Cold regions: negative hue (toward blue), lower saturation
- Hot regions: positive hue (toward orange/yellow), higher brightness
- Wet regions: higher saturation, slightly negative brightness
- Dry regions: lower saturation, higher brightness

Generate now:`;
}

/**
 * Parse LLM response for biome data
 */
function parseBiomeResponse(response) {
  if (!response) return null;

  try {
    // Clean response
    let cleaned = response.replace(/```(?:json)?/g, '').trim();

    // Try to extract JSON object
    const jsonMatch = cleaned.match(/\{[^}]+\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (parsed.name) {
        return {
          name: parsed.name,
          colorMod: {
            hue: Math.max(-30, Math.min(30, parsed.hue || 0)),
            saturation: Math.max(-30, Math.min(30, parsed.saturation || 0)),
            brightness: Math.max(-30, Math.min(30, parsed.brightness || 0)),
          },
        };
      }
    }
  } catch (e) {
    console.warn('[BiomeGen] Failed to parse response:', e.message);
  }

  return null;
}

/**
 * Generate biome name and color modifiers using LLM
 * @param {object} climate - { avgElevation, avgMoisture, avgTemperature }
 * @param {object} options - { timeout }
 * @returns {Promise<object>} { name, description, colorMod, source }
 */
export async function generateBiome(climate, options = {}) {
  const timeout = options.timeout || 10000;

  console.log('[BiomeGen] Generating biome for climate:', climate);

  // Try LLM if available
  if (llmAvailable) {
    try {
      const prompt = buildBiomePrompt(climate);

      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Biome generation timeout')), timeout);
      });

      const response = await Promise.race([
        queueGeneration(prompt, {
          maxTokens: 100,
          temperature: 0.9,
          stop: ['\n\n'],
        }),
        timeoutPromise,
      ]);

      console.log('[BiomeGen] LLM response:', response?.substring(0, 100));

      const parsed = parseBiomeResponse(response);
      if (parsed) {
        console.log('[BiomeGen] Generated biome:', parsed.name);
        return {
          name: parsed.name,
          description: `A unique ${parsed.name.toLowerCase()} region.`,
          colorMod: parsed.colorMod,
          source: 'llm',
        };
      }
    } catch (error) {
      console.warn('[BiomeGen] LLM failed:', error.message);
    }
  }

  // Fallback to preset
  console.log('[BiomeGen] Using fallback biome');
  return getFallbackBiome(climate);
}

/**
 * Initialize biome generator (check LLM health)
 */
export async function initBiomeGenerator() {
  try {
    const available = await checkLLMHealth();
    setBiomeLLMAvailable(available);
    console.log('[BiomeGen] LLM available:', available);
    return available;
  } catch (e) {
    setBiomeLLMAvailable(false);
    return false;
  }
}
