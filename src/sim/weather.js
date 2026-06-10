/**
 * Emergent Weather System
 * Macro weather fronts (rot.js simplex fields) + particle texture
 *
 * Design:
 * - A wind-scrolled simplex humidity field defines storm-cloud masses that
 *   sweep across the map; a slow global "storminess" cycle makes fronts
 *   form, intensify, and dissipate over hundreds of ticks.
 * - Per-tile temperature (map climate + season + elevation) decides rain vs
 *   snow; biome lookup adds character: sandstorms over deserts in high
 *   wind, fog banks over cold marshes.
 * - The existing particle fields remain the visual texture: particles are
 *   spawned wherever the macro field says weather exists, plus from
 *   explicit point sources (scenarios/events) which now follow a
 *   build -> peak -> dissipate envelope instead of linear decay.
 *
 * Architecture:
 * WeatherSimulator: macro front fields + wind + particle fields
 * ParticleField: per-type particle physics (weatherParticles.js)
 */

import { emit, EVENTS } from '../events/eventBus.js';
import { ParticleField, PARTICLE_WEATHER_TYPES } from './weatherParticles.js';
import { getBiome } from '../map/biomes.js';
import { Biome } from '../map/tiles.js';
import { Noise, RNG } from 'rot-js';

// ============================================================
// WEATHER TYPES & PARAMETERS
// ============================================================

const WEATHER_TYPES = PARTICLE_WEATHER_TYPES;

// Front condition codes stored in the per-tile condition grid
const FRONT_CONDITIONS = [null, 'clouds', 'rain', 'snow', 'sandstorm', 'fog'];
const FRONT_CODE = Object.freeze({
  clouds: 1,
  rain: 2,
  snow: 3,
  sandstorm: 4,
  fog: 5,
});

// Macro-field tuning
const FRONT_SCALE = 0.035;        // Spatial scale of the humidity field
const FRONT_EVOLVE = 0.0045;      // How fast front shapes mutate over time
const STORM_CYCLE = 0.0011;       // Global storminess build/dissipate speed
const FRONT_DRIFT = 0.12;         // How fast fronts ride the wind
const CLOUD_THRESHOLD = 0.52;     // Humidity above this -> cloud cover
const PRECIP_THRESHOLD = 0.64;    // Humidity above this -> rain/snow
const SNOW_TEMP = 0.35;           // Below this temperature, precipitation is snow
const FRONT_RECOMPUTE_TICKS = 3;  // Recompute the condition grid every N ticks
const FRONT_SPAWNS_PER_TICK = 90; // Random cells sampled for particle spawning

// Season calendar (mirrors weatherScenarios.js)
const DAY_TICKS = 1200;
const SEASON_DAYS = 30;
const SEASON_TICKS = DAY_TICKS * SEASON_DAYS;
const SEASON_NAMES = ['spring', 'summer', 'autumn', 'winter'];
// How each season shifts the base temperature (0-1 scale)
const SEASON_TEMP_SHIFT = [0.02, 0.18, -0.02, -0.28];

/**
 * Season info for a given tick.
 * @returns {{ season: number, name: string, day: number }}
 */
export function getSeasonInfo(tick) {
  const t = tick || 0;
  const season = ((t % (SEASON_TICKS * 4)) / SEASON_TICKS) | 0;
  const day = ((t % SEASON_TICKS) / DAY_TICKS) | 0;
  return { season, name: SEASON_NAMES[season], day };
}

// ============================================================
// WEATHER SIMULATOR
// ============================================================

export class WeatherSimulator {
  constructor(width, height, seed = Date.now()) {
    this.width = width;
    this.height = height;
    this.seed = seed;

    // Deterministic procedural streams (rot.js): the RNG seeds the simplex
    // permutation table and drives particle spawn sampling, so a given world
    // seed always produces the same weather history.
    RNG.setSeed(seed);
    this.noise = new Noise.Simplex();

    // Particle fields: one per weather type
    this.fields = {};
    for (const typeKey in PARTICLE_WEATHER_TYPES) {
      const type = PARTICLE_WEATHER_TYPES[typeKey];
      this.fields[type.id] = new ParticleField(type, width, height, seed);
    }

    // Global wind field (affects all particles and scrolls the fronts)
    this.windAngle = RNG.getUniform() * Math.PI * 2;
    this.windStrength = 0.3;
    this.windTarget = this.windAngle;
    this.windStrengthTarget = 0.3;

    // Macro front state: a humidity field scrolled by the prevailing wind.
    this.frontOffsetX = 0;
    this.frontOffsetY = 0;
    this.frontIntensity = new Float32Array(width * height);
    this.frontCondition = new Uint8Array(width * height);
    this.storminess = 0.5;     // Global front envelope: builds and dissipates
    this._frontsComputed = false;
    this._isUnderground = false;

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

    // Advance and recompute the macro front fields
    this.updateFronts(state);

    // Spawn particle texture inside active fronts
    this.spawnFrontParticles();

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

    // Emit weather events (for dwarf cognition system)
    this.emitWeatherEvents(state);
  }

