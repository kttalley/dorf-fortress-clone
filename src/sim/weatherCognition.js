/**
 * Weather Cognition Integration
 * Connects weather system to dwarf thoughts, moods, and chat
 * 
 * Weather events trigger LLM-powered reactions:
 * - Mood shifts based on weather conditions
 * - Spontaneous thoughts about weather
 * - Chat about weather conditions
 * - Long-term effects on stress and fulfillment
 */

import { emit, EVENTS } from '../events/eventBus.js';

// ============================================================
// WEATHER MOOD MODIFIERS
// ============================================================

const WEATHER_MOOD_MAP = {
  rain: {
    base: -5,
    description: 'gloomy rain',
    thoughtFlavors: ['soggy', 'dreary', 'wet'],
    intensityEffect: true, // Higher intensity = more negative
  },
  snow: {
    base: 0,
    description: 'beautiful snow',
    thoughtFlavors: ['serene', 'pristine', 'cold'],
    intensityEffect: false,
  },
  fog: {
    base: -3,
    description: 'thick fog',
    thoughtFlavors: ['obscured', 'isolated', 'mysterious'],
    intensityEffect: true,
  },
  miasma: {
    base: -15,
    description: 'toxic miasma',
    thoughtFlavors: ['sickening', 'noxious', 'choking'],
    intensityEffect: true,
  },
  smoke: {
    base: -8,
    description: 'acrid smoke',
    thoughtFlavors: ['suffocating', 'burning', 'stifling'],
    intensityEffect: true,
  },
  mist: {
    base: -2,
    description: 'cool mist',
    thoughtFlavors: ['damp', 'chill', 'eerie'],
    intensityEffect: false,
  },
  spores: {
    base: -12,
    description: 'floating spores',
    thoughtFlavors: ['irritating', 'toxic', 'allergic'],
    intensityEffect: true,
  },
};

// ============================================================
// WEATHER EVENT LISTENER
// ============================================================

/**
 * Register weather listeners on event bus
 * Called during game initialization
 */
export function registerWeatherListeners() {
  // Listen for WEATHER_CHANGE events emitted by weather system
  if (typeof window !== 'undefined' && window.eventBus) {
    // Events will be handled via eventBus pattern
    // See dwarfAI.js for consumption
  }
}

/**
 * Process weather effect on a single dwarf
 * Called by the weather system or thought generator
 * 
 * @param {object} dwarf
 * @param {string} weatherType
 * @param {number} intensity (0-1)
 * @param {object} state - World state
 */
export function applyWeatherMood(dwarf, weatherType, intensity, state) {
  const weatherInfo = WEATHER_MOOD_MAP[weatherType];
  if (!weatherInfo) return;

  // Calculate mood shift
  let moodShift = weatherInfo.base;
  if (weatherInfo.intensityEffect) {
    moodShift *= intensity; // More intense = more negative
  }

  // Apply mood change
  dwarf.mood = Math.max(0, Math.min(100, (dwarf.mood || 50) + moodShift * 0.1));

  // Track weather stress (accumulates if exposed too long)
  dwarf.weatherStress = (dwarf.weatherStress || 0) + Math.abs(moodShift) * intensity * 0.05;

  // Emit thought if significant effect
  if (Math.abs(moodShift) > 3 && intensity > 0.4) {
    emitWeatherThought(dwarf, weatherType, intensity);
  }
}

/**
 * Generate weather-related thought
 */
function emitWeatherThought(dwarf, weatherType, intensity) {
  const info = WEATHER_MOOD_MAP[weatherType];
  if (!info) return;

  const thought = generateWeatherThought(dwarf, weatherType, intensity, info);

  emit(EVENTS.THOUGHT, {
    dwarf,
    thought,
    source: 'weather',
    intensity: Math.round(intensity * 100),
    type: weatherType,
  });
}

/**
 * Generate appropriate thought based on weather
 */
