/**
 * Weather Rendering Pipeline
 * Converts weather fields to ASCII visuals with animation
 *
 * Renders as a TRANSLUCENT atmosphere above terrain: the terrain glyph,
 * color and background always stay legible. Weather only tints them —
 * opacity is capped low and modulated per-tile by a drifting value-noise
 * "marble" field, so cloud masses read as oil-on-water patterns with soft
 * dissipating edges instead of solid tile blankets. Weather glyphs (rain
 * streaks, snowflakes, fog wisps) appear only on a sparse stochastic
 * subset of cells with Brownian time-jitter, never as a wall of symbols.
 */

// ============================================================
// WEATHER TILE COMPOSER
// ============================================================

let weatherSimulator = null;
let animationPhase = 0;

/**
 * Initialize weather rendering
 */
export function initWeatherRendering(simulator) {
  weatherSimulator = simulator;
  animationPhase = 0;
}

/**
 * Per-type animation period: ticks per frame. Rain streaks fast,
 * cloud masses billow slowly.
 */
const WEATHER_ANIM_PERIOD = {
  rain: 2,
  sandstorm: 2,
  smoke: 4,
  snow: 5,
  spores: 6,
  mist: 7,
  fog: 8,
  miasma: 8,
  clouds: 10,
};

// ---- Translucency tuning ---------------------------------------------
// Hard ceiling on how much the weather tint may displace the terrain bg.
// Even a storm core keeps ~2/3 of the terrain background color.
const MAX_BG_OPACITY = 0.34;
// Ceiling on terrain-glyph color tinting; the glyph always dominates.
const MAX_FG_TINT = 0.22;
// How strongly the weather glyph (when it appears) leans into the weather
// color vs the terrain fg underneath it.
const GLYPH_FG_BLEND = 0.62;
// Ticks per marble-drift step. Quantized so the tint doesn't force a DOM
// write on every weather cell every tick.
const MARBLE_STEP = 4;

// Max fraction of cells inside a full-intensity mass that show a weather
// glyph at any instant. Precipitation reads denser than vapor; clouds are
// almost pure tint.
const GLYPH_DENSITY = {
  rain: 0.34,
  snow: 0.30,
  sandstorm: 0.32,
  smoke: 0.20,
  spores: 0.18,
  miasma: 0.18,
  mist: 0.14,
  fog: 0.14,
  clouds: 0.07,
};

// ---- Organic noise (marbling + Brownian flicker) ----------------------

/** Deterministic integer hash -> [0, 1). Math.imul keeps 32-bit exactness. */
function hash2(x, y) {
  let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}

