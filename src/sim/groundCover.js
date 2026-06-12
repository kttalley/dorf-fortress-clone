/**
 * Ground cover persistence (audit WX 7) — the ground remembers weather.
 *
 * Two per-tile grids fed by the live weather field:
 *   wetness 0..1 - rain soaks in, dries out by season; soil past the mud
 *                  threshold becomes a slog (movement.getMoveCost) and
 *                  reads as mud in prompts and as a brown tint on screen
 *   snow    0..1 - snowfall accumulates, melts by season (melt water adds
 *                  wetness: thaw IS mud season); deep snow slows walkers
 *                  and whitens the tile
 *
 * Pure sim state with one render hint (getGroundTint); no DOM here.
 */

import { getTile } from '../map/map.js';

let wetnessGrid = null;
let snowGrid = null;
let gridWidth = 0;
let gridHeight = 0;

// Update cadence: full-grid weather sampling is too costly per tick
const UPDATE_EVERY_TICKS = 4;

// Per-update rates (applied every UPDATE_EVERY_TICKS)
const RAIN_SOAK = 0.03;     // wetness gained at rain density 1
const SNOW_FALL = 0.02;     // snow gained at snowfall density 1
const MELT_TO_WET = 0.5;    // fraction of melted snow that becomes wetness

// Season-dependent drying/melting (per update). Winter barely dries and
// barely melts — snow persists; spring thaw is the classic mud season.
const DRY_RATE = { spring: 0.004, summer: 0.009, autumn: 0.003, winter: 0.0015 };
const MELT_RATE = { spring: 0.012, summer: 0.03, autumn: 0.006, winter: 0.0008 };

// Thresholds
export const MUD_THRESHOLD = 0.55;   // Soil wetter than this is mud
export const DEEP_SNOW_THRESHOLD = 0.5;

// Soil that churns to mud. Stone, cave floors, and sand (drains) do not.
const MUDDY_SOIL = new Set([
  'grass', 'tall_grass', 'dirt', 'mud', 'forest_floor', 'river_bank', 'moss',
]);

export function initGroundCover(width, height) {
  gridWidth = width;
  gridHeight = height;
  wetnessGrid = new Float32Array(width * height);
  snowGrid = new Float32Array(width * height);
}

function inGrid(x, y) {
  return wetnessGrid && x >= 0 && x < gridWidth && y >= 0 && y < gridHeight;
}

export function getWetness(x, y) {
  return inGrid(x, y) ? wetnessGrid[y * gridWidth + x] : 0;
}

export function getSnowCover(x, y) {
  return inGrid(x, y) ? snowGrid[y * gridWidth + x] : 0;
}

export function isMuddy(state, x, y) {
  if (getWetness(x, y) < MUD_THRESHOLD) return false;
  const tile = getTile(state.map, x, y);
  return !!tile && MUDDY_SOIL.has(tile.type);
}

/**
 * Advance the grids from the live weather field. Called every tick from
 * world.tick; does real work every UPDATE_EVERY_TICKS.
 */
export function tickGroundCover(state) {
  if (!wetnessGrid || !state?.weather?.getWeatherAt) return;
  if ((state.tick || 0) % UPDATE_EVERY_TICKS !== 0) return;

  const season = state.clock?.season || 'spring';
  const dry = DRY_RATE[season] ?? 0.004;
  const melt = MELT_RATE[season] ?? 0.01;

  for (let y = 0; y < gridHeight; y++) {
    for (let x = 0; x < gridWidth; x++) {
      const i = y * gridWidth + x;
      const wx = state.weather.getWeatherAt(x, y);

      let wet = wetnessGrid[i] + (wx.rain || 0) * RAIN_SOAK;
      let snow = snowGrid[i] + (wx.snow || 0) * SNOW_FALL;

      // Thaw: melted snow soaks the ground
      const melted = Math.min(snow, melt);
      snow -= melted;
      wet += melted * MELT_TO_WET;

      wet -= dry;

      wetnessGrid[i] = wet < 0 ? 0 : wet > 1 ? 1 : wet;
      snowGrid[i] = snow < 0 ? 0 : snow > 1 ? 1 : snow;
    }
  }
}

/**
 * Extra move cost from ground cover (audit WX 7): mud and deep snow are a
 * slog. Returned as an additive penalty; movement.getMoveCost caps the
 * total at the move-budget maximum so no tile becomes impassable.
 */
export function getGroundMovePenalty(state, x, y) {
  if (isMuddy(state, x, y)) return 1;
  if (getSnowCover(x, y) > DEEP_SNOW_THRESHOLD) return 1;
  return 0;
}

/**
 * One sensory line for prompts (audit WX 7), or '' when the ground is dry.
 */
export function describeGround(x, y, state) {
  const snow = getSnowCover(x, y);
  if (snow > DEEP_SNOW_THRESHOLD) return 'Snow lies thick on the ground.';
  if (snow > 0.15) return 'A thin dusting of snow covers the ground.';
  if (isMuddy(state, x, y)) return 'The ground is churned to mud underfoot.';
  if (getWetness(x, y) > 0.3) return 'The ground is damp from recent rain.';
  return '';
}

// --- Render hint ---------------------------------------------------------
// Snow whitens the tile; mud browns it. The renderer blends the returned
// color into the tile bg BEFORE weather compositing so storms still tint
// over snowfields.

const MUD_COLOR = { r: 0x4a, g: 0x36, b: 0x20 };
const SNOW_COLOR = { r: 0xc9, g: 0xd4, b: 0xde };

const tintCache = new Map(); // `${bg}|${kind}|${bucket}` -> '#rrggbb'

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  if (hex.length === 4) {
    // #rgb shorthand
    const r = (n >> 8) & 0xf, g = (n >> 4) & 0xf, b = n & 0xf;
    return { r: r * 17, g: g * 17, b: b * 17 };
  }
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

/**
 * Blend the tile bg toward snow/mud. Returns a hex color, or null when the
 * ground is clean (the common case — keep it cheap).
 * @param {string} bg - Tile background hex color ('#rrggbb' or '#rgb')
 */
export function tintGroundBg(x, y, bg) {
  if (!wetnessGrid || typeof bg !== 'string' || bg[0] !== '#') return null;

  const i = inGrid(x, y) ? y * gridWidth + x : -1;
  if (i < 0) return null;

  const snow = snowGrid[i];
  const wet = wetnessGrid[i];

  let kind = null;
  let strength = 0;
  if (snow > 0.1) {
    kind = 'snow';
    strength = Math.min(0.85, snow);
  } else if (wet > 0.35) {
    kind = 'mud';
    strength = Math.min(0.45, (wet - 0.35) * 0.9);
  }
  if (!kind || strength < 0.05) return null;

  // Bucket strength so the cache stays small and DOM writes stay stable
  const bucket = Math.round(strength * 10);
  const key = `${bg}|${kind}|${bucket}`;
  const cached = tintCache.get(key);
  if (cached) return cached;

  const t = bucket / 10;
  const base = hexToRgb(bg);
  const tint = kind === 'snow' ? SNOW_COLOR : MUD_COLOR;
  const r = Math.round(base.r + (tint.r - base.r) * t);
  const g = Math.round(base.g + (tint.g - base.g) * t);
  const b = Math.round(base.b + (tint.b - base.b) * t);
  const hex = `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`;
  tintCache.set(key, hex);
  return hex;
}
