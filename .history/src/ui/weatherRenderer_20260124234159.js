/**
 * Weather Rendering Pipeline
 * Converts weather fields to ASCII visuals with animation
 * 
 * Renders as an overlay layer above terrain
 * Character cycling for animation
 * Color/brightness modulation based on intensity
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
 * Get composite rendering info for a tile
 * Combines terrain tile with weather overlay
 * 
 * @param {number} x, y - Grid coordinates
 * @param {object} terrain - Existing terrain tile
 * @param {number} tick - Current simulation tick
 * @param {object} simulator - Optional weather simulator (if not provided, uses global)
 * @returns {object} { char, fg, bg, animated }
 */
export function composeWeatherTile(x, y, terrain, tick, simulator = null) {
  const sim = simulator || weatherSimulator;
  if (!sim) {
    return { char: terrain.char, fg: terrain.fg, bg: terrain.bg };
  }

  const weather = sim.getRenderingAt(x, y);
  
  // DEBUG: Log for specific positions
  if ((x === 10 || x === 71) && (y === 10 || y === 20) && tick % 60 === 0) {
    console.log(`[WeatherRenderer] Pos(${x},${y}) tick=${tick} weather=`, weather);
  }
  
  // Lower threshold to 0.05 for better visibility
  if (!weather || weather.intensity < 0.05) {
    // No significant weather; return terrain as-is
    return {
      char: terrain.char,
      fg: terrain.fg,
      bg: terrain.bg,
      animated: false,
    };
  }

  // For clouds and other solid weather: only render if substantial enough (3+ grouped)
  if (weather.intensity < 0.3) {
    // Too sparse - don't render
    return {
      char: terrain.char,
      fg: terrain.fg,
      bg: terrain.bg,
      animated: false,
    };
  }

  // Weather overlay: select animated character
  const phase = Math.floor((tick / 4) % weather.chars.length);
  const char = weather.chars[phase];

  // Keep clouds stark white for maximum visibility
  const weatherFg = '#FFFFFF';
  
  // SOLID GREY BACKGROUND for entire tile when weather is present
  const weatherBg = weather.bgColor || '#444444';

  return {
    char,
    fg: weatherFg,
    bg: weatherBg,
    animated: true,
    intensity: weather.intensity,
  };
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