/** Smoothly interpolated 2D value noise -> [0, 1]. */
function valueNoise(x, y) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi);
  const b = hash2(xi + 1, yi);
  const c = hash2(xi, yi + 1);
  const d = hash2(xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

/**
 * Two-octave drifting marble field -> [0, 1].
 * The octaves scroll in different directions over time, so the tint
 * swirls and breaks apart like smoke/oil instead of pulsing in place.
 */
function marble(x, y, t) {
  const n1 = valueNoise(x * 0.42 + t * 0.06, y * 0.42 - t * 0.045);
  const n2 = valueNoise(x * 0.13 - t * 0.025, y * 0.13 + t * 0.033);
  return n1 * 0.6 + n2 * 0.4;
}

function smoothstep(edge0, edge1, x) {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Get composite rendering info for a tile.
 *
 * Compositing model:
 * - The terrain glyph/fg/bg are ALWAYS the base layer. Weather never
 *   blanks them out.
 * - Background: blended toward the weather tint by
 *   opacity = MAX_BG_OPACITY * edgeEnvelope(intensity) * marble(x, y, t),
 *   so masses are translucent, marbled cell-to-cell, and dissipate
 *   smoothly at front edges (no hard cutoff).
 * - Terrain glyph color: nudged toward the weather color by a small
 *   fraction of the same opacity, keeping the glyph fully legible.
 * - Weather glyphs: drawn only on a sparse stochastic subset of cells
 *   (per-tile hash re-rolled every animation step = Brownian flicker),
 *   denser where the local marbled intensity is high, and never over
 *   entities.
 *
 * @param {number} x, y - Grid coordinates
 * @param {object} terrain - Existing composed tile { char, fg, bg }
 * @param {number} tick - Current simulation tick
 * @param {object} simulator - Optional weather simulator (if not provided, uses global)
 * @param {boolean} hasEntity - True when an entity glyph occupies this tile
 * @returns {object} { char, fg, bg, animated, intensity }
 */
export function composeWeatherTile(x, y, terrain, tick, simulator = null, hasEntity = false) {
  const sim = simulator || weatherSimulator;
  if (!sim) {
    return { char: terrain.char, fg: terrain.fg, bg: terrain.bg, animated: false };
  }

  const weather = sim.getRenderingAt(x, y);

  if (!weather || weather.intensity < 0.04) {
    // No significant weather; return terrain as-is
    return {
      char: terrain.char,
      fg: terrain.fg,
      bg: terrain.bg,
      animated: false,
    };
  }

  const intensity = Math.min(1, weather.intensity);

  // Soft dissipation envelope across the front edge: opacity ramps in
  // gradually from the first wisp instead of gating at a threshold.
  const edge = smoothstep(0.04, 0.6, intensity);

  // Marbled local density: each cell sits at a different point of a
  // slowly drifting noise field, so the tint varies like oil on water.
  const tQ = Math.floor(tick / MARBLE_STEP);
  const m = marble(x, y, tQ);
  const local = 0.25 + 0.75 * m;

  const opacity = MAX_BG_OPACITY * edge * local;
  if (opacity < 0.02) {
    return { char: terrain.char, fg: terrain.fg, bg: terrain.bg, animated: false, intensity };
  }

  // Translucent atmosphere: terrain bg always dominates the blend.
  const bg = blendColors(weather.bgColor || '#444444', terrain.bg, opacity);

  // Entities are never occluded and never re-tinted: bg wash only.
  if (hasEntity) {
    return { char: terrain.char, fg: terrain.fg, bg, animated: true, intensity };
  }

  // Terrain glyph keeps its identity, lightly hazed toward the weather.
  let fg = blendColors(weather.color || '#FFFFFF', terrain.fg, Math.min(MAX_FG_TINT, opacity * 0.8));
  let char = terrain.char;
  let animated = false;

  // Sparse weather glyphs with Brownian flicker: a per-tile coin re-rolled
  // each animation step decides whether this cell briefly carries a rain
  // streak / snowflake / wisp. Probability scales with the locally marbled
  // intensity, so glyphs cluster in dense cores and thin out at edges.
  const period = WEATHER_ANIM_PERIOD[weather.type] || 4;
  const slot = Math.floor(tick / period);
  const density = GLYPH_DENSITY[weather.type] ?? 0.15;
  const glyphChance = density * smoothstep(0.15, 1, intensity * local);

  if (hash2(x * 31 + slot * 7, y * 17 - slot * 13) < glyphChance) {
    const jitter = (x * 7 + y * 13) % weather.chars.length;
    char = weather.chars[(slot + jitter) % weather.chars.length];
    // The glyph itself reads in the weather color but stays anchored to
    // the terrain palette underneath.
    fg = blendColors(weather.color || '#FFFFFF', terrain.fg, GLYPH_FG_BLEND);
    animated = true;
  }

  return { char, fg, bg, animated, intensity };
}

/**
 * Simple color blending (hex strings)
 */
function blendColors(color1, color2, t) {
  // Parse hex
  const c1 = hexToRgb(color1);
  const c2 = hexToRgb(color2);

  if (!c1 || !c2) return color1;

  // Interpolate
  const r = Math.round(c1.r * t + c2.r * (1 - t));
  const g = Math.round(c1.g * t + c2.g * (1 - t));
  const b = Math.round(c1.b * t + c2.b * (1 - t));

  return rgbToHex(r, g, b);
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16),
  } : null;
}

function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(x => x.toString(16).padStart(2, '0')).join('');
}

/**
 * Brighten a hex color by blending towards white
 * @param {string} hex - Color in hex format
 * @param {number} amount - Brightness amount (0-1, higher = brighter)
 * @returns {string} Brightened hex color
 */
