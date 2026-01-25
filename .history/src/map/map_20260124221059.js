/**
 * Map data structure and operations.
 * Uses a flat array for O(1) coordinate access.
 */

import { TileType, createTile, getTileDef } from './tiles.js';
import { seed, fbm, ridged, warped, noise2D } from './noise.js';
import { getBiome, getTileForBiome, generateRivers, calculateMapClimate } from './biomes.js';
import { generateBiome, initBiomeGenerator } from '../llm/biomeGenerator.js';

/**
 * Creates a new map.
 * @param {number} width - Map width in tiles
 * @param {number} height - Map height in tiles
 * @returns {object} Map object
 */
export function createMap(width, height) {
  const tiles = new Array(width * height);

  // Initialize all as floor
  for (let i = 0; i < tiles.length; i++) {
    tiles[i] = createTile(TileType.FLOOR);
  }

  return {
    width,
    height,
    tiles,
  };
}

/**
 * Converts (x, y) to flat array index.
 * @param {object} map - The map
 * @param {number} x
 * @param {number} y
 * @returns {number} Index
 */
export function toIndex(map, x, y) {
  return x + y * map.width;
}

/**
 * Converts flat index to (x, y).
 * @param {object} map - The map
 * @param {number} idx
 * @returns {{x: number, y: number}}
 */
export function toCoord(map, idx) {
  return {
    x: idx % map.width,
    y: Math.floor(idx / map.width),
  };
}

/**
 * Returns true if (x, y) is within map bounds.
 * @param {object} map
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function inBounds(map, x, y) {
  return x >= 0 && x < map.width && y >= 0 && y < map.height;
}

/**
 * Gets tile at (x, y). Returns null if out of bounds.
 * @param {object} map
 * @param {number} x
 * @param {number} y
 * @returns {object|null}
 */
export function getTile(map, x, y) {
  if (!inBounds(map, x, y)) return null;
  return map.tiles[toIndex(map, x, y)];
}

/**
 * Sets tile at (x, y).
 * @param {object} map
 * @param {number} x
 * @param {number} y
 * @param {object} tile
 */
export function setTile(map, x, y, tile) {
  if (!inBounds(map, x, y)) return;
  map.tiles[toIndex(map, x, y)] = tile;
}

/**
 * Returns true if entity can walk on tile at (x, y).
 * @param {object} map
 * @param {number} x
 * @param {number} y
 * @returns {boolean}
 */
export function isWalkable(map, x, y) {
  const tile = getTile(map, x, y);
  if (!tile) return false;
  return getTileDef(tile).walkable;
}

/**
 * Iterates over all tiles, calling fn(tile, x, y, idx).
 * @param {object} map
 * @param {function} fn
 */
export function forEachTile(map, fn) {
  for (let idx = 0; idx < map.tiles.length; idx++) {
    const { x, y } = toCoord(map, idx);
    fn(map.tiles[idx], x, y, idx);
  }
}

/**
 * Generates a simple bordered map with random food plants.
 * @param {number} width
 * @param {number} height
 * @param {number} foodDensity - Probability [0, 1] of a floor tile being food
 * @returns {object} Map
 */
export function generateSimpleMap(width = 40, height = 20, foodDensity = 0.05) {
  const map = createMap(width, height);

  forEachTile(map, (tile, x, y) => {
    // Border walls
    if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
      setTile(map, x, y, createTile(TileType.WALL));
    }
    // Scatter food plants inside
    else if (Math.random() < foodDensity) {
      setTile(map, x, y, createTile(TileType.FOOD_PLANT));
    }
  });

  return map;
}

// ============================================================
// CELLULAR AUTOMATA CAVE GENERATION
// Based on standard 4-5 rule: born if 5+ neighbors, survive if 4+
// ============================================================

/**
 * Generates a cave map using cellular automata.
 * @param {number} width - Map width
 * @param {number} height - Map height
 * @param {object} options - Generation options
 * @returns {object} Map with cave structure
 */
