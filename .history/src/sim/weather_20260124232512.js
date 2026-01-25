/**
 * Emergent Weather System
 * Dynamic particle fields with organic undulating motion
 * 
 * Design:
 * - Weather as swarms of particles that move and disperse
 * - Particles respond to flow fields for organic undulation
 * - Particle density rendered as animated weather tiles
 * - Wind affects all weather types differently
 * - Particles age and fade naturally
 * 
 * Architecture:
 * WeatherSimulator: Manages particle fields and wind system
 * ParticleField: Manages particles for each weather type
 * Particles: Individual weather elements with velocity and age
 */

import { getTile, inBounds } from '../map/map.js';
import { getTileDef } from '../map/tiles.js';
import { emit, EVENTS } from '../events/eventBus.js';
import { ParticleField, PARTICLE_WEATHER_TYPES } from './weatherParticles.js';

// ============================================================
// WEATHER TYPES & PARAMETERS (Updated for particles)
// ============================================================

const WEATHER_TYPES = PARTICLE_WEATHER_TYPES;

// ============================================================
// WEATHER SIMULATOR
// ============================================================

export class WeatherSimulator {
  constructor(width, height, seed = Date.now()) {
    this.width = width;
    this.height = height;
    this.seed = seed;
    
    // Particle fields: one per weather type
    this.fields = {};
    for (const typeKey in PARTICLE_WEATHER_TYPES) {
      const type = PARTICLE_WEATHER_TYPES[typeKey];
      this.fields[type.id] = new ParticleField(type, width, height, seed);
    }

    // Global wind field (affects all particles)
    this.windAngle = 0;
    this.windStrength = 0;
    this.windTarget = 0;        // Wind direction smoothly transitions
    this.windStrengthTarget = 0;

    // Active weather sources (x, y, type, intensity, duration)
    this.sources = [];

    // Performance flag
    this.enableFullDiffusion = true;
  }

  checkPerformance() {
    // Always enable full diffusion for now to ensure weather is visible
    return true;
  }

  /**
   * Add a weather source (e.g., rain from clouds, miasma from corpse)
   * @param {number} x
   * @param {number} y
   * @param {string} weatherType - Key from WEATHER_TYPES
   * @param {number} intensity - 0-1
   * @param {number} durationTicks
   */
  addSource(x, y, weatherType, intensity = 1.0, durationTicks = 100) {
    if (!WEATHER_TYPES[weatherType]) {
      console.warn('[Weather] Unknown weather type:', weatherType);
      return;
    }

    const type = WEATHER_TYPES[weatherType];

    // Only surface weather (CLOUDS) allowed - no rain, snow, fog, miasma, mist, smoke, spores
    if (type.id !== 'clouds') {
      console.warn('[Weather] Only cloud formations are currently enabled on surface');
      return;
    }

    this.sources.push({
      x, y,
      type: type.id,
      intensity: Math.max(0, Math.min(1, intensity)),
      age: 0,
      duration: durationTicks,
    });
  }

  /**
   * Main update loop (called once per tick)
   * @param {object} state - World state (for terrain queries)
   */
  tick(state) {
    // Update wind field
    this.updateWind(state);

    // Apply sources to particle fields (spawn new particles)
    this.applySources();

    // Update all particle fields with physics
    for (const fieldId in this.fields) {
      const field = this.fields[fieldId];
      field.update(state.tick, this.windAngle, this.windStrength);
    }

    // Age and remove expired sources
    this.sources = this.sources.filter(s => {
      s.age++;
      return s.age < s.duration;
    });

    // DEBUG: Log weather state every 60 ticks
    if (state.tick % 60 === 0) {
      const weatherAt10_10 = this.getWeatherAt(10, 10);
      const weatherAt71_20 = this.getWeatherAt(71, 20);
      console.log(`[Weather] Tick ${state.tick}: at(10,10)=`, weatherAt10_10, `at(71,20)=`, weatherAt71_20, 'sources=', this.sources.length);
    }

    // Emit weather events (for dwarf cognition system)
    this.emitWeatherEvents(state);
  }

