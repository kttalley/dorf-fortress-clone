/**
 * Construction and Digging System
 * Dwarves can modify the world by digging and building
 */

import { TASK_TYPE, SKILL, createTask, PRIORITY } from './tasks.js';

// === STRUCTURE TYPES ===
export const STRUCTURE = {
  // Digging results
  FLOOR: 'floor',
  ROUGH_FLOOR: 'rough_floor',
  SMOOTH_WALL: 'smooth_wall',

  // Buildings
  WORKSHOP_MASON: 'workshop_mason',
  WORKSHOP_CARPENTER: 'workshop_carpenter',
  WORKSHOP_CRAFTSDWARF: 'workshop_craftsdwarf',
  WORKSHOP_KITCHEN: 'workshop_kitchen',

  // Furniture
  STOCKPILE: 'stockpile',
  MEETING_AREA: 'meeting_area',
  BED: 'bed',
  TABLE: 'table',
  CHAIR: 'chair',
};

// === DIGGABLE TILE TYPES ===
const DIGGABLE = ['cave_wall', 'mountain', 'mountain_peak', 'rock'];

// === CONSTRUCTION DEFINITIONS ===
export const CONSTRUCTIONS = {
  [STRUCTURE.WORKSHOP_MASON]: {
    name: 'Mason Workshop',
    size: { w: 3, h: 3 },
    skill: SKILL.MASONRY,
    materials: [{ type: 'stone', amount: 5 }],
    workAmount: 50,
    glyph: 'M',
    color: '#aa8866',
  },
  [STRUCTURE.WORKSHOP_CARPENTER]: {
    name: 'Carpenter Workshop',
    size: { w: 3, h: 3 },
    skill: SKILL.CARPENTRY,
    materials: [{ type: 'wood', amount: 5 }],
    workAmount: 50,
    glyph: 'C',
    color: '#88aa66',
  },
  [STRUCTURE.WORKSHOP_CRAFTSDWARF]: {
    name: 'Craftsdwarf Workshop',
    size: { w: 3, h: 3 },
    skill: SKILL.CRAFTING,
    materials: [{ type: 'stone', amount: 3 }, { type: 'wood', amount: 2 }],
    workAmount: 40,
    glyph: 'W',
    color: '#aa88aa',
  },
  [STRUCTURE.MEETING_AREA]: {
    name: 'Meeting Area',
    size: { w: 5, h: 5 },
    skill: null,
    materials: [],
    workAmount: 20,
    glyph: '+',
    color: '#88aacc',
  },
  [STRUCTURE.STOCKPILE]: {
    name: 'Stockpile',
    size: { w: 3, h: 3 },
    skill: null,
    materials: [],
    workAmount: 10,
    glyph: '=',
    color: '#aaaa88',
  },
};

/**
 * World structures storage
 */
let worldStructures = [];
let designations = new Map(); // "x,y" -> { type, progress }

/**
 * Initialize construction system
 */
export function initConstruction() {
  worldStructures = [];
  designations.clear();
}

/**
 * Check if a tile can be dug
 */
export function canDig(x, y, state) {
  const tile = getTileAt(x, y, state);
  if (!tile) return false;

  const type = typeof tile === 'object' ? tile.type : tile;
  return DIGGABLE.includes(type) || type === '#';
}

/**
 * Designate a tile for digging
 */
export function designateDig(x, y, state) {
  if (!canDig(x, y, state)) return null;

  const key = `${x},${y}`;
  if (designations.has(key)) return null;

  const designation = {
    type: 'dig',
    x,
    y,
    progress: 0,
    workRequired: 30,
  };

  designations.set(key, designation);

  return createTask(TASK_TYPE.DIG, { x, y }, {
    priority: PRIORITY.NORMAL,
    skill: SKILL.MINING,
  });
}

/**
 * Designate area for digging (geometric room)
 * Returns array of tasks
 */
export function designateRoom(x1, y1, x2, y2, state) {
  const tasks = [];

  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const task = designateDig(x, y, state);
      if (task) tasks.push(task);
    }
  }

  return tasks;
}

/**
 * Execute digging work on a designation
 */
export function workOnDig(x, y, dwarf, state) {
  const key = `${x},${y}`;
  const designation = designations.get(key);

  if (!designation) return false;

  // Calculate work based on skill
  const miningSkill = dwarf.skills?.[SKILL.MINING] || 0.3;
  const workDone = 1 + miningSkill * 2;

  designation.progress += workDone;

  if (designation.progress >= designation.workRequired) {
    // Complete the dig
    completeDig(x, y, state);
    designations.delete(key);

    // Skill improvement
    if (dwarf.skills && Math.random() < 0.15) {
      dwarf.skills[SKILL.MINING] = Math.min(1, (dwarf.skills[SKILL.MINING] || 0.2) + 0.02);
    }

    return true; // Complete
  }

  return false; // Still working
}

/**
 * Complete digging a tile
 */
