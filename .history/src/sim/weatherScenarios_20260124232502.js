/**
 * Weather System - Example Scenarios & Triggers
 * 
 * Shows how to create weather events in response to:
 * - Scenario parameters
 * - World events (fires, deaths, flooding)
 * - Time-based cycles
 * - Player actions
 */

// ============================================================
// SCENARIO-TRIGGERED WEATHER
// ============================================================

/**
 * Apply weather to a scenario on world generation
 * 
 * Example scenario:
 * {
 *   title: "Monsoon Valley",
 *   weatherConditions: {
 *     type: "RAIN",
 *     intensity: 0.7,
 *     durationTicks: 500,
 *     location: "random_surface" // or [x, y]
 *   }
 * }
 */
export function applyScenarioWeather(state, scenario) {
  if (!scenario.weatherConditions || !state.weather) {
    return;
  }

  const weather = scenario.weatherConditions;
  let x, y;

  if (Array.isArray(weather.location)) {
    [x, y] = weather.location;
  } else if (weather.location === 'random_surface') {
    // Random surface location
    x = Math.random() * state.map.width | 0;
    y = Math.random() * state.map.height * 0.3 | 0;  // Upper part = surface
  } else if (weather.location === 'colony_center') {
    // At dwarf colony center
    const dwarves = state.dwarves.filter(d => d.state !== 'dead');
    if (dwarves.length > 0) {
      const avgX = dwarves.reduce((sum, d) => sum + d.x, 0) / dwarves.length;
      const avgY = dwarves.reduce((sum, d) => sum + d.y, 0) / dwarves.length;
      x = avgX | 0;
      y = avgY | 0;
    } else {
      x = state.map.width / 2 | 0;
      y = state.map.height / 2 | 0;
    }
  }

  state.weather.addSource(x, y, weather.type, weather.intensity, weather.durationTicks);
  console.log(`[Weather] Applied scenario weather: ${weather.type} at (${x}, ${y})`);
}

// ============================================================
// EVENT-TRIGGERED WEATHER
// ============================================================

/**
 * Add miasma when a dwarf dies (corpse decay)
 */
export function triggerMiasmaFromDeath(state, dwarf) {
  if (!state.weather) return;

  const intensity = 0.4;  // Moderate miasma
  const durationTicks = 800;  // ~2-3 game minutes

  state.weather.addSource(dwarf.x, dwarf.y, 'MIASMA', intensity, durationTicks);
  console.log(`[Weather] Miasma spawned at corpse location`);
}

/**
 * Add smoke when a fire starts (forge, wildfire, etc.)
 */
export function triggerSmokeFromFire(state, fireX, fireY, intensity = 0.6) {
  if (!state.weather) return;

  const durationTicks = 400;
  state.weather.addSource(fireX, fireY, 'SMOKE', intensity, durationTicks);
  console.log(`[Weather] Smoke spawned from fire at (${fireX}, ${fireY})`);
}

/**
 * Add spores from fungal farms or collapse
 */
export function triggerSporesFromFungalFarm(state, farmX, farmY) {
  if (!state.weather) return;

  const intensity = 0.5;
  const durationTicks = 300;
  state.weather.addSource(farmX, farmY, 'SPORES', intensity, durationTicks);
  console.log(`[Weather] Spores released from fungal farm`);
}

/**
 * Add mist from underground lakes or water features
 */
export function triggerMistFromWater(state, waterX, waterY) {
  if (!state.weather) return;

  const intensity = 0.3;
  const durationTicks = 600;
  state.weather.addSource(waterX, waterY, 'MIST', intensity, durationTicks);
}

/**
 * Trigger cloud formations on surface map only
 */
export function triggerCloudFormations(state, intensity = 0.7, durationTicks = 600) {
  if (!state.weather || !state.map.tiles) return;

  // Find a surface location (only top portion of map)
  const cloudX = Math.random() * state.map.width | 0;
  const cloudY = Math.random() * state.map.height * 0.2 | 0;  // Top 20% = surface

  state.weather.addSource(cloudX, cloudY, 'CLOUDS', intensity, durationTicks);
  console.log(`[Weather] Cloud formations triggered at (${cloudX}, ${cloudY})`);
}

/**
 * Trigger rain storm on surface map
 */
export function triggerRainStorm(state, intensity = 0.8, durationTicks = 300) {
  if (!state.weather || !state.map.tiles) return;

  // Find a surface location
  const surfaceX = Math.random() * state.map.width | 0;
  const surfaceY = Math.random() * state.map.height * 0.25 | 0;

  state.weather.addSource(surfaceX, surfaceY, 'RAIN', intensity, durationTicks);
  console.log(`[Weather] Rain storm triggered`);
}

/**
 * Trigger fog in caverns (atmosphere)
 */