export function generateCaveMap(width = 80, height = 40, options = {}) {
  const {
    wallProbability = 0.45,   // Initial wall density
    smoothingPasses = 5,       // Number of CA iterations
    birthLimit = 5,            // Neighbors to become wall
    surviveLimit = 4,          // Neighbors to stay wall
    mushroomDensity = 0.02,    // Mushroom spawn rate on cave floor
    waterPools = 2,            // Number of water pools to place
    connectCaves = true,       // Attempt to connect isolated regions
  } = options;

  // Step 1: Create noise map (true = wall, false = floor)
  let cells = initNoise(width, height, wallProbability);

  // Step 2: Apply cellular automata smoothing
  for (let i = 0; i < smoothingPasses; i++) {
    cells = smoothCA(cells, width, height, birthLimit, surviveLimit);
  }

  // Step 3: Ensure border is solid wall
  for (let x = 0; x < width; x++) {
    cells[0 * width + x] = true;
    cells[(height - 1) * width + x] = true;
  }
  for (let y = 0; y < height; y++) {
    cells[y * width + 0] = true;
    cells[y * width + (width - 1)] = true;
  }

  // Step 4: Connect isolated caves (optional)
  if (connectCaves) {
    cells = connectRegions(cells, width, height);
  }

  // Step 5: Convert to tile map
  const map = createMap(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const isWall = cells[y * width + x];

      if (isWall) {
        setTile(map, x, y, createTile(TileType.CAVE_WALL));
      } else {
        // Floor with occasional variation
        if (Math.random() < 0.15) {
          setTile(map, x, y, createTile(TileType.DIRT));
        } else if (Math.random() < mushroomDensity) {
          setTile(map, x, y, createTile(TileType.MUSHROOM));
        } else {
          setTile(map, x, y, createTile(TileType.CAVE_FLOOR));
        }
      }
    }
  }

  // Step 6: Place water pools
  placeWaterPools(map, cells, width, height, waterPools);

  return map;
}

/**
 * Initialize noise grid with random walls.
 */
function initNoise(width, height, probability) {
  const cells = new Array(width * height);
  for (let i = 0; i < cells.length; i++) {
    cells[i] = Math.random() < probability;
  }
  return cells;
}

/**
 * Apply one pass of cellular automata smoothing.
 * 4-5 rule: cell becomes wall if neighbors >= birthLimit
 *           cell stays wall if neighbors >= surviveLimit
 */
function smoothCA(cells, width, height, birthLimit, surviveLimit) {
  const next = new Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const neighbors = countWallNeighbors(cells, width, height, x, y);
      const isWall = cells[idx];

      if (isWall) {
        next[idx] = neighbors >= surviveLimit;
      } else {
        next[idx] = neighbors >= birthLimit;
      }
    }
  }

  return next;
}

/**
 * Count wall neighbors (8-directional).
 * Out-of-bounds counts as wall (encourages solid borders).
 */
function countWallNeighbors(cells, width, height, x, y) {
  let count = 0;

  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;

      const nx = x + dx;
      const ny = y + dy;

      // Out of bounds = wall
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
        count++;
      } else if (cells[ny * width + nx]) {
        count++;
      }
    }
  }

  return count;
}

/**
 * Connect isolated floor regions using flood fill + tunneling.
 */