function completeDig(x, y, state) {
  const index = y * state.map.width + x;

  // Create floor tile
  state.map.tiles[index] = {
    type: 'floor',
    glyph: '.',
    color: '#666666',
    walkable: true,
    dug: true,
  };

  // Drop stone resource
  if (!state.resources) state.resources = [];
  state.resources.push({
    type: 'stone',
    x,
    y,
    amount: 1 + Math.floor(Math.random() * 2),
  });
}

/**
 * Get pending dig designations
 */
export function getDigDesignations() {
  return Array.from(designations.values()).filter(d => d.type === 'dig');
}

/**
 * Find nearest dig task for a dwarf
 */
export function findNearestDigTask(dwarf) {
  let nearest = null;
  let nearestDist = Infinity;

  for (const [key, designation] of designations) {
    if (designation.type !== 'dig') continue;

    const dist = Math.abs(dwarf.x - designation.x) + Math.abs(dwarf.y - designation.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = designation;
    }
  }

  return nearest;
}

/**
 * Plan a workshop placement
 */
export function canPlaceStructure(type, x, y, state) {
  const def = CONSTRUCTIONS[type];
  if (!def) return false;

  // Check all tiles in footprint
  for (let dy = 0; dy < def.size.h; dy++) {
    for (let dx = 0; dx < def.size.w; dx++) {
      const tile = getTileAt(x + dx, y + dy, state);
      if (!tile) return false;

      const tileType = typeof tile === 'object' ? tile.type : tile;

      // Must be walkable floor
      const walkable = ['floor', 'rough_floor', 'cave_floor', 'grass', 'dirt'];
      if (!walkable.includes(tileType)) return false;

      // Can't overlap existing structures
      if (getStructureAt(x + dx, y + dy)) return false;
    }
  }

  return true;
}

/**
 * Place a structure
 */
export function placeStructure(type, x, y, state) {
  const def = CONSTRUCTIONS[type];
  if (!def || !canPlaceStructure(type, x, y, state)) return null;

  const structure = {
    id: Date.now() + Math.random(),
    type,
    x,
    y,
    width: def.size.w,
    height: def.size.h,
    progress: 0,
    complete: false,
    workers: [],
  };

  worldStructures.push(structure);

  // Create build task
  return createTask(TASK_TYPE.BUILD, { x, y, structure }, {
    priority: PRIORITY.NORMAL,
    skill: def.skill,
    resources: def.materials,
  });
}

/**
 * Work on building a structure
 */
export function workOnBuild(structure, dwarf) {
  const def = CONSTRUCTIONS[structure.type];
  if (!def || structure.complete) return false;

  const skill = def.skill ? (dwarf.skills?.[def.skill] || 0.3) : 0.5;
  const workDone = 1 + skill * 2;

  structure.progress += workDone;

  if (structure.progress >= def.workAmount) {
    structure.complete = true;

    // Skill improvement
    if (def.skill && dwarf.skills && Math.random() < 0.15) {
      dwarf.skills[def.skill] = Math.min(1, (dwarf.skills[def.skill] || 0.2) + 0.02);
    }

    return true;
  }

  return false;
}

/**
 * Get structure at position
 */
export function getStructureAt(x, y) {
  for (const structure of worldStructures) {
    if (x >= structure.x && x < structure.x + structure.width &&
        y >= structure.y && y < structure.y + structure.height) {
      return structure;
    }
  }
  return null;
}

/**
 * Get all structures
 */
export function getStructures() {
  return worldStructures;
}

/**
 * Get incomplete structures (need building)
 */
export function getIncompleteStructures() {
  return worldStructures.filter(s => !s.complete);
}

/**
 * Get workshops of a specific type
 */
export function getWorkshops(type = null) {
  return worldStructures.filter(s =>
    s.complete &&
    s.type.startsWith('workshop') &&
    (type === null || s.type === type)
  );
}

/**
 * Auto-designate geometric room near dwarves
 */
export function suggestRoom(state, size = 5) {
  // Find centroid of dwarves
  let avgX = 0, avgY = 0;
  for (const dwarf of state.dwarves) {
    avgX += dwarf.x;
    avgY += dwarf.y;
  }
  avgX = Math.floor(avgX / state.dwarves.length);
  avgY = Math.floor(avgY / state.dwarves.length);

  // Search nearby for a good spot
  for (let radius = 3; radius < 15; radius++) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const cx = Math.floor(avgX + Math.cos(angle) * radius);
      const cy = Math.floor(avgY + Math.sin(angle) * radius);

      // Check if we can dig a room here
      let canDigRoom = true;
      for (let dy = 0; dy < size && canDigRoom; dy++) {
        for (let dx = 0; dx < size && canDigRoom; dx++) {
          if (!canDig(cx + dx, cy + dy, state)) {
            canDigRoom = false;
          }
        }
      }

      if (canDigRoom) {
        return { x: cx, y: cy, w: size, h: size };
      }
    }
  }

  return null;
}

// Helper
function getTileAt(x, y, state) {
  if (x < 0 || x >= state.map.width || y < 0 || y >= state.map.height) {
    return null;
  }
  return state.map.tiles[y * state.map.width + x];
}