export function triggerFogInCavern(state, cavern, intensity = 0.4) {
  if (!state.weather) return;

  // Cavern: { x, y, width, height } or just { x, y }, or null for random
  const x = (cavern?.x) || (Math.random() * state.map.width | 0);
  const y = (cavern?.y) || (Math.random() * state.map.height * 0.7 | 0);

  state.weather.addSource(x, y, 'FOG', intensity, 400);
  console.log(`[Weather] Fog spawned in cavern at (${x}, ${y})`);
}

/**
 * Trigger snow on surface map (seasonal)
 */
export function triggerSnowStorm(state, intensity = 0.6, durationTicks = 200) {
  if (!state.weather) return;

  const snowX = Math.random() * state.map.width | 0;
  const snowY = Math.random() * state.map.height * 0.2 | 0;

  state.weather.addSource(snowX, snowY, 'SNOW', intensity, durationTicks);
  console.log(`[Weather] Snow storm triggered`);
}

// ============================================================
// TIME-BASED WEATHER CYCLES
// ============================================================

/**
 * Weather varies by season/time
 * Call this every ~100 ticks to introduce variation
 */
export function updateSeasonalWeather(state) {
  if (!state.weather) return;

  const tick = state.tick || 0;
  const dayLength = 1200;  // Ticks per in-game day
  const seasonLength = dayLength * 30;  // 30 days per season

  const dayOfYear = (tick % (seasonLength * 4)) / dayLength | 0;
  const season = (tick % (seasonLength * 4)) / seasonLength | 0;

  // 1/100 chance per tick of weather event
  if (Math.random() > 0.99) {
    switch (season) {
      case 0:  // Spring
        if (Math.random() > 0.5) {
          triggerRainStorm(state, 0.6, 200);
        }
        break;
      case 1:  // Summer
        // Rare rain, possible fires
        break;
      case 2:  // Autumn
        if (Math.random() > 0.7) {
          triggerFogInCavern(state, null, 0.3);
        }
        break;
      case 3:  // Winter
        triggerSnowStorm(state, 0.7, 300);
        break;
    }
  }
}

// ============================================================
// WEATHER SCENARIOS (for scenario generator)
// ============================================================

export const WEATHER_SCENARIO_PRESETS = {
  monsoon: {
    name: 'Monsoon Valley',
    description: 'Constant heavy rain makes farming difficult.',
    weather: {
      type: 'RAIN',
      intensity: 0.8,
      durationTicks: 1000,
    },
  },

  toxic_cavern: {
    name: 'Toxic Cavern',
    description: 'Miasma fills the underground. Immediate threat!',
    weather: {
      type: 'MIASMA',
      intensity: 0.9,
      durationTicks: 1500,
    },
  },

  fungal_bloom: {
    name: 'Fungal Bloom',
    description: 'Spores from overgrown mushroom gardens.',
    weather: {
      type: 'SPORES',
      intensity: 0.6,
      durationTicks: 600,
    },
  },

  smoke_filled_forge: {
    name: 'Smoky Forge',
    description: 'Forge fire creates thick smoke throughout cavern.',
    weather: {
      type: 'SMOKE',
      intensity: 0.7,
      durationTicks: 500,
    },
  },

  misty_caverns: {
    name: 'Misty Caverns',
    description: 'Cool mist creates an eerie atmosphere.',
    weather: {
      type: 'MIST',
      intensity: 0.4,
      durationTicks: 1000,
    },
  },

  winter_wasteland: {
    name: 'Winter Wasteland',
    description: 'Heavy snow blankets the landscape.',
    weather: {
      type: 'SNOW',
      intensity: 0.9,
      durationTicks: 800,
    },
  },

  foggy_valley: {
    name: 'Foggy Valley',
    description: 'Thick fog obscures vision and disorientsLocally.',
    weather: {
      type: 'FOG',
      intensity: 0.7,
      durationTicks: 600,
    },
  },

  clear_skies: {
    name: 'Clear Skies',
    description: 'No weather hazards. Ideal for settlement.',
    weather: null,
  },
};

// ============================================================
// MULTI-WEATHER SCENARIOS (complex)
// ============================================================

/**
 * Trigger a complex weather event with multiple layers
 */
