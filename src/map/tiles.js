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
    fg: '#4488cc',
    bg: '#112233',
    walkable: false,
    harvestable: false,
    moveCost: Infinity,
  },
  [TileType.WATER_DEEP]: {
    char: '≈',
    fg: '#2266aa',
    bg: '#0a1520',
    walkable: false,
    harvestable: false,
    moveCost: Infinity,
  },
  [TileType.RIVER]: {
    char: '~',
    fg: '#55aadd',
    bg: '#0a2030',
    walkable: false,
    harvestable: false,
    moveCost: Infinity,
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
 * @returns {object} Tile definition
 */
export function getTileDef(tile) {
  return TILE_DEFS[tile.type];
}