  /**
   * Check if this is a surface region (simple heuristic)
   */
  isSurfaceRegion(state) {
    // Count surface tiles vs underground
    const sample = Math.min(100, state.dwarves.length);
    let surfaceCount = 0;

    for (let i = 0; i < sample; i++) {
      const d = state.dwarves[i];
      if (!d) continue;
      const tile = state.map?.tiles?.[d.y * state.map.width + d.x];
      if (tile && ['grass', 'dirt', 'forest_floor'].includes(tile.type)) {
        surfaceCount++;
      }
    }

    return surfaceCount > sample / 2;
  }

  /**
   * Update global wind field.
   * Simplex-driven targets with smooth approach: wind direction and
   * strength wander slowly, so fronts change heading over time.
   */
  updateWind(state) {
    const t = (state.tick || 0) * 0.0016;
    this.windTarget = this.noise.get(t, 77.7) * Math.PI * 2;
    this.windStrengthTarget = 0.2 + 0.8 * (0.5 + 0.5 * this.noise.get(t * 0.6, -33.3));
    this.windAngle += (this.windTarget - this.windAngle) * 0.01;
    this.windStrength += (this.windStrengthTarget - this.windStrength) * 0.02;
  }

  /**
   * Update the macro weather front fields.
   *
   * humidity(x, y, t) is a blend of two simplex octaves:
   *  - a "sweep" octave whose domain scrolls with the wind, so cloud and
   *    storm masses physically cross the map;
   *  - an "evolve" octave whose phase moves through time, so fronts mutate,
   *    merge and break apart instead of drifting rigidly.
   * The global storminess cycle scales the whole field, producing calm
   * spells and storm spells.
   */
  updateFronts(state) {
    const tick = state.tick || 0;
    const map = state.map;

    // Underground maps have no sky: surface fronts stay off, and only
    // event-driven weather (mist, miasma, smoke, spores) can exist.
    this._isUnderground = !map || !map.elevation || !map.moisture;
    if (this._isUnderground) {
      if (!this._frontsComputed) {
        this.frontCondition.fill(0);
        this.frontIntensity.fill(0);
        this._frontsComputed = true;
      }
      return;
    }

    // Fronts ride the prevailing wind
    this.frontOffsetX += Math.cos(this.windAngle) * this.windStrength * FRONT_DRIFT;
    this.frontOffsetY += Math.sin(this.windAngle) * this.windStrength * FRONT_DRIFT;

    // Global storminess: fronts build, peak and dissipate over hundreds of ticks
    this.storminess = 0.5 + 0.5 * this.noise.get(tick * STORM_CYCLE, 191.3);

    if (this._frontsComputed && tick % FRONT_RECOMPUTE_TICKS !== 0) return;
    this._frontsComputed = true;

    const elevation = map.elevation;
    const moisture = map.moisture;
    const baseTemp = map.biome?.climate?.avgTemperature ?? 0.5;
    const { season } = getSeasonInfo(tick);
    const seasonShift = SEASON_TEMP_SHIFT[season];
    const fieldScale = 0.45 + this.storminess * 0.85;

    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) {
        const idx = y * this.width + x;

        const sweep = 0.5 + 0.5 * this.noise.get(
          (x + this.frontOffsetX) * FRONT_SCALE,
          (y + this.frontOffsetY) * FRONT_SCALE
        );
        const evolve = 0.5 + 0.5 * this.noise.get(
          x * FRONT_SCALE * 0.6 + tick * FRONT_EVOLVE,
          y * FRONT_SCALE * 0.6 - tick * FRONT_EVOLVE * 0.7
        );
        const humidity = (sweep * 0.65 + evolve * 0.35) * fieldScale;

        const elev = elevation[idx];
        const moist = moisture[idx];
        // Higher ground is colder; season and map climate set the baseline
        const temp = baseTemp + seasonShift - elev * 0.45 + 0.1;
        const biome = getBiome(elev, moist);

        let code = 0;
        let intensity = 0;

        if (biome === Biome.DESERT && this.windStrength > 0.5 &&
            this.storminess > 0.55 && humidity < 0.55) {
          // Dry ground + strong wind whips up a sandstorm
          code = FRONT_CODE.sandstorm;
          intensity = Math.min(1, (this.windStrength - 0.35) * this.storminess * 2.2);
        } else if (humidity > PRECIP_THRESHOLD) {
          code = temp < SNOW_TEMP ? FRONT_CODE.snow : FRONT_CODE.rain;
          intensity = Math.min(1, 0.25 + (humidity - PRECIP_THRESHOLD) / (1 - PRECIP_THRESHOLD));
        } else if (biome === Biome.MARSH && humidity > 0.46 && temp < 0.45) {
          // Cool, damp lowlands collect fog banks
          code = FRONT_CODE.fog;
          intensity = Math.min(1, (humidity - 0.46) * 2.5);
        } else if (humidity > CLOUD_THRESHOLD) {
          code = FRONT_CODE.clouds;
          intensity = Math.min(1, (humidity - CLOUD_THRESHOLD) / (PRECIP_THRESHOLD - CLOUD_THRESHOLD));
        }

        this.frontCondition[idx] = code;
        this.frontIntensity[idx] = intensity;
      }
    }
  }

  /**
   * Spawn particle texture inside active fronts.
   * Samples random cells (seeded rot.js RNG) so dense fronts continuously
   * shed particles, giving the macro masses animated interior detail.
   */
  spawnFrontParticles() {
    if (this._isUnderground) return;

    for (let i = 0; i < FRONT_SPAWNS_PER_TICK; i++) {
      const x = (RNG.getUniform() * this.width) | 0;
      const y = (RNG.getUniform() * this.height) | 0;
      const idx = y * this.width + x;

      const code = this.frontCondition[idx];
      if (!code) continue;

      const intensity = this.frontIntensity[idx];
      if (intensity <= 0.05) continue;

      const field = this.fields[FRONT_CONDITIONS[code]];
      if (!field) continue;

      field.addParticles(x, y, Math.ceil(intensity * 3), 0.25);
    }
  }

  /**
   * Apply active sources to their respective particle fields.
   * Sources follow a build -> peak -> dissipate envelope so storms gather
   * before they break and trail off afterwards.
   */
  applySources() {
    for (const source of this.sources) {
      const field = this.fields[source.type];
      if (!field) continue;

      const t = source.age / source.duration;
      let envelope;
      if (t < 0.2) {
        envelope = t / 0.2;                  // gathering
      } else if (t < 0.65) {
        envelope = 1;                        // peak
      } else {
        envelope = Math.max(0, (1 - t) / 0.35); // dissipating
      }

      const intensity = source.intensity * envelope;
      if (intensity <= 0.01) continue;

      // Spawn particles at source location
      const particleCount = Math.ceil(intensity * 20);
      field.addParticles(source.x, source.y, particleCount, 0.3);
    }
  }

  /**
   * Emit events for dwarf cognition system (throttled).
   */
  emitWeatherEvents(state) {
    if ((state.tick || 0) % 15 !== 0) return;

    const notable = ['rain', 'snow', 'sandstorm', 'fog', 'miasma', 'smoke', 'spores'];

    for (const dwarf of state.dwarves) {
      const weather = this.getWeatherAt(dwarf.x, dwarf.y);
      if (weather.type && weather.dominant > 0.4 && notable.includes(weather.type)) {
        emit(EVENTS.WEATHER_CHANGE, {
          dwarf,
          type: weather.type,
          intensity: weather.dominant,
          worldState: state,
        });
      }
    }
  }

  /**
   * Get the macro front condition at a tile (or null when clear).
   * @returns {object|null} { type, intensity }
   */
  getFrontAt(x, y) {
    const gx = Math.floor(x);
    const gy = Math.floor(y);
    if (gx < 0 || gx >= this.width || gy < 0 || gy >= this.height) return null;

    const idx = gy * this.width + gx;
    const code = this.frontCondition[idx];
    if (!code) return null;

    return { type: FRONT_CONDITIONS[code], intensity: this.frontIntensity[idx] };
  }

  /**
   * Get aggregate weather at a position.
   * Combines particle densities with the macro front field so weather
   * "exists" across the whole front mass, not just where particles sit.
   * @returns {object} { rain, snow, fog, ..., sandstorm, type, dominant }
   */
  getWeatherAt(x, y) {
    const result = {
      rain: 0, snow: 0, fog: 0, clouds: 0,
      mist: 0, miasma: 0, smoke: 0, spores: 0,
      sandstorm: 0,
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

    // Macro front contribution
    const front = this.getFrontAt(x, y);
    if (front && front.intensity > result[front.type]) {
      result[front.type] = front.intensity;
      if (front.intensity > result.dominant) {
        result.dominant = front.intensity;
        result.type = front.type;
      }
    }

    return result;
  }

  /**
   * Get rendering info for a tile
   * @returns {object} { char, chars, color, bgColor, intensity, type, brightness, animated }
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
      bgColor: type.bgColor,
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
    this.frontCondition.fill(0);
    this.frontIntensity.fill(0);
  }
}