export function triggerComplexWeather(state, scenario) {
  if (!state.weather) return;

  const scenarios = {
    forgeAccident: {
      description: 'Forge accident: fire + smoke in central hall',
      triggers: [
        { type: 'SMOKE', x: 'forge', y: 'forge', intensity: 0.8, duration: 400 },
        { type: 'MIASMA', x: 'nearby', y: 'nearby', intensity: 0.3, duration: 200 },
      ],
    },

    cavernFlooding: {
      description: 'Water breach: mist + flooding',
      triggers: [
        { type: 'MIST', x: 'water', y: 'water', intensity: 0.6, duration: 600 },
        // Additional: water spreads (separate system)
      ],
    },

    necroticDecay: {
      description: 'Multiple corpses: intense miasma',
      triggers: [
        { type: 'MIASMA', x: 'death_site', y: 'death_site', intensity: 0.95, duration: 1000 },
        { type: 'SPORES', x: 'death_site', y: 'death_site', intensity: 0.5, duration: 800 },
      ],
    },

    seasonalStorm: {
      description: 'Surface: rain + fog combo',
      triggers: [
        { type: 'RAIN', x: 'surface', y: 'surface', intensity: 0.7, duration: 300 },
        { type: 'FOG', x: 'surface', y: 'surface', intensity: 0.4, duration: 400 },
      ],
    },
  };

  const eventScenario = scenarios[scenario];
  if (!eventScenario) {
    console.warn('[Weather] Unknown complex scenario:', scenario);
    return;
  }

  console.log(`[Weather] Triggering complex scenario: ${eventScenario.description}`);

  for (const trigger of eventScenario.triggers) {
    let x, y;

    if (trigger.x === 'forge' && trigger.y === 'forge') {
      // Find forge location or use colony center
      x = state.map.width / 2 | 0;
      y = state.map.height / 2 | 0;
    } else if (trigger.x === 'water') {
      // Find water location
      x = Math.random() * state.map.width | 0;
      y = Math.random() * state.map.height | 0;
    } else if (trigger.x === 'surface') {
      x = Math.random() * state.map.width | 0;
      y = Math.random() * state.map.height * 0.25 | 0;
    } else if (trigger.x === 'death_site') {
      // Find recent death location or use random
      const deadDwarves = state.dwarves.filter(d => d.state === 'dead');
      if (deadDwarves.length > 0) {
        x = deadDwarves[0].x;
        y = deadDwarves[0].y;
      } else {
        x = Math.random() * state.map.width | 0;
        y = Math.random() * state.map.height | 0;
      }
    } else {
      x = trigger.x || Math.random() * state.map.width | 0;
      y = trigger.y || Math.random() * state.map.height | 0;
    }

    state.weather.addSource(x, y, trigger.type, trigger.intensity, trigger.duration);
  }
}

// ============================================================
// WEATHER-TRIGGERED EVENTS
// ============================================================

/**
 * Listen for severe weather and trigger game events
 * Call this in main game loop to check conditions
 */
export function checkWeatherAlerts(state) {
  if (!state.weather) return;

  // Sample random positions to check weather
  const samplePoints = 20;
  const alerts = [];

  for (let i = 0; i < samplePoints; i++) {
    const x = Math.random() * state.map.width | 0;
    const y = Math.random() * state.map.height | 0;

    const weather = state.weather.getWeatherAt(x, y);

    if (weather.dominant < 0.6) continue;

    if (weather.miasma > 0.7) {
      alerts.push({
        type: 'DANGER',
        message: 'ALERT: Toxic miasma detected! Evacuate immediately!',
        severity: 'critical',
      });
    }

    if (weather.smoke > 0.8) {
      alerts.push({
        type: 'DANGER',
        message: 'WARNING: Heavy smoke. Fire reported!',
        severity: 'high',
      });
    }

    if (weather.rain > 0.8) {
      alerts.push({
        type: 'INFO',
        message: 'Heavy rain. Many dwarves seeking shelter.',
        severity: 'low',
      });
    }
  }

  return alerts;
}

// ============================================================
// GAMEPLAY HOOKS
// ============================================================

/**
 * Get weather-based tips for game assistant
 */
export function getWeatherGameplayTips(state) {
  if (!state.weather) return [];

  const tips = [];

  // Check for hazardous weather
  const centerX = state.map.width / 2 | 0;
  const centerY = state.map.height / 2 | 0;
  const weather = state.weather.getWeatherAt(centerX, centerY);

  if (weather.miasma > 0.5) {
    tips.push('⚠️  Miasma is present! Ensure dwarves have access to clean air. Ventilation is critical.');
  }

  if (weather.smoke > 0.6) {
    tips.push('⚠️  Smoke filled the air. Locate and extinguish the fire source.');
  }

  if (weather.rain > 0.7) {
    tips.push('💧 Heavy rain. Many dwarves prefer shelter. Ensure stockpiles have roof access.');
  }

  if (weather.spores > 0.6) {
    tips.push('⚠️  Spores detected! Allergic dwarves may become sick. Consider quarantine.');
  }

  if (weather.snow > 0.6) {
    tips.push('❄️  Snow accumulating. Cold exposure risk. Ensure dwarves have warm clothing.');
  }

  return tips;
}

export default {
  applyScenarioWeather,
  triggerMiasmaFromDeath,
  triggerSmokeFromFire,
  triggerSporesFromFungalFarm,
  triggerRainStorm,
  triggerFogInCavern,
  triggerSnowStorm,
  updateSeasonalWeather,
  WEATHER_SCENARIO_PRESETS,
  triggerComplexWeather,
  checkWeatherAlerts,
  getWeatherGameplayTips,
};
