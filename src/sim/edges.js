/**
 * Map Edge Utilities
 * Functions for finding edge tiles and fortress center for visitor spawning/navigation
 */

import { isWalkable, inBounds } from '../map/map.js';

export const EDGE = Object.freeze({
  NORTH: 'north',
  SOUTH: 'south',
  EAST: 'east',
  WEST: 'west',
});

/**
 * Get all walkable tiles on each edge of the map
 * @param {object} map
 * @returns {{ north: Array, south: Array, east: Array, west: Array }}
 */
export function getEdgeTiles(map) {
  const edges = {
    [EDGE.NORTH]: [],
    [EDGE.SOUTH]: [],
    [EDGE.EAST]: [],
    [EDGE.WEST]: [],
  };

  // North edge (y = 0) and South edge (y = height - 1)
  for (let x = 0; x < map.width; x++) {
    // Try y=0, if blocked try y=1
    if (isWalkable(map, x, 0)) {
      edges[EDGE.NORTH].push({ x, y: 0 });
    } else if (isWalkable(map, x, 1)) {
      edges[EDGE.NORTH].push({ x, y: 1 });
    }

    // Try y=height-1, if blocked try y=height-2
    const lastY = map.height - 1;
    if (isWalkable(map, x, lastY)) {
      edges[EDGE.SOUTH].push({ x, y: lastY });
    } else if (isWalkable(map, x, lastY - 1)) {
      edges[EDGE.SOUTH].push({ x, y: lastY - 1 });
    }
  }

  // West edge (x = 0) and East edge (x = width - 1)
  for (let y = 0; y < map.height; y++) {
    // Try x=0, if blocked try x=1
    if (isWalkable(map, 0, y)) {
      edges[EDGE.WEST].push({ x: 0, y });
    } else if (isWalkable(map, 1, y)) {
      edges[EDGE.WEST].push({ x: 1, y });
    }

    // Try x=width-1, if blocked try x=width-2
    const lastX = map.width - 1;
    if (isWalkable(map, lastX, y)) {
      edges[EDGE.EAST].push({ x: lastX, y });
    } else if (isWalkable(map, lastX - 1, y)) {
      edges[EDGE.EAST].push({ x: lastX - 1, y });
    }
  }

  return edges;
}

/**
 * Get a random walkable position on any map edge
 * @param {object} map
 * @returns {{ x: number, y: number, edge: string } | null}
 */
export function getRandomEdgePosition(map) {
  const edges = getEdgeTiles(map);
  const allEdges = [
    ...edges[EDGE.NORTH].map(p => ({ ...p, edge: EDGE.NORTH })),
    ...edges[EDGE.SOUTH].map(p => ({ ...p, edge: EDGE.SOUTH })),
    ...edges[EDGE.EAST].map(p => ({ ...p, edge: EDGE.EAST })),
    ...edges[EDGE.WEST].map(p => ({ ...p, edge: EDGE.WEST })),
  ];

  if (allEdges.length === 0) return null;

  return allEdges[Math.floor(Math.random() * allEdges.length)];
}

/**
 * Get a random position on a specific edge
 * @param {object} map
 * @param {string} edge - EDGE enum value
 * @returns {{ x: number, y: number, edge: string } | null}
 */
export function getRandomPositionOnEdge(map, edge) {
  const edges = getEdgeTiles(map);
  const edgeTiles = edges[edge];

  if (!edgeTiles || edgeTiles.length === 0) return null;

  const pos = edgeTiles[Math.floor(Math.random() * edgeTiles.length)];
  return { ...pos, edge };
}

/**
 * Get the opposite edge
 * @param {string} edge
 * @returns {string}
 */
export function getOppositeEdge(edge) {
  const opposites = {
    [EDGE.NORTH]: EDGE.SOUTH,
    [EDGE.SOUTH]: EDGE.NORTH,
    [EDGE.EAST]: EDGE.WEST,
    [EDGE.WEST]: EDGE.EAST,
  };
  return opposites[edge] || EDGE.SOUTH;
}

/**
 * Find the center of dwarf activity (fortress center)
 * @param {object} state - World state with dwarves array
 * @returns {{ x: number, y: number }}
 */
export function findFortressCenter(state) {
  if (!state.dwarves || state.dwarves.length === 0) {
    // Default to map center
    return {
      x: Math.floor(state.map.width / 2),
      y: Math.floor(state.map.height / 2),
    };
  }

  // Calculate average position of all living dwarves
  const livingDwarves = state.dwarves.filter(d => d.hp > 0);

  if (livingDwarves.length === 0) {
    return {
      x: Math.floor(state.map.width / 2),
      y: Math.floor(state.map.height / 2),
    };
  }

  const sumX = livingDwarves.reduce((sum, d) => sum + d.x, 0);
  const sumY = livingDwarves.reduce((sum, d) => sum + d.y, 0);

  return {
    x: Math.round(sumX / livingDwarves.length),
    y: Math.round(sumY / livingDwarves.length),
  };
}

/**
 * Find a position on the exit edge for a leaving visitor
 * @param {object} visitor
 * @param {object} map
 * @returns {{ x: number, y: number, edge: string } | null}
 */
export function findExitPosition(visitor, map) {
  // Try to leave via the opposite edge of entry
  const exitEdge = getOppositeEdge(visitor.entryEdge);
  let exitPos = getRandomPositionOnEdge(map, exitEdge);

  // If no walkable position on opposite edge, try entry edge
  if (!exitPos) {
    exitPos = getRandomPositionOnEdge(map, visitor.entryEdge);
  }

  // If still nothing, try any edge
  if (!exitPos) {
    exitPos = getRandomEdgePosition(map);
  }

  return exitPos;
}

/**
 * Check if position is at or near any map edge
 * @param {number} x
 * @param {number} y
 * @param {object} map
 * @param {number} threshold - Distance from edge to consider "at edge"
 * @returns {boolean}
 */
export function isNearEdge(x, y, map, threshold = 2) {
  return (
    x <= threshold ||
    x >= map.width - 1 - threshold ||
    y <= threshold ||
    y >= map.height - 1 - threshold
  );
}

/**
 * Get the nearest edge to a position
 * @param {number} x
 * @param {number} y
 * @param {object} map
 * @returns {string}
 */
export function getNearestEdge(x, y, map) {
  const distances = {
    [EDGE.NORTH]: y,
    [EDGE.SOUTH]: map.height - 1 - y,
    [EDGE.WEST]: x,
    [EDGE.EAST]: map.width - 1 - x,
  };

  let nearest = EDGE.NORTH;
  let minDist = distances[EDGE.NORTH];

  for (const [edge, dist] of Object.entries(distances)) {
    if (dist < minDist) {
      minDist = dist;
      nearest = edge;
    }
  }

  return nearest;
}