function brightenHexColor(hex, amount) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  
  // Blend towards white (#FFFFFF) by the specified amount
  const r = Math.round(rgb.r + (255 - rgb.r) * amount);
  const g = Math.round(rgb.g + (255 - rgb.g) * amount);
  const b = Math.round(rgb.b + (255 - rgb.b) * amount);
  
  return rgbToHex(r, g, b);
}

/**
 * Update animation frame (called each render tick)
 */
export function updateWeatherAnimation(tick) {
  animationPhase = tick;
}

// ============================================================
// WEATHER EFFECT LAYERS
// ============================================================

/**
 * Create a weather effect visualization for a region
 * Used for debugging or special effects
 */
export function getWeatherDebugOverlay(simulator, x, y, width, height) {
  const overlay = [];

  for (let ty = y; ty < y + height; ty++) {
    const row = [];
    for (let tx = x; tx < x + width; tx++) {
      const weather = simulator.getRenderingAt(tx, ty);
      if (weather) {
        row.push({
          char: weather.char,
          intensity: weather.intensity.toFixed(2),
          type: weather.type,
        });
      } else {
        row.push({ char: ' ', intensity: '0.00', type: 'none' });
      }
    }
    overlay.push(row);
  }

  return overlay;
}

// ============================================================
// PERFORMANCE: WEATHER CULLING
// ============================================================

/**
 * Cull weather rendering based on viewport
 * Only render weather for visible tiles
 */
export function cullWeatherToViewport(simulator, viewportX, viewportY, viewportWidth, viewportHeight) {
  const rendered = [];

  for (let y = viewportY; y < viewportY + viewportHeight; y++) {
    for (let x = viewportX; x < viewportX + viewportWidth; x++) {
      const weather = simulator.getRenderingAt(x, y);
      if (weather && weather.intensity > 0.15) {
        rendered.push({ x, y, weather });
      }
    }
  }

  return rendered;
}

// ============================================================
// ASCII ANIMATION FRAMES
// ============================================================

/**
 * Predefined animation cycles for weather
 * Each type has 4-6 frames for smooth movement
 */
export const WEATHER_ANIMATIONS = {
  rain: {
    frames: ['|', '/', '\\', '|'],
    speed: 2, // ms per frame
    description: 'Falling rain with directional tilt',
  },
  snow: {
    frames: ['*', '.', '*', '*'],
    speed: 3,
    description: 'Gentle snowfall',
  },
  fog: {
    frames: ['~', '≈', '~', '·'],
    speed: 2,
    description: 'Swirling fog',
  },
  clouds: {
    frames: ['^', 'v', '^', 'v'],
    speed: 1,
    description: 'Slow-moving clouds',
  },
  mist: {
    frames: ['≈', '~', '≈', '.'],
    speed: 2,
    description: 'Undulating mist',
  },
  miasma: {
    frames: ['☁', '≈', '~', '≈'],
    speed: 2,
    description: 'Roiling miasma',
  },
  smoke: {
    frames: ['∿', '~', '≈', '·'],
    speed: 2,
    description: 'Billowing smoke',
  },
  spores: {
    frames: ['·', '°', '·', '°'],
    speed: 3,
    description: 'Drifting spores',
  },
};

/**
 * Get frame for a weather animation at a given time
 */
export function getWeatherFrame(weatherType, tick) {
  const anim = WEATHER_ANIMATIONS[weatherType];
  if (!anim) return ' ';

  const frameCount = anim.frames.length;
  const frameIndex = Math.floor((tick / anim.speed) % frameCount);

  return anim.frames[frameIndex];
}

// ============================================================
// VISUAL EFFECTS LIBRARY
// ============================================================

/**
 * Generate ASCII art for weather phenomena
 * Used for UI overlays or special scenes
 */
