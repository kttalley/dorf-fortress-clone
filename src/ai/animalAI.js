/**
 * Animal AI - Behavior System for Animals
 * Pure state machine, no LLM
 * Animals make decisions based on simple rules and drives
 */

import { distance } from '../sim/entities.js';
import { getTile } from '../map/map.js';
import { getTileDef } from '../map/tiles.js';
import { satisfyDrive, stimulateDrive, decayDrives } from '../sim/drives.js';
import { executeSmartMovement, moveToward, findPath } from '../sim/movement.js';
import {
  shouldHunt,
  isFleeing,
  isHungry,
  canMate,
  ageAnimal,
  createAnimalOffspring,
} from '../sim/animals.js';
import { emit, EVENTS } from '../events/eventBus.js';

// === ANIMAL STATES ===
export const ANIMAL_STATE = {
  IDLE: 'idle',
  WANDERING: 'wandering',
  GRAZING: 'grazing',
  FLEEING: 'fleeing',
  HUNTING: 'hunting',
  SEEKING_MATE: 'seeking_mate',
  MATING: 'mating',
  DEAD: 'dead',
};

// === ANIMAL AI DECISION LOGIC ===

/**
 * Decide what an animal should do (called every decision interval, e.g., 10 ticks)
 */
export function decideAnimal(animal, state) {
  if (animal.hp <= 0 || animal.state === 'dead') {
    return;
  }

  const { hunger, fear, territoriality, reproduction } = animal.drives;

  // PRIORITY 1: IMMEDIATE THREAT
  if (fear > 60) {
    const threat = animal.recentlyPerceivedThreat;
    if (threat && distance(animal, threat.entity) < animal.perceptionRadius) {
      const safePos = findSafePosition(animal, threat.entity, state);
      animal.state = ANIMAL_STATE.FLEEING;
      animal.target = safePos;
      return;
    }
  }

  // PRIORITY 2: HUNT (if carnivore and hungry)
  if (shouldHunt(animal)) {
    const prey = findPreyNearby(animal, state);
    if (prey) {
      animal.state = ANIMAL_STATE.HUNTING;
      animal.target = prey;
      return;
    }
  }

  // PRIORITY 3: HUNGER (herbivore grazing or carnivore food seeking)
  if (hunger > 70) {
    if (animal.species.diet === 'herbivore') {
      animal.state = ANIMAL_STATE.GRAZING;
      animal.target = null; // Wander while grazing
      return;
    } else {
      // Carnivore already handled above (hunting)
      // If no prey found, wander
      animal.state = ANIMAL_STATE.WANDERING;
      animal.target = null;
      return;
    }
  }

  // PRIORITY 4: REPRODUCTION
  if (animal.canReproduce && reproduction > 80) {
    const mate = findMateNearby(animal, state);
    if (mate && distance(animal, mate) < 2) {
      animal.state = ANIMAL_STATE.MATING;
      animal.target = mate;
      animal._matePartner = mate.id;
      return;
    } else if (mate) {
      animal.state = ANIMAL_STATE.SEEKING_MATE;
      animal.target = mate;
      return;
    }
  }

  // PRIORITY 5: TERRITORY (return to territory marker if far)
  if (territoriality > 50 && animal.territoryMarker) {
    const distToTerritory = distance(animal, animal.territoryMarker);
    if (distToTerritory > 12) {
      animal.state = ANIMAL_STATE.WANDERING;
      animal.target = animal.territoryMarker;
      return;
    }
  }

  // DEFAULT: IDLE OR WANDER
  animal.state = ANIMAL_STATE.IDLE;
  animal.target = null;
}

/**
 * Execute animal's action (called every tick)
 */
export function actAnimal(animal, state) {
  if (animal.hp <= 0 || animal.state === ANIMAL_STATE.DEAD) {
    return;
  }

  switch (animal.state) {
    case ANIMAL_STATE.GRAZING:
      return actGrazing(animal, state);

    case ANIMAL_STATE.HUNTING:
      return actHunting(animal, state);

    case ANIMAL_STATE.FLEEING:
      return actFleeing(animal, state);

    case ANIMAL_STATE.MATING:
      return actMating(animal, state);

    case ANIMAL_STATE.SEEKING_MATE:
      return actSeekingMate(animal, state);

    case ANIMAL_STATE.WANDERING:
      return actWandering(animal, state);

    case ANIMAL_STATE.IDLE:
    default:
      return actIdle(animal, state);
  }
}

