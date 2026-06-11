/**
 * Visitor AI - Behavior System for External Visitors
 * Handles decision-making for humans (merchants), goblins (raiders), and elves (missionaries)
 */

import { distance } from '../sim/entities.js';
import { VISITOR_STATE, shouldFlee, isSatisfied, addSatisfaction } from '../sim/visitors.js';
import { VISITOR_ROLE, RACE } from '../sim/races.js';
import { findFortressCenter, findExitPosition, isNearEdge } from '../sim/edges.js';
import { findNearestDwarf, inAttackRange, attemptAttack } from '../sim/combat.js';
import { isPassable, canAffordMove, findPath } from '../sim/movement.js';
import { ensureItinerary, currentStop, advanceStop, findMarketSpot } from './itineraries.js';
import { queueEventForNarration } from '../llm/eventNarrator.js';
import { addLog } from '../state/store.js';
import { emit, EVENTS } from '../events/eventBus.js';

// Configuration
const CONFIG = {
  ARRIVING_DISTANCE: 3,        // Distance from fortress to switch from arriving to active
  INTERACTION_RANGE: 2,        // Range for social interactions
  ATTACK_RANGE: 1,             // Must be adjacent to attack
  FLEE_EDGE_DISTANCE: 2,       // How close to edge to despawn
  SATISFACTION_PER_TRADE: 25,  // Satisfaction gained per trade
  SATISFACTION_PER_PREACH: 15, // Satisfaction gained per preach
  SATISFACTION_PER_LOOT: 20,   // Satisfaction gained per successful attack
  SCOUT_OBSERVE_TICKS: 100,    // How long scouts observe before leaving
  STOP_REACH: 2,               // Close enough to an itinerary stop to linger
  STOP_TIMEOUT_TICKS: 300,     // Give up on an unreachable stop
  PATH_MAX_NODES: 600,         // A* search budget per leg (audit WALK R9)
};

/**
 * Main decision function for visitors - called each tick
 */
export function decideVisitor(visitor, state) {
  // Handle dead visitors
  if (visitor.state === VISITOR_STATE.DEAD) {
    return { state: VISITOR_STATE.DEAD, target: null };
  }

  // Check for fleeing condition
  if (shouldFlee(visitor)) {
    return decideFlee(visitor, state);
  }

  // Check if satisfied and ready to leave
  if (isSatisfied(visitor)) {
    return decideLeave(visitor, state);
  }

  // Itinerary stops come before role business (audit WALK R9): scouts orbit
  // observation points, elves sightsee landmarks, merchants detour past one
  ensureItinerary(visitor, state);
  const stop = currentStop(visitor);
  if (stop) {
    const touring = decideTouring(visitor, stop, state);
    if (touring) return touring;
    // Stop abandoned/finished this tick: fall through to role logic
  }

  // Role-specific decisions
  switch (visitor.role) {
    case VISITOR_ROLE.MERCHANT:
      return decideMerchant(visitor, state);
    case VISITOR_ROLE.CARAVAN_GUARD:
      return decideGuard(visitor, state);
    case VISITOR_ROLE.RAIDER:
      return decideRaider(visitor, state);
    case VISITOR_ROLE.SCOUT:
      return decideScout(visitor, state);
    case VISITOR_ROLE.MISSIONARY:
      return decideMissionary(visitor, state);
    case VISITOR_ROLE.DIPLOMAT:
      return decideDiplomat(visitor, state);
    default:
      return decideDefault(visitor, state);
  }
}

/**
 * Execute visitor action based on current state
 */
export function actVisitor(visitor, state) {
  switch (visitor.state) {
    case VISITOR_STATE.ARRIVING:
      return actArriving(visitor, state);
    case VISITOR_STATE.TOURING:
      return actTouring(visitor, state);
    case VISITOR_STATE.TRADING:
      return actTrading(visitor, state);
    case VISITOR_STATE.RAIDING:
      return actRaiding(visitor, state);
    case VISITOR_STATE.PREACHING:
      return actPreaching(visitor, state);
    case VISITOR_STATE.FIGHTING:
      return actFighting(visitor, state);
    case VISITOR_STATE.FLEEING:
      return actFleeing(visitor, state);
    case VISITOR_STATE.LEAVING:
      return actLeaving(visitor, state);
    default:
      return actDefault(visitor, state);
  }
}

// ========== ITINERARY (TOURING) DECISIONS ==========

