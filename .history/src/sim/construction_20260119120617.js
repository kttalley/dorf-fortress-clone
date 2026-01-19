/**
 * Construction and Building System
 * Dwarves dig rooms, build shelters, workshops, and community spaces
 */

import { SKILL } from './tasks.js';
import { addLog } from '../state/store.js';
import { getDisplayName } from './entities.js';

// === STRUCTURE TYPES ===
export const STRUCTURE_TYPE = {
  // Basic shelter
  SHELTER: 'shelter',
  BEDROOM: 'bedroom',

  // Community
  DINING_HALL: 'dining_hall',
  MEETING_HALL: 'meeting_hall',

  // Workshops (skill-based)
  WORKSHOP_MASON: 'workshop_mason',
  WORKSHOP_CARPENTER: 'workshop_carpenter',
  WORKSHOP_CRAFTSDWARF: 'workshop_craftsdwarf',
  WORKSHOP_KITCHEN: 'workshop_kitchen',

  // Storage
  STOCKPILE: 'stockpile',
  FOOD_STORAGE: 'food_storage',

  // Food Production
  FARM: 'farm',
  FISHING_SPOT: 'fishing_spot',
  HUNTING_LODGE: 'hunting_lodge',
  BREWERY: 'brewery',
};

// === TILE TYPES FOR CONSTRUCTION ===
// Using char/fg/bg to match standard tile definitions
export const CONSTRUCT_TILE = {
  FLOOR: { type: 'floor', char: '.', fg: '#555555', bg: '#1a1a1a', walkable: true },
  SMOOTH_FLOOR: { type: 'smooth_floor', char: '.', fg: '#666666', bg: '#1f1f1f', walkable: true },
  WALL: { type: 'built_wall', char: '#', fg: '#888877', bg: '#2a2a25', walkable: false },
  DOOR: { type: 'door', char: '+', fg: '#aa8855', bg: '#1a1815', walkable: true },
  WORKSHOP_FLOOR: { type: 'workshop_floor', char: '=', fg: '#665544', bg: '#1a1815', walkable: true },
  BED: { type: 'bed', char: 'b', fg: '#8888aa', bg: '#1a1a1f', walkable: false },
  TABLE: { type: 'table', char: 't', fg: '#aa8866', bg: '#1a1815', walkable: false },
  CHAIR: { type: 'chair', char: 'h', fg: '#aa8866', bg: '#1a1815', walkable: true },
  STOCKPILE_MARKER: { type: 'stockpile', char: ':', fg: '#aaaa66', bg: '#1a1a15', walkable: true },
};