function connectRegions(cells, width, height) {
  const visited = new Array(width * height).fill(false);
  const regions = [];

  // Find all disconnected floor regions
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (!cells[idx] && !visited[idx]) {
        const region = floodFill(cells, visited, width, height, x, y);
        if (region.length > 0) {
          regions.push(region);
        }
      }
    }
  }

  // Sort regions by size (largest first)
  regions.sort((a, b) => b.length - a.length);

  // Connect smaller regions to the main (largest) region
  if (regions.length > 1) {
    const mainRegion = regions[0];

    for (let i = 1; i < regions.length; i++) {
      const otherRegion = regions[i];

      // Find closest pair of points between regions
      let minDist = Infinity;
      let bestPair = null;

      for (const p1 of mainRegion) {
        for (const p2 of otherRegion) {
          const dist = Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);
          if (dist < minDist) {
            minDist = dist;
            bestPair = [p1, p2];
          }
        }
      }

      // Carve tunnel between them
      if (bestPair) {
        carveTunnel(cells, width, bestPair[0], bestPair[1]);
        // Add connected region to main
        mainRegion.push(...otherRegion);
      }
    }
  }

  return cells;
}

/**
 * Flood fill to find connected floor region.
 */
function floodFill(cells, visited, width, height, startX, startY) {
  const region = [];
  const stack = [{ x: startX, y: startY }];

  while (stack.length > 0) {
    const { x, y } = stack.pop();
    const idx = y * width + x;

    if (x < 0 || x >= width || y < 0 || y >= height) continue;
    if (visited[idx] || cells[idx]) continue;

    visited[idx] = true;
    region.push({ x, y });

    stack.push({ x: x - 1, y });
    stack.push({ x: x + 1, y });
    stack.push({ x, y: y - 1 });
    stack.push({ x, y: y + 1 });
  }

  return region;
}

/**
 * Carve a tunnel between two points (L-shaped).
 */
function carveTunnel(cells, width, from, to) {
  let x = from.x;
  let y = from.y;

  // Horizontal first
  while (x !== to.x) {
    cells[y * width + x] = false;
    x += x < to.x ? 1 : -1;
  }

  // Then vertical
  while (y !== to.y) {
    cells[y * width + x] = false;
    y += y < to.y ? 1 : -1;
  }

  cells[to.y * width + to.x] = false;
}

/**
 * Place water pools in open floor areas.
 */
function placeWaterPools(map, cells, width, height, count) {
  const attempts = count * 20;
  let placed = 0;

  for (let i = 0; i < attempts && placed < count; i++) {
    const x = 3 + Math.floor(Math.random() * (width - 6));
    const y = 3 + Math.floor(Math.random() * (height - 6));

    // Check if area is mostly floor
    let floorCount = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const idx = (y + dy) * width + (x + dx);
        if (!cells[idx]) floorCount++;
      }
    }

    if (floorCount >= 20) {
      // Place pool
      const poolSize = 2 + Math.floor(Math.random() * 2);
      for (let dy = -poolSize; dy <= poolSize; dy++) {
        for (let dx = -poolSize; dx <= poolSize; dx++) {
          const px = x + dx;
          const py = y + dy;
          const dist = Math.abs(dx) + Math.abs(dy);

          if (inBounds(map, px, py) && dist <= poolSize) {
            const idx = py * width + px;
            if (!cells[idx]) {
              if (dist <= poolSize - 1) {
                setTile(map, px, py, createTile(TileType.WATER_DEEP));
              } else {
                setTile(map, px, py, createTile(TileType.WATER_SHALLOW));
              }
            }
          }
        }
      }
      placed++;
    }
  }
}

/**
 * Find a random walkable position on the map.
 * @param {object} map
 * @returns {{x: number, y: number}|null}
 */
export function findWalkablePosition(map) {
  const attempts = 100;

  for (let i = 0; i < attempts; i++) {
    const x = Math.floor(Math.random() * map.width);
    const y = Math.floor(Math.random() * map.height);

    if (isWalkable(map, x, y)) {
      return { x, y };
    }
  }

  return null;
}

// ============================================================
// MULTI-BIOME TERRAIN GENERATION
// Uses noise for elevation/moisture, generates organic landscapes
// ============================================================

/**
 * Generate a multi-biome terrain map with rivers, mountains, forests.
 * @param {number} width
 * @param {number} height
 * @param {object} options
 * @returns {object} Map with varied terrain
 */