/**
 * Walk to / linger at the current itinerary stop (audit WALK R9).
 * Returns a decision while the stop is live, or null when the stop was
 * finished or abandoned this tick (caller falls through to role logic).
 */
function decideTouring(visitor, stop, state) {
  // Give up on stops that can't be reached (walled-off vantage point)
  visitor._stopTicks = (visitor._stopTicks || 0) + 1;
  if (visitor._stopTicks > CONFIG.STOP_TIMEOUT_TICKS) {
    advanceStop(visitor);
    return null;
  }

  // Skittish observers (scouts) abandon a stop when dwarves close in
  if (stop.skittish) {
    const nearest = findNearestDwarf(visitor, state);
    if (nearest && distance(visitor, nearest) < 5) {
      advanceStop(visitor);
      return null;
    }
  }

  if (distance(visitor, stop) <= CONFIG.STOP_REACH) {
    // Arrived: narrate once, then linger
    if (!visitor._stopNarrated && stop.narrate) {
      visitor._stopNarrated = true;
      narrateStopVisit(visitor, stop, state);
    }
    visitor._lingerTicks = (visitor._lingerTicks || 0) + 1;
    addSatisfaction(visitor, stop.satisfaction || 0.3);
    if (visitor._lingerTicks >= (stop.linger || 15)) {
      advanceStop(visitor);
      return null;
    }
    return { state: VISITOR_STATE.TOURING, target: { x: stop.x, y: stop.y } };
  }

  return { state: VISITOR_STATE.TOURING, target: { x: stop.x, y: stop.y } };
}

/**
 * Feed the sightseeing line to the live log and the day-end narrator —
 * "Aelindra the elf lingered at the Crystal Hollow" is chronicle material
 */
function narrateStopVisit(visitor, stop, state) {
  const name = visitor.generatedName || visitor.name || `a ${visitor.race}`;
  const message = visitor.role === VISITOR_ROLE.SCOUT
    ? `${name} was seen watching the camp from ${stop.name}.`
    : `${name} lingered at ${stop.name}.`;
  addLog(state, message);
  queueEventForNarration({ tick: state.tick || 0, message, type: 'visit' });
}

// ========== MERCHANT DECISIONS ==========

function decideMerchant(visitor, state) {
  // Merchants head for the market, not the raw dwarf centroid (audit R9):
  // a completed hall, else the landmark nearest camp, else the camp itself
  const market = findMarketSpot(state);

  switch (visitor.state) {
    case VISITOR_STATE.ARRIVING:
    case VISITOR_STATE.TOURING: {
      const distToMarket = distance(visitor, market);
      if (distToMarket <= CONFIG.ARRIVING_DISTANCE) {
        // Reached the market, set up shop
        return { state: VISITOR_STATE.TRADING, target: market };
      }
      return { state: VISITOR_STATE.ARRIVING, target: market };
    }

    case VISITOR_STATE.TRADING: {
      // Look for dwarves to trade with
      const nearbyDwarf = findNearestDwarf(visitor, state);
      if (nearbyDwarf && distance(visitor, nearbyDwarf) <= CONFIG.INTERACTION_RANGE) {
        // Trade interaction
        addSatisfaction(visitor, CONFIG.SATISFACTION_PER_TRADE * 0.2);
        visitor.interactionCount++;
      }
      return { state: VISITOR_STATE.TRADING, target: market };
    }

    default:
      return { state: VISITOR_STATE.ARRIVING, target: market };
  }
}

// ========== GUARD DECISIONS ==========

function decideGuard(visitor, state) {
  // Find the merchant we're protecting
  const merchant = findGroupMerchant(visitor, state);
  const fortressCenter = findFortressCenter(state);

  // Check for threats
  const threat = findNearestThreatToGroup(visitor, state);
  if (threat && distance(visitor, threat) <= 6) {
    return { state: VISITOR_STATE.FIGHTING, target: threat };
  }

  if (merchant) {
    // Stay near merchant
    if (distance(visitor, merchant) > 3) {
      return { state: VISITOR_STATE.ACTIVE, target: { x: merchant.x, y: merchant.y } };
    }
  }

  return { state: VISITOR_STATE.ACTIVE, target: fortressCenter };
}

// ========== RAIDER DECISIONS ==========

