/**
 * Intelligent Movement System
 * Organic dwarf movement with momentum, scent gradients, and social awareness
 */

import { distance } from './entities.js';

// === MOVEMENT CONFIGURATION ===
const CONFIG = {
  MOMENTUM_WEIGHT: 0.4,        // How much previous direction matters
  SCENT_WEIGHT: 0.3,           // Attraction to food/resources
  SOCIAL_WEIGHT: 0.25,         // Attraction/repulsion from other dwarves
  EXPLORATION_WEIGHT: 0.2,     // Preference for unexplored areas
  WANDER_NOISE: 0.15,          // Random deviation
  SCENT_DECAY: 0.92,           // How fast scent fades per tile
  SCENT_RADIUS: 15,            // How far scent spreads
  MAX_MOMENTUM: 3,             // Max tiles of momentum
};

// === SCENT MAP ===
// Tracks attractive/repulsive gradients across the map
let scentMap = null;
let scentWidth = 0;
let scentHeight = 0;

/**
 * Initialize scent map for a world
 */
export function initScentMap(width, height) {
  scentWidth = width;
  scentHeight = height;
  scentMap = new Float32Array(width * height);
}

/**
 * Add scent at a location (spreads outward)
 * Positive = attractive, Negative = repulsive
 */
export function emitScent(x, y, strength, radius = CONFIG.SCENT_RADIUS) {
  if (!scentMap) return;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;

      if (nx < 0 || nx >= scentWidth || ny < 0 || ny >= scentHeight) continue;

      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > radius) continue;

      const decay = Math.pow(CONFIG.SCENT_DECAY, dist);
      const idx = ny * scentWidth + nx;
      scentMap[idx] += strength * decay;
    }
  }
}

/**
 * Get scent at location
 */
export function getScent(x, y) {
  if (!scentMap || x < 0 || x >= scentWidth || y < 0 || y >= scentHeight) return 0;
  return scentMap[y * scentWidth + x];
}

/**
 * Decay all scents (call each tick)
 */
export function decayScents() {
  if (!scentMap) return;
  for (let i = 0; i < scentMap.length; i++) {
    scentMap[i] *= 0.98; // Slow global decay
    if (Math.abs(scentMap[i]) < 0.01) scentMap[i] = 0;
  }
}

/**
 * Calculate scent gradient direction at a position
 * Returns { dx, dy } normalized vector pointing toward strongest scent
 */
export function getScentGradient(x, y) {
  if (!scentMap) return { dx: 0, dy: 0 };

  let gradX = 0;
  let gradY = 0;

  // Sample in cardinal directions
  const samples = [
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    { dx: 1, dy: 1 }, { dx: -1, dy: 1 },
    { dx: 1, dy: -1 }, { dx: -1, dy: -1 },
  ];

  for (const { dx, dy } of samples) {
    const scent = getScent(x + dx, y + dy);
    gradX += dx * scent;
    gradY += dy * scent;
  }

  // Normalize
  const len = Math.sqrt(gradX * gradX + gradY * gradY);
  if (len > 0.01) {
    return { dx: gradX / len, dy: gradY / len };
  }

  return { dx: 0, dy: 0 };
}

/**
 * Calculate intelligent movement vector for a dwarf
 * Combines multiple factors for organic movement
 */