export function generateBiomeMap(width = 80, height = 40, options = {}) {
  const {
    mapSeed = Date.now(),
    elevationScale = 0.025,
    moistureScale = 0.03,
    detailScale = 0.15,
    numRivers = 3,
  } = options;

  // Seed the noise generator
  seed(mapSeed);

  const map = createMap(width, height);

  // Generate noise layers
  const elevation = new Float32Array(width * height);
  const moisture = new Float32Array(width * height);
  const detail = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // Elevation: ridged noise for mountains + base terrain
      const baseElev = (fbm(x * elevationScale, y * elevationScale, 4, 2, 0.5) + 1) / 2;
      const ridgeElev = ridged(x * elevationScale * 0.8, y * elevationScale * 0.8, 4);
      elevation[idx] = baseElev * 0.55 + ridgeElev * 0.45;

      // Moisture: warped noise for organic patterns
      moisture[idx] = warped(x + 1000, y + 1000, moistureScale, 3);

      // Detail: high-frequency noise for local variation
      detail[idx] = noise2D(x, y, detailScale);
    }
  }

  // Generate rivers
  const { riverTiles, bankTiles } = generateRivers(elevation, width, height, numRivers);

  // Place tiles based on biome
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const elev = elevation[idx];
      const moist = moisture[idx];
      const det = detail[idx];

      // Rivers override biome
      if (riverTiles.has(idx)) {
        if (elev < 0.3) {
          setTile(map, x, y, createTile(TileType.WATER_DEEP));
        } else {
          setTile(map, x, y, createTile(TileType.RIVER));
        }
        continue;
      }

      // River banks
      if (bankTiles.has(idx)) {
        setTile(map, x, y, createTile(TileType.RIVER_BANK));
        continue;
      }

      // Determine biome and tile
      const biome = getBiome(elev, moist);
      const tileType = getTileForBiome(biome, elev, moist, det);
      setTile(map, x, y, createTile(tileType));
    }
  }

  // Store metadata for food scattering
  map.elevation = elevation;
  map.moisture = moisture;

  return map;
}

/**
 * Generate a mixed cave/surface map (underground with skylights).
 * @param {number} width
 * @param {number} height
 * @param {object} options
 * @returns {object} Map
 */
export function generateMixedMap(width = 80, height = 40, options = {}) {
  const {
    mapSeed = Date.now(),
    caveDensity = 0.52,
    smoothPasses = 5,
    surfaceChance = 0.3,
    numRivers = 2,
  } = options;

  seed(mapSeed);

  const map = createMap(width, height);

  // Generate cave structure
  let caveCells = initNoise(width, height, caveDensity);
  for (let i = 0; i < smoothPasses; i++) {
    caveCells = smoothCA(caveCells, width, height, 5, 4);
  }

  // Generate surface noise to determine where caves open to surface
  const surfaceNoise = new Float32Array(width * height);
  const elevNoise = new Float32Array(width * height);
  const moistNoise = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      surfaceNoise[idx] = (fbm(x * 0.04, y * 0.04, 3) + 1) / 2;
      elevNoise[idx] = (ridged(x * 0.02, y * 0.02, 4) + fbm(x * 0.03, y * 0.03, 4)) / 2;
      moistNoise[idx] = warped(x + 500, y + 500, 0.035, 2);
    }
  }

  // Generate rivers for surface areas
  const { riverTiles, bankTiles } = generateRivers(elevNoise, width, height, numRivers);

  // Place tiles
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const isCaveWall = caveCells[idx];
      const isSurface = surfaceNoise[idx] > (1 - surfaceChance);
      const det = noise2D(x, y, 0.12);

      if (isSurface) {
        // Surface tile - use biome logic
        if (riverTiles.has(idx)) {
          setTile(map, x, y, createTile(TileType.RIVER));
        } else if (bankTiles.has(idx)) {
          setTile(map, x, y, createTile(TileType.RIVER_BANK));
        } else {
          const biome = getBiome(elevNoise[idx], moistNoise[idx]);
          const tileType = getTileForBiome(biome, elevNoise[idx], moistNoise[idx], det);
          setTile(map, x, y, createTile(tileType));
        }
      } else if (isCaveWall) {
        // Underground wall
        if (det > 0.85) {
          setTile(map, x, y, createTile(TileType.ORE_COPPER));
        } else if (det > 0.82) {
          setTile(map, x, y, createTile(TileType.ORE_IRON));
        } else {
          setTile(map, x, y, createTile(TileType.CAVE_WALL));
        }
      } else {
        // Cave floor
        if (det > 0.9) {
          setTile(map, x, y, createTile(TileType.CRYSTAL));
        } else if (det > 0.7) {
          setTile(map, x, y, createTile(TileType.MUSHROOM));
        } else if (det > 0.5) {
          setTile(map, x, y, createTile(TileType.MOSS));
        } else {
          setTile(map, x, y, createTile(TileType.CAVE_FLOOR));
        }
      }
    }
  }

  // Store elevation/moisture for biome generation
  map.elevation = elevNoise;
  map.moisture = moistNoise;

  return map;
}