function decideRaider(visitor, state) {
  // Find a target
  const target = findNearestDwarf(visitor, state);

  if (!target) {
    // No targets, wander and eventually leave
    addSatisfaction(visitor, 5);
    return { state: VISITOR_STATE.RAIDING, target: null };
  }

  const dist = distance(visitor, target);

  if (dist <= CONFIG.ATTACK_RANGE) {
    // Attack!
    return { state: VISITOR_STATE.FIGHTING, target };
  }

  // Move toward target
  return { state: VISITOR_STATE.RAIDING, target: { x: target.x, y: target.y } };
}

// ========== SCOUT DECISIONS ==========

function decideScout(visitor, state) {
  // Initialize scout timer
  if (!visitor.scoutTicks) {
    visitor.scoutTicks = 0;
  }

  visitor.scoutTicks++;

  // Scouts observe then leave
  if (visitor.scoutTicks >= CONFIG.SCOUT_OBSERVE_TICKS) {
    visitor.satisfaction = visitor.satisfactionThreshold;
    return decideLeave(visitor, state);
  }

  // Avoid dwarves while observing
  const nearestDwarf = findNearestDwarf(visitor, state);
  if (nearestDwarf && distance(visitor, nearestDwarf) < 5) {
    // Move away
    const awayX = visitor.x + (visitor.x - nearestDwarf.x);
    const awayY = visitor.y + (visitor.y - nearestDwarf.y);
    return { state: VISITOR_STATE.ACTIVE, target: { x: awayX, y: awayY } };
  }

  // Wander and observe
  addSatisfaction(visitor, 1);
  return { state: VISITOR_STATE.ACTIVE, target: null };
}

// ========== MISSIONARY DECISIONS ==========

function decideMissionary(visitor, state) {
  const fortressCenter = findFortressCenter(state);

  switch (visitor.state) {
    case VISITOR_STATE.ARRIVING:
      const distToCenter = distance(visitor, fortressCenter);
      if (distToCenter <= CONFIG.ARRIVING_DISTANCE + 2) {
        return { state: VISITOR_STATE.PREACHING, target: null };
      }
      return { state: VISITOR_STATE.ARRIVING, target: fortressCenter };

    case VISITOR_STATE.PREACHING:
      // Find a dwarf to preach to
      const dwarf = findUnpreachedDwarf(visitor, state);
      if (dwarf) {
        const dist = distance(visitor, dwarf);
        if (dist <= CONFIG.INTERACTION_RANGE) {
          // Preach!
          addSatisfaction(visitor, CONFIG.SATISFACTION_PER_PREACH);
          visitor.memory.interactedWith.add(dwarf.id);
          visitor.interactionCount++;
          return { state: VISITOR_STATE.PREACHING, target: { x: dwarf.x, y: dwarf.y } };
        }
        return { state: VISITOR_STATE.PREACHING, target: { x: dwarf.x, y: dwarf.y } };
      }
      // No one left to preach to
      return { state: VISITOR_STATE.PREACHING, target: fortressCenter };

    default:
      return { state: VISITOR_STATE.ARRIVING, target: fortressCenter };
  }
}

// ========== DIPLOMAT DECISIONS ==========

function decideDiplomat(visitor, state) {
  const fortressCenter = findFortressCenter(state);

  switch (visitor.state) {
    case VISITOR_STATE.ARRIVING:
      const distToCenter = distance(visitor, fortressCenter);
      if (distToCenter <= CONFIG.ARRIVING_DISTANCE) {
        // Deliver message
        emit(EVENTS.DIPLOMACY_MESSAGE, { visitor, race: visitor.race });
        addSatisfaction(visitor, visitor.satisfactionThreshold);
        return decideLeave(visitor, state);
      }
      return { state: VISITOR_STATE.ARRIVING, target: fortressCenter };

    default:
      return { state: VISITOR_STATE.ARRIVING, target: fortressCenter };
  }
}

// ========== FLEE & LEAVE DECISIONS ==========

function decideFlee(visitor, state) {
  const exitPos = findExitPosition(visitor, state.map);
  visitor.state = VISITOR_STATE.FLEEING;

  emit(EVENTS.COMBAT_FLEE, { visitor });

  return {
    state: VISITOR_STATE.FLEEING,
    target: exitPos ? { x: exitPos.x, y: exitPos.y } : null,
  };
}

function decideLeave(visitor, state) {
  const exitPos = findExitPosition(visitor, state.map);

  emit(EVENTS.VISITOR_LEAVING, { visitor });

  return {
    state: VISITOR_STATE.LEAVING,
    target: exitPos ? { x: exitPos.x, y: exitPos.y } : null,
  };
}

