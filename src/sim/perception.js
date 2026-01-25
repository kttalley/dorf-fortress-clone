/**
 * Unified Perception System
 * All entities use the same algorithm to perceive nearby world state
 * Called at decision intervals, not every tick, to avoid performance issues
 */

import { distance } from './entities.js';
import { getTile } from '../map/map.js';
import { getTileDef } from '../map/tiles.js';

// === PERCEPTION CONFIGURATION ===
export const PERCEPTION_CONFIG = {
  dwarf: { radius: 10, threatDetectionRange: 12 },
  animal: { radius: 8, threatDetectionRange: 10 },
  human: { radius: 12, threatDetectionRange: 12 },
  elf: { radius: 10, threatDetectionRange: 10 },
  goblin: { radius: 12, threatDetectionRange: 14 },
  default: { radius: 6, threatDetectionRange: 8 },
};

/**
 * Initialize perception structures for an entity
 */
export function initializePerception(entity) {
  entity.perceptionRadius = (PERCEPTION_CONFIG[entity.type] || PERCEPTION_CONFIG.default).radius;
  entity.recentlyPerceivedEntities = new Map();
  entity.recentlyPerceivedLocations = new Map();
  entity.recentlyPerceivedThreat = null;
  entity.lastScentDirection = { dx: 0, dy: 0 };

  // Initialize memory
  entity.memory = {
    shortTerm: [],         // Last 10 significant events
    locations: {},         // Named locations (food, threat, water, etc.)
    knownEntities: {},     // IDs of entities we've met
  };
}

/**
 * Main perception function
 * Called at decision intervals (not every tick)
 * Updates entity's knowledge of nearby world
 */
export function perceiveWorld(entity, state) {
  if (!entity.recentlyPerceivedEntities) {
    initializePerception(entity);
  }

  const now = state.tick;
  const { perceptionRadius } = entity;

  // 1. CLEAN UP STALE PERCEPTIONS
  // Remove perceptions older than 60 ticks
  for (const [id, data] of entity.recentlyPerceivedEntities.entries()) {
    if (now - data.tick > 60) {
      entity.recentlyPerceivedEntities.delete(id);
    }
  }

  // 2. SCAN NEARBY ENTITIES
  const nearbyEntities = scanNearbyEntities(entity, state, perceptionRadius);

  for (const other of nearbyEntities) {
    const dist = distance(entity, other);
    const relevance = calculateRelevance(entity, other, state);

    entity.recentlyPerceivedEntities.set(other.id, {
      entity: other,
      tick: now,
      distance: dist,
      relevance,
      threatLevel: calculateThreatLevel(entity, other),
    });

    // Update threat perception
    if (calculateThreatLevel(entity, other) > 0.5) {
      entity.recentlyPerceivedThreat = {
        entity: other,
        distance: dist,
        tick: now,
        threatLevel: calculateThreatLevel(entity, other),
      };
    }
  }

  // 3. SCAN NEARBY LOCATIONS
  const nearbyLocations = scanNearbyLocations(entity, state, perceptionRadius);

  for (const loc of nearbyLocations) {
    const key = `${loc.x},${loc.y}`;
    const relevance = calculateLocationRelevance(entity, loc, state);

    entity.recentlyPerceivedLocations.set(key, {
      x: loc.x,
      y: loc.y,
      type: loc.type,
      tick: now,
      relevance,
    });

    // Add to location memory
    if (relevance > 0.5) {
      const memKey = loc.type + '_' + loc.x + '_' + loc.y;
      if (!entity.memory.locations[memKey]) {
        entity.memory.locations[memKey] = {
          x: loc.x,
          y: loc.y,
          type: loc.type,
          discovered: now,
          visits: 0,
        };
      }
      entity.memory.locations[memKey].lastSeen = now;
    }
  }

  // 4. UPDATE MEMORY WITH SIGNIFICANT EVENTS
  updateEntityMemory(entity, state);
}

/**
 * Scan nearby entities within perception radius
 */
function scanNearbyEntities(entity, state, radius) {
  const nearby = [];

  // Check all dwarves
  if (state.dwarves) {
    for (const dwarf of state.dwarves) {
      if (dwarf.id !== entity.id && distance(entity, dwarf) <= radius) {
        nearby.push(dwarf);
      }
    }
  }

  // Check all animals
  if (state.animals) {
    for (const animal of state.animals) {
      if (distance(entity, animal) <= radius) {
        nearby.push(animal);
      }
    }
  }

  // Check all visitors
  if (state.visitors) {
    for (const visitor of state.visitors) {
      if (visitor.state !== 'dead' && distance(entity, visitor) <= radius) {
        nearby.push(visitor);
      }
    }
  }

  return nearby;
}

/**
 * Scan nearby locations (tiles of interest)
 */