function generateWeatherThought(dwarf, weatherType, intensity, info) {
  const flavor = info.thoughtFlavors[Math.floor(Math.random() * info.thoughtFlavors.length)];
  const intensityLabel = intensity > 0.7 ? 'heavy' : intensity > 0.4 ? 'moderate' : 'light';

  const templates = {
    rain: [
      `This ${intensityLabel} rain makes everything so ${flavor}.`,
      `I'm tired of this ${flavor} downpour.`,
      `The ${flavor} rain feels depressing.`,
    ],
    snow: [
      `The ${flavor} snow is quite beautiful.`,
      `I enjoy watching the ${flavor} snowfall.`,
      `There's something peaceful about this ${flavor} snow.`,
    ],
    fog: [
      `This ${flavor} fog makes me feel isolated.`,
      `I can barely see through this ${flavor} haze.`,
      `The ${flavor} fog has me on edge.`,
    ],
    miasma: [
      `This ${flavor} miasma is sickening!`,
      `I feel poisoned by this ${flavor} air.`,
      `Someone needs to clear this ${flavor} miasma!`,
    ],
    smoke: [
      `This ${flavor} smoke is choking me.`,
      `I hate breathing in this ${flavor} smoke.`,
      `When will this ${flavor} smoke clear?`,
    ],
    mist: [
      `The ${flavor} mist has a certain charm.`,
      `This ${flavor} mist feels mysteriously ancient.`,
      `I'm lost in the ${flavor} mist.`,
    ],
    spores: [
      `These ${flavor} spores are irritating my lungs.`,
      `I'm allergic to these ${flavor} spores!`,
      `This ${flavor} air makes me itch.`,
    ],
  };

  const options = templates[weatherType] || templates.fog;
  return options[Math.floor(Math.random() * options.length)];
}

/**
 * Modify dwarf decision-making based on weather
 * Called by dwarfAI when deciding next action
 * 
 * @param {object} dwarf
 * @param {string} weatherType
 * @param {number} intensity
 * @returns {object} Behavior modifiers {priorityShift, stateAffinity}
 */
export function getWeatherBehaviorModifier(dwarf, weatherType, intensity) {
  const multiplier = intensity * intensity; // Quadratic: small effects scale up

  const modifiers = {
    rain: {
      priorityShift: { seeking_shelter: 5, working: -3, socializing: -1 },
      stateAffinity: 'seeking_shelter',
    },
    snow: {
      priorityShift: { seeking_shelter: 2, socializing: 1 },
      stateAffinity: null,
    },
    fog: {
      priorityShift: { seeking_shelter: 3, working: -2 },
      stateAffinity: 'confused',
    },
    miasma: {
      priorityShift: { seeking_shelter: 10, working: -5, socializing: -3 },
      stateAffinity: 'sick',
      health_damage: 0.5 * multiplier,
    },
    smoke: {
      priorityShift: { seeking_shelter: 8, moving: 3, working: -4 },
      stateAffinity: 'coughing',
    },
    mist: {
      priorityShift: { moving: 2, working: -1 },
      stateAffinity: null,
    },
    spores: {
      priorityShift: { seeking_shelter: 7, working: -3 },
      stateAffinity: 'sick',
      health_damage: 0.3 * multiplier,
    },
  };

  return modifiers[weatherType] || { priorityShift: {}, stateAffinity: null };
}

/**
 * Get weather-specific dialogue starters for game assistant chat
 */
export function getWeatherChatContext(weather, intensity) {
  const contexts = {
    rain: `Heavy rain is affecting the colony's mood. Dwarves seek shelter.`,
    snow: `Snow blankets the landscape. The colony is experiencing a calm, cold period.`,
    fog: `Thick fog obscures the map. Dwarves feel disoriented and isolated.`,
    miasma: `Noxious miasma hangs in the air. This is toxic and dangerous!`,
    smoke: `Smoke from fires fills the air. Dwarves are coughing and uncomfortable.`,
    mist: `Cool mist drifts through caverns. It creates an eerie atmosphere.`,
    spores: `Floating spores irritate dwarves' eyes and lungs. Some may become sick.`,
  };

  const base = contexts[weather] || 'Weather is affecting the colony.';
  const intensityNote = intensity > 0.7 ? ' (SEVERE)' : intensity > 0.4 ? ' (moderate)' : '';

  return base + intensityNote;
}

