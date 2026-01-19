/**
 * Biome and terrain generation
 * Uses noise for elevation, moisture, temperature to determine biomes
 * Generates rivers, caves, and organic features
 */

import { seed, simplex2, fbm, ridged, noise2D } from './noise.js';
import { TileType, Biome, createTile } from './tiles.js';

/**
 * Generate elevation map using ridged noise for mountains
 * @param {number} width
 * @param {number} height
 * @param {number} scale
 * @returns {Float32Array}
 */
export function generateElevation(width, height, scale = 0.03) {
  const elevation = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;

      // Base terrain with fbm
      const base = fbm(x * scale, y * scale, 4, 2, 0.5);

      // Ridged noise for mountain ranges
      const mountains = ridged(x * scale * 0.7, y * scale * 0.7, 3);

      // Combine: mostly base terrain with mountain highlights
      elevation[idx] = base * 0.6 + mountains * 0.4;
    }
  }

  return elevation;
}

/**
 * Generate moisture map
 * @param {number} width
 * @param {number} height
 * @param {number} scale
 * @returns {Float32Array}
 */
export function generateMoisture(width, height, scale = 0.04) {
  const moisture = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      // Offset noise domain for variety
      moisture[idx] = (fbm(x * scale + 500, y * scale + 500, 3, 2, 0.6) + 1) / 2;
    }
  }

  return moisture;
}

/**
 * Determine biome based on elevation and moisture
 * @param {number} elevation - 0-1
 * @param {number} moisture - 0-1
 * @returns {string} Biome type
 */
export function getBiome(elevation, moisture) {
  // High elevation = mountains
  if (elevation > 0.75) return Biome.MOUNTAIN;

  // Low elevation + high moisture = marsh/water
  if (elevation < 0.3 && moisture > 0.6) return Biome.MARSH;

  // Mid-high elevation + various moisture = forest
  if (elevation > 0.4 && elevation < 0.75 && moisture > 0.4) return Biome.FOREST;

  // Low moisture = desert-ish plains
  if (moisture < 0.3) return Biome.DESERT;

  // Default = plains
  return Biome.PLAINS;
}

/**
 * Get tile type for a biome based on local variation
 * @param {string} biome
 * @param {number} elevation
 * @param {number} moisture
 * @param {number} detail - Small-scale noise for variation
 * @returns {string} TileType
 */
export function getTileForBiome(biome, elevation, moisture, detail) {
  switch (biome) {
    case Biome.MOUNTAIN:
      if (elevation > 0.85) return TileType.MOUNTAIN_PEAK;
      if (elevation > 0.78) return TileType.SNOW;
      if (detail > 0.7) return TileType.CLIFF;
      if (detail > 0.4) return TileType.ROCKY_GROUND;
      return TileType.MOUNTAIN_SLOPE;

    case Biome.FOREST:
      if (detail > 0.8) return TileType.DENSE_FOREST;
      if (detail > 0.6) return TileType.TREE_CONIFER;
      if (detail > 0.45) return TileType.TREE_DECIDUOUS;
      if (detail > 0.3) return TileType.SHRUB;
      if (detail > 0.15) return TileType.BERRY_BUSH;
      return TileType.FOREST_FLOOR;

    case Biome.PLAINS:
      if (detail > 0.85) return TileType.FLOWER;
      if (detail > 0.7) return TileType.TALL_GRASS;
      if (detail > 0.2) return TileType.GRASS;
      return TileType.DIRT;

    case Biome.MARSH:
      if (detail > 0.8) return TileType.WATER_SHALLOW;
      if (detail > 0.5) return TileType.MARSH;
      if (detail > 0.3) return TileType.MUD;
      return TileType.TALL_GRASS;

    case Biome.DESERT:
      if (detail > 0.9) return TileType.CACTUS;
      if (detail > 0.6) return TileType.DUNE;
      return TileType.SAND;

    case Biome.CAVE:
      if (detail > 0.85) return TileType.CRYSTAL;
      if (detail > 0.7) return TileType.STALAGMITE;
      if (detail > 0.15) return TileType.MUSHROOM;
      return TileType.CAVE_FLOOR;

    default:
      return TileType.GRASS;
  }
}

/**
 * Generate river paths using gradient descent
 * @param {Float32Array} elevation
 * @param {number} width
 * @param {number} height
 * @param {number} numRivers
 * @returns {Set<number>} Set of indices that are river tiles
 */
