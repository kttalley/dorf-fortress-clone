/**
 * Tile type definitions.
 * Each type is immutable and describes static properties.
 * Glyphs and colors inspired by rot.js / traditional roguelikes.
 */

export const TileType = Object.freeze({
  // === MOUNTAIN / HIGHLAND ===
  MOUNTAIN_PEAK: 'mountain_peak',
  MOUNTAIN_SLOPE: 'mountain_slope',
  ROCKY_GROUND: 'rocky_ground',
  CLIFF: 'cliff',
  SNOW: 'snow',

  // === CAVE / UNDERGROUND ===
  CAVE_FLOOR: 'cave_floor',
  CAVE_WALL: 'cave_wall',
  STALAGMITE: 'stalagmite',
  CRYSTAL: 'crystal',

  // === FOREST ===
  TREE_CONIFER: 'tree_conifer',
  TREE_DECIDUOUS: 'tree_deciduous',
  DENSE_FOREST: 'dense_forest',
  FOREST_FLOOR: 'forest_floor',
  SHRUB: 'shrub',

  // === GRASSLAND / PLAINS ===
  GRASS: 'grass',
  TALL_GRASS: 'tall_grass',
  DIRT: 'dirt',
  MUD: 'mud',

  // === WATER ===
  WATER_SHALLOW: 'water_shallow',
  WATER_DEEP: 'water_deep',
  RIVER: 'river',
  RIVER_BANK: 'river_bank',
  MARSH: 'marsh',

  // === RESOURCES / FLORA ===
  FOOD_PLANT: 'food_plant',
  MUSHROOM: 'mushroom',
  BERRY_BUSH: 'berry_bush',
  FLOWER: 'flower',
  MOSS: 'moss',

  // === MINERALS (for future) ===
  ORE_COPPER: 'ore_copper',
  ORE_IRON: 'ore_iron',
  GEMSTONE: 'gemstone',

  // === SAND / DESERT ===
  SAND: 'sand',
  DUNE: 'dune',
  CACTUS: 'cactus',

  // === LEGACY ===
  FLOOR: 'floor',
  WALL: 'wall',
});

/**
 * Biome types for noise-based distribution.
 */
export const Biome = Object.freeze({
  MOUNTAIN: 'mountain',
  FOREST: 'forest',
  PLAINS: 'plains',
  MARSH: 'marsh',
  CAVE: 'cave',
  DESERT: 'desert',
});

/**
 * Static tile definitions.
 * - char: ASCII character for rendering
 * - fg: foreground color (CSS)
 * - bg: background color (CSS)
 * - walkable: can entities move through?
 * - harvestable: can this tile yield resources?
 * - moveCost: movement speed modifier (1 = normal, 2 = slow, etc.)
 */