// === BLUEPRINT DEFINITIONS ===
export const BLUEPRINTS = {
  [STRUCTURE_TYPE.SHELTER]: {
    name: 'Basic Shelter',
    description: 'A simple covered area for rest',
    size: { w: 4, h: 4 },
    skill: null,
    workAmount: 40,
    priority: 80, // High priority - basic need
    layout: [
      '####',
      '#..#',
      '#..+',
      '####',
    ],
    tiles: {
      '#': CONSTRUCT_TILE.WALL,
      '.': CONSTRUCT_TILE.FLOOR,
      '+': CONSTRUCT_TILE.DOOR,
    },
    furniture: [
      { x: 1, y: 1, tile: CONSTRUCT_TILE.BED },
    ],
  },

  [STRUCTURE_TYPE.BEDROOM]: {
    name: 'Bedroom',
    description: 'Private sleeping quarters',
    size: { w: 5, h: 4 },
    skill: SKILL.MASONRY,
    workAmount: 50,
    priority: 60,
    layout: [
      '#####',
      '#b..#',
      '#...+',
      '#####',
    ],
    tiles: {
      '#': CONSTRUCT_TILE.WALL,
      '.': CONSTRUCT_TILE.SMOOTH_FLOOR,
      '+': CONSTRUCT_TILE.DOOR,
      'b': CONSTRUCT_TILE.BED,
    },
  },

  [STRUCTURE_TYPE.DINING_HALL]: {
    name: 'Dining Hall',
    description: 'Communal eating area',
    size: { w: 7, h: 6 },
    skill: SKILL.MASONRY,
    workAmount: 80,
    priority: 70,
    layout: [
      '#######',
      '#.....#',
      '#.tht.#',
      '#.tht.#',
      '#.....+',
      '#######',
    ],
    tiles: {
      '#': CONSTRUCT_TILE.WALL,
      '.': CONSTRUCT_TILE.SMOOTH_FLOOR,
      '+': CONSTRUCT_TILE.DOOR,
      't': CONSTRUCT_TILE.TABLE,
      'h': CONSTRUCT_TILE.CHAIR,
    },
  },

  [STRUCTURE_TYPE.MEETING_HALL]: {
    name: 'Meeting Hall',
    description: 'Space for gatherings',
    size: { w: 8, h: 8 },
    skill: SKILL.MASONRY,
    workAmount: 100,
    priority: 50,
    layout: [
      '########',
      '#......#',
      '#......#',
      '#......#',
      '#......#',
      '#......#',
      '#......+',
      '########',
    ],
    tiles: {
      '#': CONSTRUCT_TILE.WALL,
      '.': CONSTRUCT_TILE.SMOOTH_FLOOR,
      '+': CONSTRUCT_TILE.DOOR,
    },
  },

  [STRUCTURE_TYPE.WORKSHOP_MASON]: {
    name: 'Mason Workshop',
    description: 'Stonecutting and carving',
    size: { w: 5, h: 5 },
    skill: SKILL.MASONRY,
    workAmount: 60,
    priority: 65,
    layout: [
      '#####',
      '#===+',
      '#===.',
      '#===.',
      '#####',
    ],
    tiles: {
      '#': CONSTRUCT_TILE.WALL,
      '.': CONSTRUCT_TILE.FLOOR,
      '+': CONSTRUCT_TILE.DOOR,
      '=': CONSTRUCT_TILE.WORKSHOP_FLOOR,
    },
    glyph: 'M',
    glyphColor: '#aa8866',
  },

  [STRUCTURE_TYPE.WORKSHOP_CARPENTER]: {
    name: 'Carpenter Workshop',
    description: 'Woodworking',
    size: { w: 5, h: 5 },
    skill: SKILL.CARPENTRY,
    workAmount: 55,
    priority: 65,
    layout: [
      '#####',
      '#===+',
      '#===.',
      '#===.',
      '#####',
    ],
    tiles: {
      '#': CONSTRUCT_TILE.WALL,
      '.': CONSTRUCT_TILE.FLOOR,
      '+': CONSTRUCT_TILE.DOOR,
      '=': CONSTRUCT_TILE.WORKSHOP_FLOOR,
    },
    glyph: 'C',
    glyphColor: '#88aa66',
  },

  [STRUCTURE_TYPE.WORKSHOP_CRAFTSDWARF]: {
    name: 'Crafts Workshop',
    description: 'General crafting',
    size: { w: 5, h: 5 },
    skill: SKILL.CRAFTING,
    workAmount: 50,
    priority: 60,
    layout: [
      '#####',
      '#===+',
      '#===.',
      '#===.',
      '#####',
    ],
    tiles: {
      '#': CONSTRUCT_TILE.WALL,
      '.': CONSTRUCT_TILE.FLOOR,
      '+': CONSTRUCT_TILE.DOOR,
      '=': CONSTRUCT_TILE.WORKSHOP_FLOOR,
    },
    glyph: 'W',
    glyphColor: '#aa88aa',
  },

  [STRUCTURE_TYPE.WORKSHOP_KITCHEN]: {
    name: 'Kitchen',
    description: 'Food preparation',
    size: { w: 5, h: 5 },
    skill: SKILL.COOKING,
    workAmount: 50,
    priority: 70,
    layout: [
      '#####',
      '#===+',
      '#===.',
      '#===.',
      '#####',
    ],
    tiles: {
      '#': CONSTRUCT_TILE.WALL,
      '.': CONSTRUCT_TILE.FLOOR,
      '+': CONSTRUCT_TILE.DOOR,
      '=': CONSTRUCT_TILE.WORKSHOP_FLOOR,
    },
    glyph: 'K',
    glyphColor: '#aaaa66',
  },

  [STRUCTURE_TYPE.STOCKPILE]: {
    name: 'Stockpile',
    description: 'Resource storage',
    size: { w: 4, h: 4 },
    skill: null,
    workAmount: 20,
    priority: 55,
    layout: [
      '::::',
      '::::',
      '::::',
      '::::',
    ],
    tiles: {
      ':': CONSTRUCT_TILE.STOCKPILE_MARKER,
    },
  },

  [STRUCTURE_TYPE.FOOD_STORAGE]: {
    name: 'Food Storage',
    description: 'Preserved food storage',
    size: { w: 4, h: 4 },
    skill: null,
    workAmount: 30,
    priority: 65,
    layout: [
      '####',
      '#::+',
      '#::#',
      '####',
    ],
    tiles: {
      '#': CONSTRUCT_TILE.WALL,
      ':': CONSTRUCT_TILE.STOCKPILE_MARKER,
      '+': CONSTRUCT_TILE.DOOR,
    },
  },

  [STRUCTURE_TYPE.FARM]: {
    name: 'Farm',
    description: 'Cultivate crops for food',
    size: { w: 6, h: 6 },
    skill: SKILL.MINING,
    workAmount: 40,
    priority: 80,
    layout: [
      '......',
      '......',
      '......',
      '......',
      '......',
      '......',
    ],
    tiles: {
      '.': CONSTRUCT_TILE.FLOOR,
    },
  },

  [STRUCTURE_TYPE.FISHING_SPOT]: {
    name: 'Fishing Spot',
    description: 'Fish for food from water',
    size: { w: 4, h: 4 },
    skill: SKILL.EXPLORATION,
    workAmount: 30,
    priority: 70,
    layout: [
      '....',
      '....',
      '....',
      '....',
    ],
    tiles: {
      '.': CONSTRUCT_TILE.FLOOR,
    },
  },

  [STRUCTURE_TYPE.HUNTING_LODGE]: {
    name: 'Hunting Lodge',
    description: 'Base for hunting expeditions',
    size: { w: 5, h: 5 },
    skill: SKILL.EXPLORATION,
    workAmount: 35,
    priority: 68,
    layout: [
      '#####',
      '#...+',
      '#....',
      '#....',
      '#####',
    ],
    tiles: {
      '#': CONSTRUCT_TILE.WALL,
      '.': CONSTRUCT_TILE.FLOOR,
      '+': CONSTRUCT_TILE.DOOR,
    },
  },

  [STRUCTURE_TYPE.BREWERY]: {
    name: 'Brewery',
    description: 'Ferment plants into food/drink',
    size: { w: 5, h: 5 },
    skill: SKILL.CRAFTING,
    workAmount: 45,
    priority: 65,
    layout: [
      '#####',
      '#===+',
      '#===.',
      '#===.',
      '#####',
    ],
    tiles: {
      '#': CONSTRUCT_TILE.WALL,
      '.': CONSTRUCT_TILE.FLOOR,
      '+': CONSTRUCT_TILE.DOOR,
      '=': CONSTRUCT_TILE.WORKSHOP_FLOOR,
    },
    glyph: 'B',
    glyphColor: '#aa6644',
  },
};