function decideDefault(visitor, state) {
  const fortressCenter = findFortressCenter(state);
  return { state: VISITOR_STATE.ARRIVING, target: fortressCenter };
}

// ========== ACTION FUNCTIONS ==========

function actArriving(visitor, state) {
  if (!visitor.target) {
    visitor.target = findFortressCenter(state);
  }

  moveAlongPath(visitor, state);
}

function actTouring(visitor, state) {
  if (!visitor.target) return;

  if (distance(visitor, visitor.target) <= CONFIG.STOP_REACH) {
    // Lingering: an occasional shuffle so they look alive, not frozen
    if (Math.random() < 0.06) {
      const dx = Math.floor(Math.random() * 3) - 1;
      const dy = Math.floor(Math.random() * 3) - 1;
      tryMove(visitor, visitor.x + dx, visitor.y + dy, state);
    }
    return;
  }

  moveAlongPath(visitor, state);
}

function actTrading(visitor, state) {
  // Stay near trading spot, occasionally move
  if (Math.random() < 0.1) {
    const dx = Math.floor(Math.random() * 3) - 1;
    const dy = Math.floor(Math.random() * 3) - 1;
    tryMove(visitor, visitor.x + dx, visitor.y + dy, state);
  }

  // Passive satisfaction gain while trading
  addSatisfaction(visitor, 0.5);
}

function actRaiding(visitor, state) {
  if (visitor.target) {
    moveTowardTarget(visitor, state);
  } else {
    // Wander looking for targets
    const dx = Math.floor(Math.random() * 3) - 1;
    const dy = Math.floor(Math.random() * 3) - 1;
    tryMove(visitor, visitor.x + dx, visitor.y + dy, state);
  }
}

function actPreaching(visitor, state) {
  if (visitor.target) {
    moveTowardTarget(visitor, state);
  }
}

function actFighting(visitor, state) {
  const target = visitor.target;

  if (!target || target.hp <= 0 || target.state === 'dead') {
    // Target dead or gone
    addSatisfaction(visitor, CONFIG.SATISFACTION_PER_LOOT);
    visitor.state = visitor.role === VISITOR_ROLE.RAIDER ? VISITOR_STATE.RAIDING : VISITOR_STATE.ACTIVE;
    visitor.target = null;
    return;
  }

  const dist = distance(visitor, target);

  if (dist <= CONFIG.ATTACK_RANGE) {
    // Attack
    const result = attemptAttack(visitor, target, state);
    if (result.killed) {
      addSatisfaction(visitor, CONFIG.SATISFACTION_PER_LOOT * 2);
    } else if (result.success) {
      addSatisfaction(visitor, CONFIG.SATISFACTION_PER_LOOT * 0.5);
    }
  } else {
    // Move toward target
    moveTowardTarget(visitor, state);
  }
}

function actFleeing(visitor, state) {
  if (!visitor.target) {
    visitor.target = findExitPosition(visitor, state.map);
  }

  moveTowardTarget(visitor, state);

  // Check if reached edge
  if (isNearEdge(visitor.x, visitor.y, state.map, CONFIG.FLEE_EDGE_DISTANCE)) {
    visitor.state = VISITOR_STATE.DEAD; // Remove from map
    emit(EVENTS.VISITOR_LEFT, { visitor, reason: 'fled' });
  }
}

function actLeaving(visitor, state) {
  if (!visitor.target) {
    visitor.target = findExitPosition(visitor, state.map);
  }

  moveAlongPath(visitor, state);

  // Check if reached edge
  if (isNearEdge(visitor.x, visitor.y, state.map, CONFIG.FLEE_EDGE_DISTANCE)) {
    visitor.state = VISITOR_STATE.DEAD; // Remove from map
    emit(EVENTS.VISITOR_LEFT, { visitor, reason: 'satisfied' });
  }
}

function actDefault(visitor, state) {
  // Wander
  if (Math.random() < 0.3) {
    const dx = Math.floor(Math.random() * 3) - 1;
    const dy = Math.floor(Math.random() * 3) - 1;
    tryMove(visitor, visitor.x + dx, visitor.y + dy, state);
  }
}

// ========== HELPER FUNCTIONS ==========