export const TILE_DEFS = Object.freeze({
  // === MOUNTAIN / HIGHLAND ===
  [TileType.MOUNTAIN_PEAK]: {
    char: '▲',
    fg: '#ffffff',
    bg: '#334455',
    walkable: false,
    harvestable: false,
    moveCost: Infinity,
  },
  [TileType.MOUNTAIN_SLOPE]: {
    char: '∧',
    fg: '#aabbcc',
    bg: '#223344',
    walkable: true,
    harvestable: false,
    moveCost: 2,
  },
  [TileType.ROCKY_GROUND]: {
    char: ':',
    fg: '#998877',
    bg: '#1a1815',
    walkable: true,
    harvestable: false,
    moveCost: 1.5,
  },
  [TileType.CLIFF]: {
    char: '█',
    fg: '#665544',
    bg: '#332211',
    walkable: false,
    harvestable: false,
    moveCost: Infinity,
  },
  [TileType.SNOW]: {
    char: '*',
    fg: '#ffffff',
    bg: '#223344',
    walkable: true,
    harvestable: false,
    moveCost: 1.5,
  },

  // === CAVE / UNDERGROUND ===
  [TileType.CAVE_FLOOR]: {
    char: '·',
    fg: '#665544',
    bg: '#1a1410',
    walkable: true,
    harvestable: false,
    moveCost: 1,
  },
  [TileType.CAVE_WALL]: {
    char: '▓',
    fg: '#554433',
    bg: '#221a11',
    walkable: false,
    harvestable: false,
    moveCost: Infinity,
  },
  [TileType.STALAGMITE]: {
    char: '▴',
    fg: '#887766',
    bg: '#1a1410',
    walkable: false,
    harvestable: false,
    moveCost: Infinity,
  },
  [TileType.CRYSTAL]: {
    char: '◆',
    fg: '#88ccff',
    bg: '#1a1410',
    walkable: true,
    harvestable: true,
    moveCost: 1,
  },

  // === FOREST ===
  [TileType.TREE_CONIFER]: {
    char: '♠',
    fg: '#1a5533',
    bg: '#0a1a0f',
    walkable: false,
    harvestable: false,
    moveCost: Infinity,
  },
  [TileType.TREE_DECIDUOUS]: {
    char: '♣',
    fg: '#2d8844',
    bg: '#0a1a0f',
    walkable: false,
    harvestable: false,
    moveCost: Infinity,
  },
  [TileType.DENSE_FOREST]: {
    char: '¥',
    fg: '#1a4422',
    bg: '#050d08',
    walkable: false,
    harvestable: false,
    moveCost: Infinity,
  },
  [TileType.FOREST_FLOOR]: {
    char: '.',
    fg: '#554433',
    bg: '#0a1a0f',
    walkable: true,
    harvestable: false,
    moveCost: 1,
  },
  [TileType.SHRUB]: {
    char: '⌂',
    fg: '#447733',
    bg: '#0a1a0f',
    walkable: true,
    harvestable: false,
    moveCost: 1.2,
  },

  // === GRASSLAND / PLAINS ===
  [TileType.GRASS]: {
    char: ',',
    fg: '#3d7c47',
    bg: '#0f1a10',
    walkable: true,
    harvestable: false,
    moveCost: 1,
  },
  [TileType.TALL_GRASS]: {
    char: ';',
    fg: '#4a9955',
    bg: '#0f1a10',
    walkable: true,
    harvestable: false,
    moveCost: 1.2,
  },
  [TileType.DIRT]: {
    char: '░',
    fg: '#8b7355',
    bg: '#1a1410',
    walkable: true,
    harvestable: false,
    moveCost: 1,
  },
  [TileType.MUD]: {
    char: '░',
    fg: '#5a4a35',
    bg: '#221a11',
    walkable: true,
    harvestable: false,
    moveCost: 2,
  },

  // === WATER ===
  [TileType.WATER_SHALLOW]: {
    char: '~',
    chars: ['~', '≈', '~', 'ˉ'],  // Animated rippling frames
    fg: '#4488cc',
    bg: '#112233',
    walkable: false,
    harvestable: false,
    moveCost: Infinity,
    animated: true,
  },
  [TileType.WATER_DEEP]: {
    char: '≈',
    chars: ['≈', '~', '≈', '⋮'],  // Animated flowing frames
    fg: '#2266aa',
    bg: '#0a1520',
    walkable: false,
    harvestable: false,
    moveCost: Infinity,
    animated: true,
  },
  [TileType.RIVER]: {
    char: '~',
    chars: ['~', '≈', '~', 'ˉ'],  // Animated flowing frames
    fg: '#55aadd',
    bg: '#0a2030',
    walkable: false,
    harvestable: false,
    moveCost: Infinity,
    animated: true,
  },
  [TileType.RIVER_BANK]: {
    char: '.',
    fg: '#6b5b4a',
    bg: '#1a2520',
    walkable: true,
    harvestable: false,
    moveCost: 1.3,
  },
  [TileType.MARSH]: {
    char: '"',
    fg: '#557755',
    bg: '#1a2a1a',
    walkable: true,
    harvestable: false,
    moveCost: 2,
  },

  // === RESOURCES / FLORA ===
  [TileType.FOOD_PLANT]: {
    char: '"',
    fg: '#44aa44',
    bg: '#0f1a10',
    walkable: true,
    harvestable: true,
    moveCost: 1,
  },
  [TileType.MUSHROOM]: {
    char: '♦',
    fg: '#cc88aa',
    bg: '#1a1410',
    walkable: true,
    harvestable: true,
    moveCost: 1,
  },
  [TileType.BERRY_BUSH]: {
    char: '♥',
    fg: '#cc4466',
    bg: '#0f1a10',
    walkable: true,
    harvestable: true,
    moveCost: 1.2,
  },
  [TileType.FLOWER]: {
    char: '*',
    fg: '#ffcc44',
    bg: '#0f1a10',
    walkable: true,
    harvestable: false,
    moveCost: 1,
  },
  [TileType.MOSS]: {
    char: '`',
    fg: '#447755',
    bg: '#1a1410',
    walkable: true,
    harvestable: false,
    moveCost: 1,
  },

  // === MINERALS ===
  [TileType.ORE_COPPER]: {
    char: 'o',
    fg: '#cc8844',
    bg: '#221a11',
    walkable: false,
    harvestable: true,
    moveCost: Infinity,
  },
  [TileType.ORE_IRON]: {
    char: 'o',
    fg: '#8899aa',
    bg: '#221a11',
    walkable: false,
    harvestable: true,
    moveCost: Infinity,
  },
  [TileType.GEMSTONE]: {
    char: '◊',
    fg: '#ff66aa',
    bg: '#221a11',
    walkable: false,
    harvestable: true,
    moveCost: Infinity,
  },

  // === SAND / DESERT ===
  [TileType.SAND]: {
    char: '.',
    fg: '#ddcc88',
    bg: '#2a2510',
    walkable: true,
    harvestable: false,
    moveCost: 1.3,
  },
  [TileType.DUNE]: {
    char: '∿',
    fg: '#ccbb77',
    bg: '#2a2510',
    walkable: true,
    harvestable: false,
    moveCost: 1.8,
  },
  [TileType.CACTUS]: {
    char: '↑',
    fg: '#55aa55',
    bg: '#2a2510',
    walkable: false,
    harvestable: true,
    moveCost: Infinity,
  },

  // === LEGACY (backwards compat) ===
  [TileType.FLOOR]: {
    char: '.',
    fg: '#555555',
    bg: '#111111',
    walkable: true,
    harvestable: false,
    moveCost: 1,
  },
  [TileType.WALL]: {
    char: '#',
    fg: '#888888',
    bg: '#222222',
    walkable: false,
    harvestable: false,
    moveCost: Infinity,
  },
});