export function generateWeatherArt(type, width = 20, height = 10) {
  const art = {
    rain: () => {
      const lines = [];
      for (let i = 0; i < height; i++) {
        let line = '';
        for (let j = 0; j < width; j++) {
          line += Math.random() > 0.3 ? '|' : ' ';
        }
        lines.push(line);
      }
      return lines.join('\n');
    },
    
    snow: () => {
      const lines = [];
      for (let i = 0; i < height; i++) {
        let line = '';
        for (let j = 0; j < width; j++) {
          const r = Math.random();
          line += r > 0.8 ? '*' : r > 0.5 ? '.' : ' ';
        }
        lines.push(line);
      }
      return lines.join('\n');
    },
    
    fog: () => {
      const lines = [];
      for (let i = 0; i < height; i++) {
        let line = '';
        for (let j = 0; j < width; j++) {
          const r = Math.random();
          line += r > 0.6 ? '~' : r > 0.3 ? '≈' : ' ';
        }
        lines.push(line);
      }
      return lines.join('\n');
    },

    miasma: () => {
      const lines = [];
      for (let i = 0; i < height; i++) {
        let line = '';
        for (let j = 0; j < width; j++) {
          const r = Math.random();
          line += r > 0.5 ? '☁' : r > 0.2 ? '≈' : ' ';
        }
        lines.push(line);
      }
      return lines.join('\n');
    },
  };

  const generator = art[type];
  return generator ? generator() : '';
}

// ============================================================
// CSS FOR WEATHER RENDERING
// ============================================================

/**
 * Inject CSS for weather animations
 */
export function injectWeatherStyles() {
  const style = document.createElement('style');
  style.textContent = `
    /* Weather overlay layer */
    .weather-overlay {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      pointer-events: none;
      mix-blend-mode: lighten;
      opacity: 0.8;
    }

    /* Animated weather cells */
    .weather-tile {
      animation: weather-pulse 0.3s ease-in-out infinite;
    }

    @keyframes weather-pulse {
      0%, 100% { opacity: 0.8; }
      50% { opacity: 0.95; }
    }

    /* Weather-specific effects */
    .weather-rain {
      animation: weather-fall 0.5s linear infinite;
    }

    @keyframes weather-fall {
      0% { transform: translateY(-1px); }
      100% { transform: translateY(1px); }
    }

    .weather-snow {
      animation: weather-drift 2s ease-in-out infinite;
    }

    @keyframes weather-drift {
      0% { transform: translateX(-1px); }
      50% { transform: translateX(1px); }
      100% { transform: translateX(-1px); }
    }

    .weather-miasma {
      animation: weather-roil 1s ease-in-out infinite;
    }

    @keyframes weather-roil {
      0%, 100% { opacity: 0.6; }
      50% { opacity: 0.95; }
    }

    /* Intensity-based brightness */
    .weather-intense {
      filter: brightness(1.2);
    }

    .weather-mild {
      filter: brightness(0.95);
    }
  `;

  document.head.appendChild(style);
}

// ============================================================
// DEBUG UTILITIES
// ============================================================

/**
 * Render weather field to canvas for visualization
 */
export function visualizeWeatherField(simulator, weatherType, canvasElement) {
  if (!canvasElement) return;

  const ctx = canvasElement.getContext('2d');
  const field = simulator.getFieldData(weatherType);
  
  if (!field) {
    ctx.fillStyle = '#333';
    ctx.fillRect(0, 0, canvasElement.width, canvasElement.height);
    return;
  }

  const imageData = ctx.createImageData(simulator.width, simulator.height);
  const data = imageData.data;

  for (let i = 0; i < field.length; i++) {
    const intensity = field[i];
    const brightness = Math.round(intensity * 255);

    data[i * 4 + 0] = brightness;     // R
    data[i * 4 + 1] = brightness / 2; // G
    data[i * 4 + 2] = brightness / 3; // B
    data[i * 4 + 3] = 255;             // A
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Export weather field as text for debugging
 */
export function exportWeatherFieldAsText(simulator, weatherType, threshold = 0.3) {
  const field = simulator.getFieldData(weatherType);
  if (!field) return '';

  let text = '';
  for (let y = 0; y < simulator.height; y++) {
    for (let x = 0; x < simulator.width; x++) {
      const idx = y * simulator.width + x;
      const intensity = field[idx];

      if (intensity > threshold) {
        const char = intensity > 0.7 ? '#' : intensity > 0.4 ? '·' : '·';
        text += char;
      } else {
        text += ' ';
      }
    }
    text += '\n';
  }
  return text;
}