export function calculateMovementVector(dwarf, state, options = {}) {
  const {
    seekSocial = false,
    avoidSocial = false,
    followScent = true,
    exploreBias = false,
    targetPos = null,
  } = options;

  let moveX = 0;
  let moveY = 0;

  // 1. Momentum from previous movement
  if (dwarf.momentum) {
    moveX += dwarf.momentum.dx * CONFIG.MOMENTUM_WEIGHT;
    moveY += dwarf.momentum.dy * CONFIG.MOMENTUM_WEIGHT;
  }

  // 2. Direct target attraction
  if (targetPos) {
    const dx = targetPos.x - dwarf.x;
    const dy = targetPos.y - dwarf.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    moveX += (dx / dist) * 0.6;
    moveY += (dy / dist) * 0.6;
  }

  // 3. Scent gradient
  if (followScent) {
    const gradient = getScentGradient(dwarf.x, dwarf.y);
    moveX += gradient.dx * CONFIG.SCENT_WEIGHT;
    moveY += gradient.dy * CONFIG.SCENT_WEIGHT;
  }

  // 4. Social forces
  const socialForce = calculateSocialForce(dwarf, state, seekSocial, avoidSocial);
  moveX += socialForce.dx * CONFIG.SOCIAL_WEIGHT;
  moveY += socialForce.dy * CONFIG.SOCIAL_WEIGHT;

  // 5. Exploration bias (prefer less-visited directions)
  if (exploreBias) {
    const exploreForce = calculateExplorationForce(dwarf, state);
    moveX += exploreForce.dx * CONFIG.EXPLORATION_WEIGHT;
    moveY += exploreForce.dy * CONFIG.EXPLORATION_WEIGHT;
  }

  // 6. Random wander noise
  moveX += (Math.random() - 0.5) * 2 * CONFIG.WANDER_NOISE;
  moveY += (Math.random() - 0.5) * 2 * CONFIG.WANDER_NOISE;

  // Normalize and scale
  const len = Math.sqrt(moveX * moveX + moveY * moveY) || 1;
  return {
    dx: moveX / len,
    dy: moveY / len,
    magnitude: Math.min(len, CONFIG.MAX_MOMENTUM),
  };
}

/**
 * Calculate social attraction/repulsion force
 */
function calculateSocialForce(dwarf, state, seekSocial, avoidSocial) {
  let forceX = 0;
  let forceY = 0;

  if (!state.dwarves) return { dx: 0, dy: 0 };

  for (const other of state.dwarves) {
    if (other.id === dwarf.id) continue;

    const dx = other.x - dwarf.x;
    const dy = other.y - dwarf.y;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;

    if (dist > 20) continue; // Too far to matter

    // Relationship affects attraction
    const relationship = dwarf.relationships?.[other.id];
    const affinity = relationship?.affinity || 0;

    // Base attraction/repulsion modified by seeking behavior
    let force = 0;

    if (seekSocial) {
      // Attracted to others, especially friends
      force = (1 + affinity / 100) / dist;
    } else if (avoidSocial) {
      // Repelled by others
      force = -2 / dist;
    } else {
      // Mild attraction to friends, mild repulsion from strangers
      force = (affinity / 200) / dist;
    }

    // Don't get too close
    if (dist < 2) {
      force -= 1 / dist;
    }

    forceX += (dx / dist) * force;
    forceY += (dy / dist) * force;
  }

  // Normalize
  const len = Math.sqrt(forceX * forceX + forceY * forceY);
  if (len > 0.01) {
    return { dx: forceX / len, dy: forceY / len };
  }

  return { dx: 0, dy: 0 };
}

/**
 * Calculate exploration force (prefer unexplored directions)
 */
function calculateExplorationForce(dwarf, state) {
  // Simple: prefer directions we haven't moved recently
  // Use inverse of momentum as exploration bias
  if (dwarf.momentum) {
    return {
      dx: -dwarf.momentum.dx * 0.3 + (Math.random() - 0.5),
      dy: -dwarf.momentum.dy * 0.3 + (Math.random() - 0.5),
    };
  }

  // Random direction if no momentum
  const angle = Math.random() * Math.PI * 2;
  return {
    dx: Math.cos(angle),
    dy: Math.sin(angle),
  };
}

/**
 * Convert movement vector to actual tile movement
 * Returns best passable tile in direction of vector
 */