// === ANIMAL ACTIONS ===

/**
 * Animal grazes on nearby vegetation
 */
function actGrazing(animal, state) {
  // Check if on grass
  const tile = getTile(animal.x, animal.y, state.map);

  if (tile.type === 'grass' || tile.type === 'shrub') {
    // Eating! Satisfy hunger
    satisfyDrive(animal, 'hunger', 5);
    return;
  }

  // Look for grass nearby
  if (animal.drives.hunger > 50) {
    const grassTile = findNearestTile(animal, state.map, state, t => t.type === 'grass' || t.type === 'shrub');
    if (grassTile) {
      const nextTile = executeSmartMovement(animal, grassTile, state);
      if (nextTile) {
        animal.x = nextTile.x;
        animal.y = nextTile.y;
      }
    }
  }
}

/**
 * Animal hunts prey
 */
function actHunting(animal, state) {
  const prey = state.animals?.find(a => a.id === animal.target?.id) ||
    state.dwarves?.find(d => d.id === animal.target?.id);

  if (!prey || prey.hp <= 0) {
    // Prey dead or gone
    animal.state = ANIMAL_STATE.IDLE;
    animal.target = null;
    return;
  }

  const dist = distance(animal, prey);

  // CHASE PHASE: move toward prey
  if (dist > 1) {
    const nextTile = executeSmartMovement(animal, prey, state);
    if (nextTile) {
      animal.x = nextTile.x;
      animal.y = nextTile.y;
    }
    return;
  }

  // ATTACK PHASE: in range
  const hitChance = animal.species.size === 'large' ? 0.7 : animal.species.size === 'medium' ? 0.5 : 0.3;

  if (Math.random() < hitChance) {
    // Hit!
    const damage = animal.damage * (0.8 + Math.random() * 0.4);
    prey.hp -= damage;

    emit(EVENTS.ANIMAL_ATTACKED, {
      animal,
      target: prey,
      damage,
    });

    if (prey.hp <= 0) {
      // Prey killed
      satisfyDrive(animal, 'hunger', 40);
      animal.state = ANIMAL_STATE.IDLE;
      animal.target = null;

      emit(EVENTS.ANIMAL_KILLED, {
        predator: animal,
        prey,
      });
    }
  }
}

/**
 * Animal flees from threat
 */
function actFleeing(animal, state) {
  const threat = animal.recentlyPerceivedThreat;

  if (!threat || distance(animal, threat.entity) > animal.perceptionRadius + 5) {
    // Threat gone, safe now
    animal.state = ANIMAL_STATE.IDLE;
    animal.target = null;
    stimulateDrive(animal, 'fear', -30); // Reduce fear over time
    return;
  }

  // Move away from threat
  const away = {
    x: animal.x + (animal.x - threat.entity.x) * 2,
    y: animal.y + (animal.y - threat.entity.y) * 2,
  };

  const nextTile = moveToward(animal, away, state.map);
  if (nextTile) {
    animal.x = nextTile.x;
    animal.y = nextTile.y;
  }
}

/**
 * Animal seeks mate
 */
function actSeekingMate(animal, state) {
  const mate = state.animals?.find(a => a.id === animal.target?.id);

  if (!mate) {
    animal.state = ANIMAL_STATE.IDLE;
    animal.target = null;
    return;
  }

  // Move toward mate
  const nextTile = executeSmartMovement(animal, mate, state);
  if (nextTile) {
    animal.x = nextTile.x;
    animal.y = nextTile.y;
  }

  // If in range, transition to mating
  if (distance(animal, mate) < 2) {
    animal.state = ANIMAL_STATE.MATING;
  }
}

/**
 * Animal mates
 */