/**
 * Path-following movement (audit WALK R9 — first real caller of the A*
 * findPath that has sat unused in movement.js since it was written).
 * Computes a path to visitor.target once, walks it step by step, and only
 * recomputes when the goal changes or the route breaks. Transient blocks
 * (another visitor in the cell, terrain moveCost throttling) keep the path
 * and simply wait; a missing/failed path falls back to the greedy stepper.
 */
function moveAlongPath(visitor, state) {
  const target = visitor.target;
  if (!target) return;

  const goal = visitor._pathGoal;
  const goalChanged = !goal || goal.x !== target.x || goal.y !== target.y;
  const pathDone = !Array.isArray(visitor._path) || (visitor._pathIdx ?? 0) >= visitor._path.length;

  if (goalChanged || pathDone) {
    visitor._path = findPath(visitor.x, visitor.y, target.x, target.y, state, CONFIG.PATH_MAX_NODES);
    visitor._pathGoal = { x: target.x, y: target.y };
    visitor._pathIdx = 1; // index 0 is the tile we're standing on
  }

  const path = visitor._path;
  if (path && visitor._pathIdx < path.length) {
    let step = path[visitor._pathIdx];
    // Already on this step (e.g., after a recompute): advance
    if (step && step.x === visitor.x && step.y === visitor.y) {
      visitor._pathIdx++;
      step = path[visitor._pathIdx];
    }

    if (step) {
      if (tryMove(visitor, step.x, step.y, state)) {
        visitor._pathIdx++;
        return;
      }
      if (isPassable(state, step.x, step.y)) {
        // Transient block (visitor collision / move budget): wait it out
        return;
      }
      // Terrain changed under the route: rebuild next tick
      visitor._path = null;
    }
  }

  // No path found (or exhausted while off-goal): greedy fallback
  moveTowardTarget(visitor, state);
}

function moveTowardTarget(visitor, state) {
  if (!visitor.target) return;

  const dx = Math.sign(visitor.target.x - visitor.x);
  const dy = Math.sign(visitor.target.y - visitor.y);

  // Try direct movement
  if (tryMove(visitor, visitor.x + dx, visitor.y + dy, state)) return;

  // Try horizontal
  if (dx !== 0 && tryMove(visitor, visitor.x + dx, visitor.y, state)) return;

  // Try vertical
  if (dy !== 0 && tryMove(visitor, visitor.x, visitor.y + dy, state)) return;

  // Try diagonal alternatives
  if (tryMove(visitor, visitor.x + dx, visitor.y - dy, state)) return;
  if (tryMove(visitor, visitor.x - dx, visitor.y + dy, state)) return;
}

function tryMove(visitor, newX, newY, state) {
  // Single walkability source (movement.js, backed by tile defs)
  if (!isPassable(state, newX, newY)) {
    return false;
  }

  // Check for collisions with other visitors
  const collision = state.visitors?.some(v =>
    v !== visitor && v.state !== VISITOR_STATE.DEAD && v.x === newX && v.y === newY
  );
  if (collision) return false;

  // Honor terrain moveCost (marsh/snow slow visitors too)
  if (!canAffordMove(visitor, state, newX, newY)) {
    return false;
  }

  // Move
  visitor.x = newX;
  visitor.y = newY;
  return true;
}

function findGroupMerchant(guard, state) {
  if (!guard.groupId || !state.visitors) return null;

  return state.visitors.find(v =>
    v.groupId === guard.groupId &&
    v.role === VISITOR_ROLE.MERCHANT &&
    v.state !== VISITOR_STATE.DEAD
  );
}

function findNearestThreatToGroup(guard, state) {
  // For now, guards don't perceive dwarves as threats unless attacked
  // This could be expanded
  return null;
}

function findUnpreachedDwarf(missionary, state) {
  if (!state.dwarves) return null;

  for (const dwarf of state.dwarves) {
    if (dwarf.hp <= 0) continue;
    if (missionary.memory.interactedWith.has(dwarf.id)) continue;
    return dwarf;
  }

  return null;
}

/**
 * Process all visitors for a tick
 */
export function processVisitors(state) {
  if (!state.visitors) return;

  for (const visitor of state.visitors) {
    if (visitor.state === VISITOR_STATE.DEAD) continue;

    // Decide action
    const decision = decideVisitor(visitor, state);
    visitor.state = decision.state;
    visitor.target = decision.target;

    // Execute action
    actVisitor(visitor, state);
  }
}