/**
 * Creates a tile instance with mutable state.
 * @param {string} type - One of TileType values
 * @returns {object} Tile instance
 */
export function createTile(type) {
  const def = TILE_DEFS[type];
  if (!def) {
    throw new Error(`Unknown tile type: ${type}`);
  }
  return {
    type,
    resourceAmount: def.harvestable ? 1 : 0,
  };
}

/**
 * Returns the static definition for a tile instance.
 * @param {object} tile - Tile instance
 * @param {object} biomeColorMod - Optional biome color modifiers
 * @returns {object} Tile definition
 */
export function getTileDef(tile, biomeColorMod = null) {
  // If tile already has definition properties (from construction), use it directly
  if (tile && typeof tile.walkable === 'boolean') {
    return tile;
  }

  // Look up in standard definitions
  const def = TILE_DEFS[tile?.type];
  if (def) {
    // Apply biome color modifiers if provided
    if (biomeColorMod) {
      return {
        ...def,
        fg: shiftColor(def.fg, biomeColorMod),
        bg: shiftColor(def.bg, biomeColorMod),
      };
    }
    return def;
  }

  // Fallback for unknown types
  return {
    char: '?',
    fg: '#ff00ff',
    bg: '#000000',
    walkable: false,
    harvestable: false,
    moveCost: Infinity,
  };
}

// ============================================================
// COLOR MANIPULATION UTILITIES
// ============================================================

/**
 * Convert hex color to HSL
 * @param {string} hex - CSS hex color (e.g., '#ff0000')
 * @returns {object} { h, s, l } where h is 0-360, s and l are 0-100
 */
function hexToHSL(hex) {
  // Remove # if present
  hex = hex.replace(/^#/, '');

  // Parse hex
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h, s;
  const l = (max + min) / 2;

  if (max === min) {
    h = s = 0; // achromatic
  } else {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/**
 * Convert HSL to hex color
 * @param {number} h - Hue (0-360)
 * @param {number} s - Saturation (0-100)
 * @param {number} l - Lightness (0-100)
 * @returns {string} CSS hex color
 */
function hslToHex(h, s, l) {
  h = h / 360;
  s = s / 100;
  l = l / 100;

  let r, g, b;

  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }

  const toHex = x => {
    const hex = Math.round(x * 255).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Apply color modifiers to a hex color
 * @param {string} hex - Original hex color
 * @param {object} mod - { hue, saturation, brightness } adjustments (-30 to +30)
 * @returns {string} Modified hex color
 */
export function shiftColor(hex, mod) {
  if (!hex || !mod) return hex;

  const hsl = hexToHSL(hex);

  // Apply modifications
  let newH = (hsl.h + (mod.hue || 0) + 360) % 360;
  let newS = Math.max(0, Math.min(100, hsl.s + (mod.saturation || 0)));
  let newL = Math.max(0, Math.min(100, hsl.l + (mod.brightness || 0)));

  return hslToHex(newH, newS, newL);
}

/**
 * Create a modified tile definitions object with biome color shifts
 * @param {object} colorMod - { hue, saturation, brightness }
 * @returns {object} New TILE_DEFS-like object with modified colors
 */
export function createBiomeTileDefs(colorMod) {
  const modified = {};

  for (const [type, def] of Object.entries(TILE_DEFS)) {
    modified[type] = {
      ...def,
      fg: shiftColor(def.fg, colorMod),
      bg: shiftColor(def.bg, colorMod),
    };
  }

  return modified;
}