// === STATE ===
let structures = [];
let buildProjects = [];  // Active construction projects
let designations = new Map();  // "x,y" -> designation
let worldState = null;

/**
 * Initialize construction system
 */
export function initConstruction() {
  structures = [];
  buildProjects = [];
  designations.clear();
}

/**
 * Set world state reference
 */
export function setConstructionWorldState(state) {
  worldState = state;
}

// === DIGGING SYSTEM ===

const DIGGABLE_TYPES = ['cave_wall', 'mountain', 'mountain_peak', 'rock', 'stone'];

/**
 * Check if a tile can be dug
 */
export function canDig(x, y, state) {
  const tile = getTileAt(x, y, state);
  if (!tile) return false;

  const type = typeof tile === 'object' ? tile.type : tile;
  return DIGGABLE_TYPES.includes(type) || type === '#';
}

/**
 * Designate a single tile for digging
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
    workRequired: 25,
  };

  designations.set(key, designation);
  return designation;
}

/**
 * Designate a rectangular area for digging
 */
export function designateRoom(x1, y1, x2, y2, state) {
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);

  const digs = [];
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const dig = designateDig(x, y, state);
      if (dig) digs.push(dig);
    }
  }

  return digs;
}

/**
 * Work on digging a tile
 */
export function workOnDig(x, y, dwarf, state) {
  const key = `${x},${y}`;
  const designation = designations.get(key);

  if (!designation || designation.type !== 'dig') return false;

  const miningSkill = dwarf.skills?.[SKILL.MINING] || 0.3;
  const workDone = 1 + miningSkill * 2;

  designation.progress += workDone;

  if (designation.progress >= designation.workRequired) {
    // Complete the dig - modify the map
    completeDig(x, y, state);
    designations.delete(key);

    // Skill improvement
    if (dwarf.skills && Math.random() < 0.12) {
      dwarf.skills[SKILL.MINING] = Math.min(1, (dwarf.skills[SKILL.MINING] || 0.2) + 0.015);
    }

    return true;
  }

  return false;
}