  /**
   * Check if this is a surface region (simple heuristic)
   */
  isSurfaceRegion(state) {
    // Count surface tiles vs underground
    // For now, assume surface if map has grass/forest/terrain tiles
    const sample = Math.min(100, state.dwarves.length);
    let surfaceCount = 0;

    for (let i = 0; i < sample; i++) {
      const d = state.dwarves[i];
      if (!d) continue;
      const tile = getTile(state.map, d.x, d.y);
      if (tile && ['grass', 'dirt', 'forest_floor'].includes(tile.type)) {
        surfaceCount++;
      }
    }

    return surfaceCount > sample / 2;
  }

  /**
   * Update global wind field
   */
  updateWind(state) {
    // Deterministic wind using world seed and tick count
    const windNoise = seededNoise(this.seed + state.tick * 0.001, 0, 2);
    this.windAngle += windNoise * 0.05; // Slow smooth variation
    this.windStrength = 0.3 + Math.sin(state.tick * 0.01) * 0.2; // 0.1 to 0.5
  }

  /**
   * Apply active sources to their respective particle fields
   */
  applySources() {
    for (const source of this.sources) {
      const field = this.fields[source.type];
      if (!field) continue;

      const decayFactor = 1 - (source.age / source.duration);
      const intensity = source.intensity * decayFactor;

      // Spawn particles at source location
      const particleCount = Math.ceil(intensity * 20);
      field.addParticles(source.x, source.y, particleCount, 0.3);
    }
  }

  /**
   * Emit events for dwarf cognition system
   */
  emitWeatherEvents(state) {
    // Sample weather at dwarf positions
    for (const dwarf of state.dwarves) {
      const weatherAtPosition = this.getWeatherAt(dwarf.x, dwarf.y);

      if (weatherAtPosition.rain > 0.5 && weatherAtPosition.type === 'rain') {
        emit(EVENTS.WEATHER_CHANGE, {
          dwarf,
          type: 'rain',
          intensity: weatherAtPosition.rain,
          worldState: state,
        });
      }

      if (weatherAtPosition.miasma > 0.6) {
        emit(EVENTS.WEATHER_CHANGE, {
          dwarf,
          type: 'miasma',
          intensity: weatherAtPosition.miasma,
          worldState: state,
        });
      }

      if (weatherAtPosition.fog > 0.4) {
        emit(EVENTS.WEATHER_CHANGE, {
          dwarf,
          type: 'fog',
          intensity: weatherAtPosition.fog,
          worldState: state,
        });
      }
    }
  }

  /**
   * Get aggregate weather at a position
   * @returns {object} { rain, snow, fog, miasma, smoke, mist, spores, type }
   */
  getWeatherAt(x, y) {
    const result = {
      rain: 0, snow: 0, fog: 0, clouds: 0,
      mist: 0, miasma: 0, smoke: 0, spores: 0,
      type: null,
      dominant: 0,
    };

    for (const fieldId in this.fields) {
      const field = this.fields[fieldId];
      const density = field.getDensityAt(x, y);

      result[fieldId] = density;

      if (density > result.dominant) {
        result.dominant = density;
        result.type = fieldId;
      }
    }

    return result;
  }

  /**
   * Get rendering info for a tile
   * @returns {object} { char, color, brightness, animated }
   */
  getRenderingAt(x, y) {
    const weather = this.getWeatherAt(x, y);
    // Threshold for visibility
    if (weather.dominant < 0.05) {
      return null; // No significant weather
    }

    // Find the type object by matching the id
    let type = null;
    for (const typeKey in PARTICLE_WEATHER_TYPES) {
      if (PARTICLE_WEATHER_TYPES[typeKey].id === weather.type) {
        type = PARTICLE_WEATHER_TYPES[typeKey];
        break;
      }
    }
    
    if (!type) return null;

    return {
      char: type.char,
      chars: type.chars,
      intensity: weather.dominant,
      type: weather.type,
      color: type.color,
      brightness: Math.min(1, weather.dominant * 1.5),
      animated: true,
    };
  }

  /**
   * Clear all weather (for debug/reset)
   */
  clear() {
    for (const fieldId in this.fields) {
      this.fields[fieldId].particles = [];
      this.fields[fieldId].densityField.fill(0);
    }
    this.sources = [];
  }
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

/**
 * Seeded random number generator
 */
function seededNoise(seed, min, max) {
  const x = Math.sin(seed) * 10000;
  const randomValue = x - Math.floor(x);
  return min + randomValue * (max - min);
}