// ============================================================
// BIOME NAME GENERATION (LLM-powered)
// ============================================================

// Underground biome presets for cave maps
const CAVE_BIOME_PRESETS = [
  { name: 'Fungal Caverns', colorMod: { hue: 280, saturation: 15, brightness: -5 } },
  { name: 'Crystal Depths', colorMod: { hue: 200, saturation: 20, brightness: 5 } },
  { name: 'Ancient Tunnels', colorMod: { hue: 30, saturation: -10, brightness: -10 } },
  { name: 'Glowing Grottos', colorMod: { hue: 160, saturation: 10, brightness: 0 } },
  { name: 'Echoing Chambers', colorMod: { hue: 0, saturation: -15, brightness: -5 } },
  { name: 'Obsidian Depths', colorMod: { hue: 270, saturation: -20, brightness: -15 } },
];

/**
 * Add biome metadata to a map based on its terrain characteristics.
 * Generates an LLM-based biome name and color modifiers.
 * @param {object} map - Map with elevation and moisture arrays
 * @param {object} options - { timeout }
 * @returns {Promise<object>} The map with biome property added
 */
export async function addBiomeToMap(map, options = {}) {
  // For maps without elevation/moisture (pure caves), use underground presets
  if (!map.elevation || !map.moisture) {
    console.log('[Map] No terrain data, using underground biome preset');
    const preset = CAVE_BIOME_PRESETS[Math.floor(Math.random() * CAVE_BIOME_PRESETS.length)];
    map.biome = {
      name: preset.name,
      description: `A deep ${preset.name.toLowerCase()} system.`,
      colorMod: preset.colorMod,
      source: 'cave_preset',
      climate: {
        avgTemperature: 0.3,
        avgMoisture: 0.7,
        avgElevation: 0.2,
      },
      resources: ['minerals', 'gems', 'fungi'],
    };
    console.log(`[Map] Cave biome: "${map.biome.name}"`);
    return map;
  }

  // Calculate climate from terrain
  const climate = calculateMapClimate(map.elevation, map.moisture, map.width, map.height);
  console.log('[Map] Calculated climate:', climate);

  // Generate biome name
  const biome = await generateBiome(climate, options);
  map.biome = biome;

  // Store climate data for context
  map.biome.climate = climate;

  // Infer native resources based on climate
  map.biome.resources = inferBiomeResources(climate);

  console.log(`[Map] Biome: "${biome.name}" (source: ${biome.source})`);

  return map;
}

/**
 * Initialize biome system (check LLM availability).
 * Call this at game startup.
 */
export { initBiomeGenerator };