function actMating(animal, state) {
  if (!animal._matePartner) {
    animal.state = ANIMAL_STATE.IDLE;
    return;
  }

  const mate = state.animals?.find(a => a.id === animal._matePartner);

  if (!mate || !canMate(animal, mate) || distance(animal, mate) > 2) {
    animal.state = ANIMAL_STATE.IDLE;
    animal._matePartner = null;
    return;
  }

  // Small probability to produce offspring each tick (1% per tick ≈ 1% per second)
  if (Math.random() < 0.01) {
    const offspring = createAnimalOffspring(animal, mate, state);
    state.animals?.push(offspring);

    // Both parents' reproduction drive reset
    satisfyDrive(animal, 'reproduction', 100);
    satisfyDrive(mate, 'reproduction', 100);

    emit(EVENTS.ANIMAL_BORN, {
      offspring,
      parents: [animal, mate],
    });

    animal.state = ANIMAL_STATE.IDLE;
    animal._matePartner = null;
  }
}

/**
 * Animal wanders
 */
function actWandering(animal, state) {
  // Slow random walk
  if (Math.random() < 0.3) {
    const dirs = [
      { x: 1, y: 0 },
      { x: -1, y: 0 },
      { x: 0, y: 1 },
      { x: 0, y: -1 },
    ];

    const dir = dirs[Math.floor(Math.random() * dirs.length)];
    const nextX = animal.x + dir.x;
    const nextY = animal.y + dir.y;

    if (isWalkable(nextX, nextY, state.map)) {
      animal.x = nextX;
      animal.y = nextY;
    }
  }
}

/**
 * Animal idles (rests)
 */
function actIdle(animal, state) {
  // Just stand here
  // Drives decay naturally over time
}

// === HELPER FUNCTIONS ===

/**
 * Find safe position away from threat
 */
function findSafePosition(animal, threat, state) {
  const away = {
    x: animal.x + (animal.x - threat.x) * 3,
    y: animal.y + (animal.y - threat.y) * 3,
  };

  // Clamp to map
  away.x = Math.max(0, Math.min(state.map.width - 1, away.x));
  away.y = Math.max(0, Math.min(state.map.height - 1, away.y));

  return away;
}

/**
 * Find nearby prey
 */
function findPreyNearby(animal, state) {
  let nearest = null;
  let nearestDist = Infinity;

  const preySubs = animal.species.prey || [];

  if (state.animals) {
    for (const other of state.animals) {
      if (other.id === animal.id) continue;
      if (!preySubs.includes(other.subtype)) continue;

      const dist = distance(animal, other);
      if (dist < Math.min(nearestDist, animal.perceptionRadius)) {
        nearest = other;
        nearestDist = dist;
      }
    }
  }

  return nearest;
}

/**
 * Find nearby mate
 */
function findMateNearby(animal, state) {
  let nearest = null;
  let nearestDist = Infinity;

  if (state.animals) {
    for (const other of state.animals) {
      if (other.id === animal.id) continue;
      if (other.subtype !== animal.subtype) continue;
      if (other.sex === animal.sex) continue;
      if (!other.canReproduce || other.hp <= 0) continue;

      const dist = distance(animal, other);
      if (dist < Math.min(nearestDist, animal.perceptionRadius)) {
        nearest = other;
        nearestDist = dist;
      }
    }
  }

  return nearest;
}

/**
 * Find nearest tile of type
 */
function findNearestTile(animal, map, state, predicate) {
  let nearest = null;
  let nearestDist = Infinity;
  const radius = 15;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = animal.x + dx;
      const ny = animal.y + dy;

      if (nx < 0 || nx >= map.width || ny < 0 || ny >= map.height) continue;

      const tile = getTile(nx, ny, map);
      if (predicate(tile)) {
        const dist = Math.abs(dx) + Math.abs(dy);
        if (dist < nearestDist) {
          nearest = { x: nx, y: ny };
          nearestDist = dist;
        }
      }
    }
  }

  return nearest;
}

/**
 * Check if tile is walkable
 */
function isWalkable(x, y, map) {
  if (x < 0 || x >= map.width || y < 0 || y >= map.height) return false;

  const tile = getTile(x, y, map);
  const tileDef = getTileDef(tile.type);

  return !tileDef?.obstruction;
}