function scanNearbyLocations(entity, state, radius) {
  const locations = [];
  const { x, y } = entity;
  const map = state.map;

  // Scan tile grid
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;

      if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;
      if (distance(entity, { x: nx, y: ny }) > radius) continue;

      const tile = getTile(nx, ny, map);
      if (!tile) continue; // Skip null tiles

      const tileDef = getTileDef(tile.type);

      // Categorize interesting tiles
      let locType = null;

      if (tile.type === 'water' || tile.type === 'river') {
        locType = 'water';
      } else if (tile.type === 'grass' || tile.type === 'tree') {
        locType = 'vegetation';
      } else if (tileDef?.obstruction) {
        locType = 'obstacle';
      }

      if (locType) {
        locations.push({
          x: nx,
          y: ny,
          type: locType,
          tileDef,
        });
      }
    }
  }

  // Add food sources
  if (state.foodSources) {
    for (const food of state.foodSources) {
      if (distance(entity, food) <= radius) {
        locations.push({
          x: food.x,
          y: food.y,
          type: 'food',
          amount: food.amount,
        });
      }
    }
  }

  return locations;
}

/**
 * Calculate relevance score (0-1) for another entity
 * Higher = more important to pay attention to
 */
function calculateRelevance(entity, other, state) {
  // Threats are most relevant
  if (calculateThreatLevel(entity, other) > 0.5) {
    return 0.95;
  }

  // Own type? Less relevant
  if (other.type === entity.type && entity.type === 'dwarf') {
    return 0.3; // Dwarves less focused on each other
  }

  // Food sources relevant to hungry entities
  if (other.type === 'food' && entity.drives?.hunger > 40) {
    return 0.80;
  }

  // Social: relevant if entity is sociable and other is intelligent
  if (entity.drives?.sociability > 0 && hasCapability(other, 'CAN_SPEAK')) {
    return 0.60;
  }

  // Mates relevant to animals during mating season
  if (entity.type === 'animal' && other.type === 'animal' && other.subtype === entity.subtype) {
    if (entity.drives?.reproduction > 60) {
      return 0.85;
    }
  }

  // Background noise
  return 0.20;
}

/**
 * Calculate threat level (0-1) that another entity poses
 */
function calculateThreatLevel(entity, other) {
  // Dead entities are not threats
  if (other.hp <= 0 || other.state === 'dead') {
    return 0;
  }

  // Dwarves are not threats to each other
  if (entity.type === 'dwarf' && other.type === 'dwarf') {
    return 0;
  }

  // Goblins are threats to most entities
  if (other.type === 'goblin') {
    return 0.9;
  }

  // Large predatory animals are threats
  if (other.type === 'animal') {
    if (['wolf', 'bear', 'boar'].includes(other.subtype)) {
      return 0.7;
    }
  }

  // Hostile visitors are threats
  if (other.type === 'human' || other.type === 'elf' || other.type === 'goblin') {
    if (other.state === 'raiding' || other.state === 'fighting') {
      return 0.8;
    }
  }

  return 0;
}

/**
 * Calculate relevance of a location
 */
function calculateLocationRelevance(entity, loc, state) {
  // Water is relevant to fishers
  if (loc.type === 'water' && entity.skills?.some(s => s.name === 'fishing' && s.level > 0)) {
    return 0.8;
  }

  // Vegetation relevant to herbivores
  if (loc.type === 'vegetation' && entity.type === 'animal') {
    if (entity.drives?.hunger > 40) {
      return 0.7;
    }
  }

  // Food always relevant
  if (loc.type === 'food' && entity.drives?.hunger > 30) {
    return 0.85;
  }

  // Obstacles relevant for pathfinding (avoid)
  if (loc.type === 'obstacle') {
    return 0.1; // Note: negative relevance handled elsewhere
  }

  return 0.3;
}

/**
 * Update entity's memory with significant events
 */
function updateEntityMemory(entity, state) {
  if (!entity.memory.shortTerm) {
    entity.memory.shortTerm = [];
  }

  // Keep last 10 events
  if (entity.memory.shortTerm.length > 10) {
    entity.memory.shortTerm.shift();
  }

  // Check for new significant events
  if (entity.recentlyPerceivedThreat && !entity._lastThreatMemory) {
    entity.memory.shortTerm.push({
      type: 'threat_detected',
      entity: entity.recentlyPerceivedThreat.entity.name || entity.recentlyPerceivedThreat.entity.type,
      tick: state.tick,
    });
    entity._lastThreatMemory = state.tick;
  }
}

/**
 * Get perceived entity by ID
 */
export function getPerceivedEntity(entity, otherId) {
  return entity.recentlyPerceivedEntities?.get(otherId)?.entity || null;
}

/**
 * Get all perceived threats
 */
export function getPerceivedThreats(entity) {
  const threats = [];

  for (const [id, data] of entity.recentlyPerceivedEntities?.entries() || []) {
    if (data.threatLevel > 0.5) {
      threats.push({
        entity: data.entity,
        distance: data.distance,
        threatLevel: data.threatLevel,
      });
    }
  }

  return threats.sort((a, b) => a.distance - b.distance);
}

/**
 * Get nearest perceived entity of a type
 */
export function getNearestPerceivedEntity(entity, entityType) {
  let nearest = null;
  let nearestDist = Infinity;

  for (const [id, data] of entity.recentlyPerceivedEntities?.entries() || []) {
    if (data.entity.type === entityType && data.distance < nearestDist) {
      nearest = data.entity;
      nearestDist = data.distance;
    }
  }

  return nearest;
}

// Helper function (imported from capabilities.js in actual code)
function hasCapability(entity, capability) {
  // Simplified check; in real code would use imports
  return entity.type === 'dwarf' || entity.type === 'human' || entity.type === 'elf' || entity.type === 'goblin';
}