export function generateRivers(elevation, width, height, numRivers = 3) {
  const riverTiles = new Set();
  const bankTiles = new Set();

  for (let r = 0; r < numRivers; r++) {
    // Start river from high elevation
    let startX, startY, startElev;
    let attempts = 0;

    do {
      startX = Math.floor(Math.random() * width);
      startY = Math.floor(Math.random() * height);
      startElev = elevation[startY * width + startX];
      attempts++;
    } while (startElev < 0.6 && attempts < 100);

    if (attempts >= 100) continue;

    // Flow downhill
    let x = startX;
    let y = startY;
    let prevX = x;
    let prevY = y;
    const maxSteps = width + height;

    for (let step = 0; step < maxSteps; step++) {
      const idx = y * width + x;
      riverTiles.add(idx);

      // Add banks
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const bx = x + dx;
          const by = y + dy;
          if (bx >= 0 && bx < width && by >= 0 && by < height) {
            const bidx = by * width + bx;
            if (!riverTiles.has(bidx)) {
              bankTiles.add(bidx);
            }
          }
        }
      }

      // Find lowest neighbor
      let lowestElev = elevation[idx];
      let lowestX = x;
      let lowestY = y;

      const neighbors = [
        { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
        { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
        { dx: -1, dy: -1 }, { dx: 1, dy: -1 },
        { dx: -1, dy: 1 }, { dx: 1, dy: 1 }
      ];

      for (const { dx, dy } of neighbors) {
        const nx = x + dx;
        const ny = y + dy;

        // Avoid going back
        if (nx === prevX && ny === prevY) continue;

        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nidx = ny * width + nx;
          // Add randomness to prevent straight lines
          const nElev = elevation[nidx] + (Math.random() - 0.5) * 0.05;
          if (nElev < lowestElev) {
            lowestElev = nElev;
            lowestX = nx;
            lowestY = ny;
          }
        }
      }

      // If no lower neighbor found (local minimum), end river
      if (lowestX === x && lowestY === y) {
        // Create a small pool
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            const px = x + dx;
            const py = y + dy;
            if (px >= 0 && px < width && py >= 0 && py < height) {
              riverTiles.add(py * width + px);
            }
          }
        }
        break;
      }

      prevX = x;
      prevY = y;
      x = lowestX;
      y = lowestY;

      // End if we hit the edge
      if (x <= 0 || x >= width - 1 || y <= 0 || y >= height - 1) break;
    }
  }

  return { riverTiles, bankTiles };
}

/**
 * Generate cave overlay using cellular automata
 * @param {number} width
 * @param {number} height
 * @param {object} options
 * @returns {Set<number>} Indices that should be cave tiles
 */
export function generateCaves(width, height, options = {}) {
  const {
    density = 0.48,
    smoothPasses = 5,
    birthLimit = 4,
    deathLimit = 3
  } = options;

  // Initialize with random fill
  let grid = new Uint8Array(width * height);
  for (let i = 0; i < grid.length; i++) {
    grid[i] = Math.random() < density ? 1 : 0;
  }

  // Cellular automata smoothing
  for (let pass = 0; pass < smoothPasses; pass++) {
    const newGrid = new Uint8Array(width * height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;

        // Count neighbors
        let neighbors = 0;
        for (let dy = -1; dy <= 1; dy++) {
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
              neighbors++; // Treat edges as walls
            } else {
              neighbors += grid[ny * width + nx];
            }
          }
        }

        if (grid[idx] === 1) {
          newGrid[idx] = neighbors >= deathLimit ? 1 : 0;
        } else {
          newGrid[idx] = neighbors > birthLimit ? 1 : 0;
        }
      }
    }

    grid = newGrid;
  }

  // Collect cave floor indices (0s in grid)
  const caveFloors = new Set();
  const caveWalls = new Set();

  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 0) {
      caveFloors.add(i);
    } else {
      caveWalls.add(i);
    }
  }

  return { caveFloors, caveWalls };
}

/**
 * Scatter food sources based on biome
 * @param {Array} tiles - Map tiles
 * @param {number} width
 * @param {number} height
 * @param {number} density - Food placement probability
 * @returns {Array} Food source positions
 */
export function scatterFood(tiles, width, height, density = 0.02) {
  const foodPositions = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const tile = tiles[y * width + x];

      // Only place food on walkable tiles
      if (!tile || tile.type === TileType.WATER_DEEP ||
          tile.type === TileType.RIVER || tile.type === TileType.MOUNTAIN_PEAK) {
        continue;
      }

      // Higher chance near berry bushes and mushrooms
      let localDensity = density;
      if (tile.type === TileType.BERRY_BUSH) localDensity *= 3;
      if (tile.type === TileType.MUSHROOM) localDensity *= 2;
      if (tile.type === TileType.FOREST_FLOOR) localDensity *= 1.5;

      if (Math.random() < localDensity) {
        foodPositions.push({ x, y, amount: 3 + Math.floor(Math.random() * 8) });
      }
    }
  }

  return foodPositions;
}

/**
 * Calculate overall climate characteristics for a map
 * Used for LLM-based biome name generation
 * @param {Float32Array} elevation - Elevation values (0-1)
 * @param {Float32Array} moisture - Moisture values (0-1)
 * @param {number} width - Map width
 * @param {number} height - Map height
 * @returns {object} { avgElevation, avgMoisture, avgTemperature }
 */
export function calculateMapClimate(elevation, moisture, width, height) {
  const size = width * height;
  let totalElevation = 0;
  let totalMoisture = 0;

  for (let i = 0; i < size; i++) {
    totalElevation += elevation[i];
    totalMoisture += moisture[i];
  }

  const avgElevation = totalElevation / size;
  const avgMoisture = totalMoisture / size;

  // Temperature is inversely related to elevation (higher = colder)
  // Also add some variation based on moisture (wet = slightly cooler)
  // Base temp ranges from 0 (cold) to 1 (hot)
  const baseTemp = 0.5 + (Math.random() - 0.5) * 0.3; // Random base climate
  const elevationEffect = -avgElevation * 0.4; // Higher = colder
  const moistureEffect = -avgMoisture * 0.1; // Wetter = slightly cooler

  const avgTemperature = Math.max(0, Math.min(1, baseTemp + elevationEffect + moistureEffect));

  return {
    avgElevation,
    avgMoisture,
    avgTemperature,
  };
}