/**
 * Modify fulfillment based on weather exposure
 * Positive weather (snow) can increase fulfillment if dwarves appreciate beauty
 * Negative weather (miasma) decreases fulfillment and increases stress
 */
export function updateWeatherFulfillment(dwarf, weather, intensity) {
  if (!dwarf.fulfillment) {
    dwarf.fulfillment = { social: 50, exploration: 50, creativity: 50, tranquility: 50 };
  }

  const changes = {
    rain: { tranquility: -5 },
    snow: { tranquility: 3, creativity: 2 },
    fog: { exploration: -8, tranquility: -3 },
    miasma: { tranquility: -10, creativity: -5 },
    smoke: { tranquility: -8 },
    mist: { creativity: 1 },
    spores: { tranquility: -7, creativity: -2 },
  };

  const mods = changes[weather] || {};
  const multiplier = intensity * 0.5;

  for (const [key, mod] of Object.entries(mods)) {
    dwarf.fulfillment[key] = Math.max(0, Math.min(100,
      dwarf.fulfillment[key] + mod * multiplier
    ));
  }
}

/**
 * Get long-term health effects from chronic weather exposure
 * Miasma and spores cause sickness; others cause stress/fatigue
 */
export function getWeatherHealthEffects(dwarf, weather, chronicity) {
  // chronicity: number of ticks exposed to this weather
  const effects = {
    miasma: {
      sickness: Math.min(1, chronicity * 0.001),
      stress: Math.min(1, chronicity * 0.0005),
    },
    spores: {
      sickness: Math.min(1, chronicity * 0.0008),
      stress: Math.min(1, chronicity * 0.0003),
    },
    smoke: {
      sickness: Math.min(0.5, chronicity * 0.0005),
      fatigue: Math.min(1, chronicity * 0.0008),
    },
    rain: {
      stress: Math.min(0.5, chronicity * 0.0002),
      cold: Math.min(0.3, chronicity * 0.0001),
    },
    fog: {
      stress: Math.min(0.4, chronicity * 0.0003),
      confusion: Math.min(0.5, chronicity * 0.0002),
    },
  };

  return effects[weather] || {};
}

// ============================================================
// WEATHER-AWARE LLM PROMPTING
// ============================================================

/**
 * Augment dwarf context for LLM with current weather
 */
export function buildWeatherContext(dwarf, weather) {
  if (!weather || !weather.type) return '';

  const info = WEATHER_MOOD_MAP[weather.type];
  if (!info) return '';

  return `
**Current Weather:** ${info.description} (intensity: ${(weather.dominant * 100).toFixed(0)}%)
This affects the dwarf's mood, comfort, and decision-making.`;
}

/**
 * Add weather considerations to decision prompt for dwarves
 */
export function getWeatherDecisionGuidance(weather) {
  if (!weather || weather.dominant < 0.2) return '';

  const guidances = {
    rain: 'The dwarf may want to seek shelter or stay indoors.',
    snow: 'The dwarf might appreciate the beauty, but should seek warmth.',
    fog: 'The dwarf might feel disoriented and seek familiar locations.',
    miasma: 'The dwarf MUST avoid exposure or seek medical help immediately!',
    smoke: 'The dwarf should move away from the smoke source or seek shelter.',
    mist: 'The dwarf might find it atmospheric but could feel isolated.',
    spores: 'The dwarf should avoid continued exposure and seek clean air.',
  };

  return guidances[weather.type] || '';
}

// ============================================================
// DEBUG / VISUALIZATION
// ============================================================

/**
 * Get text description of current weather for log
 */
export function describeWeather(weather) {
  if (!weather || weather.dominant < 0.1) {
    return 'Clear skies';
  }

  const intensityLabel = weather.dominant > 0.7 ? 'severe' : weather.dominant > 0.4 ? 'moderate' : 'light';
  const descriptions = {
    rain: `${intensityLabel} rain`,
    snow: `${intensityLabel} snow`,
    fog: `${intensityLabel} fog`,
    miasma: `${intensityLabel} miasma`,
    smoke: `${intensityLabel} smoke`,
    mist: `${intensityLabel} mist`,
    spores: `${intensityLabel} spores`,
  };

  return descriptions[weather.type] || 'strange weather';
}