export function vectorToMovement(dwarf, vector, state) {
  // Possible moves (8 directions + stay)
  const moves = [
    { dx: 0, dy: 0 },
    { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
    { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
    { dx: 1, dy: 1 }, { dx: -1, dy: 1 },
    { dx: 1, dy: -1 }, { dx: -1, dy: -1 },
  ];

  let bestMove = { dx: 0, dy: 0 };
  let bestScore = -Infinity;

  for (const move of moves) {
    const nx = dwarf.x + move.dx;
    const ny = dwarf.y + move.dy;

    // Check passability
    if (!isPassable(nx, ny, state)) continue;

    // Score by alignment with desired vector
    const alignment = move.dx * vector.dx + move.dy * vector.dy;

    // Bonus for actually moving (not staying still)
    const movementBonus = (move.dx !== 0 || move.dy !== 0) ? 0.2 : 0;

    // Small random factor for variety
    const noise = Math.random() * 0.1;

    const score = alignment + movementBonus + noise;

    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }

  return bestMove;
}

/**
 * Execute intelligent movement for a dwarf
 */
export function executeSmartMovement(dwarf, state, options = {}) {
  const vector = calculateMovementVector(dwarf, state, options);
  const move = vectorToMovement(dwarf, vector, state);

  // Update position
  dwarf.x += move.dx;
  dwarf.y += move.dy;

  // Update momentum
  dwarf.momentum = {
    dx: move.dx * 0.7 + (dwarf.momentum?.dx || 0) * 0.3,
    dy: move.dy * 0.7 + (dwarf.momentum?.dy || 0) * 0.3,
  };

  return move;
}

/**
 * Move toward a specific target intelligently
 */
export function moveToward(dwarf, target, state) {
  return executeSmartMovement(dwarf, state, {
    targetPos: target,
    followScent: true,
  });
}

/**
 * Check if tile is passable
 */
function isPassable(x, y, state) {
  if (x < 0 || x >= state.map.width || y < 0 || y >= state.map.height) {
    return false;
  }

  const index = y * state.map.width + x;
  const tile = state.map.tiles[index];

  if (!tile) return false;

  // Handle object tiles
  if (typeof tile === 'object') {
    if (tile.walkable === false) return false;
    const walkable = [
      'grass', 'tall_grass', 'dirt', 'forest_floor', 'cave_floor',
      'river_bank', 'sand', 'mountain_slope', 'marsh', 'moss',
      'shrub', 'flower', 'mushroom', 'berry_bush', 'food_plant',
      'rocky_ground', 'snow', 'mud', 'crystal', 'path',
      'floor', 'workshop_floor', 'dwelling_floor',
    ];
    return walkable.includes(tile.type);
  }

  return tile !== '#' && tile !== '~';
}

/**
 * A* pathfinding for longer distances
 */
export function findPath(startX, startY, endX, endY, state, maxSteps = 50) {
  const key = (x, y) => `${x},${y}`;

  const openSet = [{ x: startX, y: startY, g: 0, f: 0, parent: null }];
  const closedSet = new Set();
  const gScores = new Map();

  gScores.set(key(startX, startY), 0);

  while (openSet.length > 0 && closedSet.size < maxSteps) {
    // Get node with lowest f score
    openSet.sort((a, b) => a.f - b.f);
    const current = openSet.shift();

    if (current.x === endX && current.y === endY) {
      // Reconstruct path
      const path = [];
      let node = current;
      while (node) {
        path.unshift({ x: node.x, y: node.y });
        node = node.parent;
      }
      return path;
    }

    closedSet.add(key(current.x, current.y));

    // Check neighbors
    const neighbors = [
      { dx: 1, dy: 0 }, { dx: -1, dy: 0 },
      { dx: 0, dy: 1 }, { dx: 0, dy: -1 },
      { dx: 1, dy: 1 }, { dx: -1, dy: 1 },
      { dx: 1, dy: -1 }, { dx: -1, dy: -1 },
    ];

    for (const { dx, dy } of neighbors) {
      const nx = current.x + dx;
      const ny = current.y + dy;
      const nKey = key(nx, ny);

      if (closedSet.has(nKey)) continue;
      if (!isPassable(nx, ny, state)) continue;

      const tentativeG = current.g + (dx !== 0 && dy !== 0 ? 1.4 : 1);

      if (!gScores.has(nKey) || tentativeG < gScores.get(nKey)) {
        gScores.set(nKey, tentativeG);

        const h = Math.abs(nx - endX) + Math.abs(ny - endY);
        const f = tentativeG + h;

        // Check if already in open set
        const existing = openSet.find(n => n.x === nx && n.y === ny);
        if (existing) {
          existing.g = tentativeG;
          existing.f = f;
          existing.parent = current;
        } else {
          openSet.push({ x: nx, y: ny, g: tentativeG, f, parent: current });
        }
      }
    }
  }

  return null; // No path found
}