/**
 * Complete digging - modify map tile
 */
function completeDig(x, y, state) {
  const index = y * state.map.width + x;

  // Replace with floor (using char/fg/bg to match standard tile format)
  state.map.tiles[index] = {
    type: 'floor',
    char: '.',
    fg: '#555555',
    bg: '#1a1a1a',
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
 * Get all dig designations
 */
export function getDigDesignations() {
  return Array.from(designations.values()).filter(d => d.type === 'dig');
}

/**
 * Find nearest dig task
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

// === BUILDING SYSTEM ===

/**
 * Check if a structure can be placed at location
 */
export function canPlaceStructure(structureType, x, y, state) {
  const blueprint = BLUEPRINTS[structureType];
  if (!blueprint) return false;

  const { w, h } = blueprint.size;

  for (let dy = 0; dy < h; dy++) {
    for (let dx = 0; dx < w; dx++) {
      const tx = x + dx;
      const ty = y + dy;

      // Check bounds
      if (tx < 0 || tx >= state.map.width || ty < 0 || ty >= state.map.height) {
        return false;
      }

      const tile = getTileAt(tx, ty, state);
      if (!tile) return false;

      const tileType = typeof tile === 'object' ? tile.type : tile;

      // Can build on floor tiles or dig through walls
      const buildable = ['floor', 'smooth_floor', 'cave_floor', 'grass', 'dirt', 'rough_floor'];
      const diggable = DIGGABLE_TYPES.concat(['#']);

      if (!buildable.includes(tileType) && !diggable.includes(tileType)) {
        return false;
      }

      // Check for overlapping structures
      if (getStructureAt(tx, ty)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Start a building project
 */
export function startBuildProject(structureType, x, y, state, initiator = null) {
  const blueprint = BLUEPRINTS[structureType];
  if (!blueprint) return null;

  if (!canPlaceStructure(structureType, x, y, state)) return null;

  const project = {
    id: Date.now() + Math.random(),
    type: structureType,
    blueprint,
    x,
    y,
    width: blueprint.size.w,
    height: blueprint.size.h,
    progress: 0,
    workRequired: blueprint.workAmount,
    phase: 'digging', // 'digging' | 'building' | 'furnishing' | 'complete'
    digProgress: new Map(),
    buildProgress: new Map(),
    initiatorId: initiator?.id,
    initiatorName: initiator?.name,
    workers: new Set(),
  };

  // Create dig designations for walls/digging needed
  for (let dy = 0; dy < blueprint.size.h; dy++) {
    for (let dx = 0; dx < blueprint.size.w; dx++) {
      const tx = x + dx;
      const ty = y + dy;
      const tile = getTileAt(tx, ty, state);
      const tileType = typeof tile === 'object' ? tile.type : tile;

      if (DIGGABLE_TYPES.includes(tileType) || tileType === '#') {
        const key = `${tx},${ty}`;
        project.digProgress.set(key, { x: tx, y: ty, progress: 0, required: 20 });
      }
    }
  }

  buildProjects.push(project);

  if (initiator) {
    addLog(state, `${initiator.name} begins planning a ${blueprint.name}.`);
  }

  return project;
}

/**
 * Work on a build project
 */
export function workOnBuildProject(project, dwarf, state) {
  if (!project || project.phase === 'complete') return false;

  project.workers.add(dwarf.id);

  // Phase 1: Dig out the area
  if (project.phase === 'digging') {
    for (const [key, dig] of project.digProgress) {
      if (dig.progress < dig.required) {
        const dist = Math.abs(dwarf.x - dig.x) + Math.abs(dwarf.y - dig.y);
        if (dist <= 1) {
          const skill = dwarf.skills?.[SKILL.MINING] || 0.3;
          dig.progress += 1 + skill * 2;

          if (dig.progress >= dig.required) {
            completeDig(dig.x, dig.y, state);
          }

          return false; // Still working
        }
      }
    }

    // Check if all digging is done
    let allDug = true;
    for (const [key, dig] of project.digProgress) {
      if (dig.progress < dig.required) {
        allDug = false;
        break;
      }
    }

    if (allDug) {
      project.phase = 'building';
    }
    return false;
  }

  // Phase 2: Build the structure
  if (project.phase === 'building') {
    const skill = project.blueprint.skill
      ? (dwarf.skills?.[project.blueprint.skill] || 0.3)
      : 0.5;

    project.progress += 1 + skill * 2;

    if (project.progress >= project.workRequired) {
      project.phase = 'furnishing';
      // Apply the blueprint to the map
      applyBlueprint(project, state);
    }

    return false;
  }

  // Phase 3: Furnishing (instant for now)
  if (project.phase === 'furnishing') {
    project.phase = 'complete';

    // Create structure record
    const structure = {
      id: project.id,
      type: project.type,
      name: project.blueprint.name,
      x: project.x,
      y: project.y,
      width: project.width,
      height: project.height,
      complete: true,
      builtBy: project.initiatorName,
      skill: project.blueprint.skill,
    };

    structures.push(structure);

    // Remove from projects
    const idx = buildProjects.indexOf(project);
    if (idx !== -1) buildProjects.splice(idx, 1);

    addLog(state, `${project.blueprint.name} has been completed!`);

    // Skill improvement
    if (project.blueprint.skill && dwarf.skills) {
      dwarf.skills[project.blueprint.skill] = Math.min(1,
        (dwarf.skills[project.blueprint.skill] || 0.2) + 0.03
      );
    }

    return true;
  }

  return false;
}

/**
 * Apply blueprint tiles to the map
 */
function applyBlueprint(project, state) {
  const blueprint = project.blueprint;

  for (let dy = 0; dy < blueprint.size.h; dy++) {
    const row = blueprint.layout[dy];
    for (let dx = 0; dx < blueprint.size.w; dx++) {
      const char = row[dx];
      const tileTemplate = blueprint.tiles[char];

      if (tileTemplate) {
        const tx = project.x + dx;
        const ty = project.y + dy;
        const index = ty * state.map.width + tx;

        state.map.tiles[index] = { ...tileTemplate };

        // Mark as part of structure
        state.map.tiles[index].structureId = project.id;
      }
    }
  }

  // Add workshop marker at center if applicable
  if (blueprint.glyph) {
    const cx = project.x + Math.floor(blueprint.size.w / 2);
    const cy = project.y + Math.floor(blueprint.size.h / 2);
    const centerIndex = cy * state.map.width + cx;

    if (state.map.tiles[centerIndex]) {
      state.map.tiles[centerIndex].char = blueprint.glyph;
      state.map.tiles[centerIndex].fg = blueprint.glyphColor || '#ffffff';
    }
  }
}

// === AUTONOMOUS BUILDING DECISIONS ===

/**
 * Suggest a structure to build based on community needs
 */
export function suggestStructure(state) {
  const existingTypes = new Set(structures.map(s => s.type));
  const inProgressTypes = new Set(buildProjects.map(p => p.type));

  const dwarfCount = state.dwarves?.length || 0;

  // Priority list based on needs
  const needs = [];

  // Basic shelter if none exists
  if (!existingTypes.has(STRUCTURE_TYPE.SHELTER) && !inProgressTypes.has(STRUCTURE_TYPE.SHELTER)) {
    needs.push({ type: STRUCTURE_TYPE.SHELTER, priority: 90 });
  }

  // Dining hall for community
  if (dwarfCount >= 3 && !existingTypes.has(STRUCTURE_TYPE.DINING_HALL) && !inProgressTypes.has(STRUCTURE_TYPE.DINING_HALL)) {
    needs.push({ type: STRUCTURE_TYPE.DINING_HALL, priority: 75 });
  }

  // Food storage
  if (!existingTypes.has(STRUCTURE_TYPE.FOOD_STORAGE) && !inProgressTypes.has(STRUCTURE_TYPE.FOOD_STORAGE)) {
    needs.push({ type: STRUCTURE_TYPE.FOOD_STORAGE, priority: 70 });
  }

  // Workshops based on dwarf skills
  const skillCounts = {};
  for (const dwarf of state.dwarves || []) {
    if (dwarf.skills) {
      for (const [skill, level] of Object.entries(dwarf.skills)) {
        if (level > 0.4) {
          skillCounts[skill] = (skillCounts[skill] || 0) + 1;
        }
      }
    }
  }

  // Mason workshop if we have masons
  if (skillCounts[SKILL.MASONRY] && !existingTypes.has(STRUCTURE_TYPE.WORKSHOP_MASON) && !inProgressTypes.has(STRUCTURE_TYPE.WORKSHOP_MASON)) {
    needs.push({ type: STRUCTURE_TYPE.WORKSHOP_MASON, priority: 60 });
  }

  // Carpenter workshop
  if (skillCounts[SKILL.CARPENTRY] && !existingTypes.has(STRUCTURE_TYPE.WORKSHOP_CARPENTER) && !inProgressTypes.has(STRUCTURE_TYPE.WORKSHOP_CARPENTER)) {
    needs.push({ type: STRUCTURE_TYPE.WORKSHOP_CARPENTER, priority: 60 });
  }

  // Crafts workshop
  if (skillCounts[SKILL.CRAFTING] && !existingTypes.has(STRUCTURE_TYPE.WORKSHOP_CRAFTSDWARF) && !inProgressTypes.has(STRUCTURE_TYPE.WORKSHOP_CRAFTSDWARF)) {
    needs.push({ type: STRUCTURE_TYPE.WORKSHOP_CRAFTSDWARF, priority: 55 });
  }

  // Kitchen
  if (skillCounts[SKILL.COOKING] && !existingTypes.has(STRUCTURE_TYPE.WORKSHOP_KITCHEN) && !inProgressTypes.has(STRUCTURE_TYPE.WORKSHOP_KITCHEN)) {
    needs.push({ type: STRUCTURE_TYPE.WORKSHOP_KITCHEN, priority: 65 });
  }

  // Meeting hall for larger groups
  if (dwarfCount >= 5 && !existingTypes.has(STRUCTURE_TYPE.MEETING_HALL) && !inProgressTypes.has(STRUCTURE_TYPE.MEETING_HALL)) {
    needs.push({ type: STRUCTURE_TYPE.MEETING_HALL, priority: 45 });
  }

  // Bedrooms
  const bedroomCount = structures.filter(s => s.type === STRUCTURE_TYPE.BEDROOM).length;
  if (bedroomCount < dwarfCount && !inProgressTypes.has(STRUCTURE_TYPE.BEDROOM)) {
    needs.push({ type: STRUCTURE_TYPE.BEDROOM, priority: 50 + (dwarfCount - bedroomCount) * 5 });
  }

  // Sort by priority
  needs.sort((a, b) => b.priority - a.priority);

  return needs[0] || null;
}

/**
 * Find a suitable location for a structure
 */
export function findBuildLocation(structureType, state) {
  const blueprint = BLUEPRINTS[structureType];
  if (!blueprint) return null;

  // Find centroid of dwarves
  let avgX = 0, avgY = 0;
  const dwarves = state.dwarves || [];

  if (dwarves.length === 0) return null;

  for (const dwarf of dwarves) {
    avgX += dwarf.x;
    avgY += dwarf.y;
  }
  avgX = Math.floor(avgX / dwarves.length);
  avgY = Math.floor(avgY / dwarves.length);

  // Search in expanding rings
  for (let radius = 3; radius < 25; radius += 2) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 8) {
      const x = Math.floor(avgX + Math.cos(angle) * radius);
      const y = Math.floor(avgY + Math.sin(angle) * radius);

      if (canPlaceStructure(structureType, x, y, state)) {
        return { x, y };
      }
    }
  }

  return null;
}

/**
 * Suggest a workshop type based on dwarf's best skill
 * @param {object} dwarf
 * @returns {string|null} STRUCTURE_TYPE for a workshop or null
 */
function suggestWorkshopForSkill(dwarf) {
  if (!dwarf.skills) return null;

  // Map skills to workshop types
  const skillToWorkshop = {
    [SKILL.MASONRY]: STRUCTURE_TYPE.WORKSHOP_MASON,
    [SKILL.CARPENTRY]: STRUCTURE_TYPE.WORKSHOP_CARPENTER,
    [SKILL.CRAFTING]: STRUCTURE_TYPE.WORKSHOP_CRAFTSDWARF,
    [SKILL.COOKING]: STRUCTURE_TYPE.WORKSHOP_KITCHEN,
  };

  // Find dwarf's best skill above threshold
  let bestSkill = null;
  let bestLevel = 0.4; // Minimum threshold

  for (const [skill, level] of Object.entries(dwarf.skills)) {
    if (level > bestLevel && skillToWorkshop[skill]) {
      bestSkill = skill;
      bestLevel = level;
    }
  }

  if (!bestSkill) return null;

  const workshopType = skillToWorkshop[bestSkill];

  // Check if workshop already exists
  const existingTypes = new Set(structures.map(s => s.type));
  const inProgressTypes = new Set(buildProjects.map(p => p.type));

  if (existingTypes.has(workshopType) || inProgressTypes.has(workshopType)) {
    return null;
  }

  return workshopType;
}

/**
 * Have a dwarf autonomously decide to build something
 */
export function considerBuilding(dwarf, state) {
  // Don't start too many projects
  if (buildProjects.length >= 2) return null;

  // Check if dwarf is suited for building
  const hasBuildingSkill = (dwarf.skills?.[SKILL.MASONRY] || 0) > 0.3 ||
                           (dwarf.skills?.[SKILL.MINING] || 0) > 0.3;

  // Architects are more likely to build
  const isArchitect = dwarf.aspiration === 'architect';

  if (!hasBuildingSkill && !isArchitect && Math.random() > 0.1) return null;

  // First, check if dwarf should build a workshop matching their skill
  // Skilled dwarves prioritize building their own workshop
  const personalWorkshop = suggestWorkshopForSkill(dwarf);
  if (personalWorkshop && Math.random() < 0.6) {
    const location = findBuildLocation(personalWorkshop, state);
    if (location) {
      addLog(state, `${dwarf.name} decides to build a ${BLUEPRINTS[personalWorkshop].name}.`);
      return startBuildProject(personalWorkshop, location.x, location.y, state, dwarf);
    }
  }

  // Otherwise, get community-suggested structure
  const suggestion = suggestStructure(state);
  if (!suggestion) return null;

  // Find location
  const location = findBuildLocation(suggestion.type, state);
  if (!location) return null;

  // Start the project
  return startBuildProject(suggestion.type, location.x, location.y, state, dwarf);
}

// === STRUCTURE QUERIES ===

/**
 * Get structure at position
 */
export function getStructureAt(x, y) {
  for (const structure of structures) {
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
  return structures;
}

/**
 * Get active build projects
 */
export function getBuildProjects() {
  return buildProjects;
}

/**
 * Get incomplete structures (active projects)
 */
export function getIncompleteStructures() {
  return buildProjects.filter(p => p.phase !== 'complete');
}

/**
 * Get workshops of a type
 */
export function getWorkshops(type = null) {
  return structures.filter(s =>
    s.complete &&
    s.type.startsWith('workshop') &&
    (type === null || s.type === type)
  );
}

/**
 * Find nearest build project for a dwarf
 */
export function findNearestBuildProject(dwarf) {
  let nearest = null;
  let nearestDist = Infinity;

  for (const project of buildProjects) {
    if (project.phase === 'complete') continue;

    const dist = Math.abs(dwarf.x - project.x) + Math.abs(dwarf.y - project.y);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearest = project;
    }
  }

  return nearest;
}

/**
 * Find work location within a project
 */
export function findWorkLocation(project, dwarf) {
  if (project.phase === 'digging') {
    // Find incomplete dig
    for (const [key, dig] of project.digProgress) {
      if (dig.progress < dig.required) {
        return { x: dig.x, y: dig.y };
      }
    }
  }

  // Default to project center
  return {
    x: project.x + Math.floor(project.width / 2),
    y: project.y + Math.floor(project.height / 2)
  };
}

// === ROOM SUGGESTION (for AI) ===

/**
 * Suggest a simple dig room near dwarves
 */
export function suggestRoom(state, size = 5) {
  let avgX = 0, avgY = 0;
  const dwarves = state.dwarves || [];

  if (dwarves.length === 0) return null;

  for (const dwarf of dwarves) {
    avgX += dwarf.x;
    avgY += dwarf.y;
  }
  avgX = Math.floor(avgX / dwarves.length);
  avgY = Math.floor(avgY / dwarves.length);

  for (let radius = 3; radius < 15; radius++) {
    for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 4) {
      const cx = Math.floor(avgX + Math.cos(angle) * radius);
      const cy = Math.floor(avgY + Math.sin(angle) * radius);

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

// === HELPER ===

function getTileAt(x, y, state) {
  if (!state?.map) return null;
  if (x < 0 || x >= state.map.width || y < 0 || y >= state.map.height) {
    return null;
  }
  return state.map.tiles[y * state.map.width + x];
}
