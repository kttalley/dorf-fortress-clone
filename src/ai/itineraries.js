/**
 * Visitor itineraries — waypoints with purpose (audit WALK R9)
 *
 * Visitors stop being beelines: merchants head for a market spot and may
 * detour past a landmark, goblin scouts orbit the settlement visiting
 * observation points, and elves sightsee — "the elf lingered at the Crystal
 * Hollow" is exactly the kind of line the chronicle wants, and Phase 4's
 * named landmarks finally give them somewhere to linger.
 *
 * An itinerary is a list of stops walked BEFORE the visitor's role logic
 * takes over (trading, preaching...). Raiders don't sightsee.
 */

import { VISITOR_ROLE, RACE } from '../sim/races.js';
import { findFortressCenter } from '../sim/edges.js';
import { getStructures } from '../sim/construction.js';

const manhattan = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

/**
 * Where commerce happens: a completed structure's center, else the landmark
 * nearest the fortress center, else the fortress center itself.
 * Merchants target this instead of the raw dwarf centroid (audit R9).
 */
export function findMarketSpot(state) {
  const center = findFortressCenter(state);

  for (const s of getStructures()) {
    if (s.complete) {
      return {
        x: s.x + Math.floor((s.width || 1) / 2),
        y: s.y + Math.floor((s.height || 1) / 2),
        name: s.name ? `the ${s.name}` : 'the hall',
      };
    }
  }

  let best = null;
  let bestDist = Infinity;
  for (const landmark of state.landmarks || []) {
    const dist = manhattan(landmark, center);
    if (dist < bestDist) {
      bestDist = dist;
      best = landmark;
    }
  }
  if (best && bestDist <= 25) {
    return { x: best.x, y: best.y, name: best.name };
  }

  return { x: center.x, y: center.y, name: 'the camp' };
}

/**
 * Clamp a point into the map's walk margin
 */
function clampToMap(map, x, y) {
  return {
    x: Math.max(1, Math.min(map.width - 2, Math.round(x))),
    y: Math.max(1, Math.min(map.height - 2, Math.round(y))),
  };
}

/**
 * The N landmarks nearest a position
 */
function nearestLandmarks(state, pos, count) {
  return [...(state.landmarks || [])]
    .sort((a, b) => manhattan(a, pos) - manhattan(b, pos))
    .slice(0, count);
}

/**
 * Build the stop list for one visitor. Deterministic given Math.random.
 * Stop shape: { x, y, name, linger, satisfaction, narrate, skittish }
 *   linger       - ticks to spend at the stop once within reach
 *   satisfaction - satisfaction gained per linger tick
 *   narrate      - queue a chronicle line on arrival
 *   skittish     - abandon the stop early if a dwarf comes close (scouts)
 *
 * @param {object} visitor
 * @param {object} state
 * @returns {Array} stops (possibly empty)
 */
export function buildItinerary(visitor, state) {
  if (!state?.map) return [];

  switch (visitor.role) {
    // Raiders, guards and diplomats are all business
    case VISITOR_ROLE.RAIDER:
    case VISITOR_ROLE.CARAVAN_GUARD:
    case VISITOR_ROLE.DIPLOMAT:
      return [];

    case VISITOR_ROLE.SCOUT: {
      // Orbit the settlement: 3 observation points around the fortress
      // center, approached in a circuit from wherever the scout entered
      const center = findFortressCenter(state);
      const radius = 9 + Math.random() * 4;
      const startAngle = Math.atan2(visitor.y - center.y, visitor.x - center.x);
      const stops = [];
      for (let k = 0; k < 3; k++) {
        const angle = startAngle + ((k + 1) * 2 * Math.PI) / 4; // 3 quarter-turns
        const point = clampToMap(
          state.map,
          center.x + Math.cos(angle) * radius,
          center.y + Math.sin(angle) * radius * 0.6 // maps are wide, not tall
        );
        stops.push({
          ...point,
          name: 'a vantage point',
          linger: 20 + (Math.random() * 15 | 0),
          satisfaction: 0.8,
          narrate: k === 0, // "was seen watching" once per scout
          skittish: true,
        });
      }
      return stops;
    }

    default: {
      const stops = [];

      // Elves sightsee: the two landmarks nearest their entry point
      if (visitor.race === RACE.ELF) {
        for (const landmark of nearestLandmarks(state, visitor, 2)) {
          stops.push({
            x: landmark.x,
            y: landmark.y,
            name: landmark.name,
            linger: 35 + (Math.random() * 15 | 0),
            satisfaction: 0.4,
            narrate: true,
          });
        }
        return stops;
      }

      // Merchants sometimes detour past one landmark on the way to market
      if (visitor.role === VISITOR_ROLE.MERCHANT && Math.random() < 0.5) {
        const [landmark] = nearestLandmarks(state, visitor, 1);
        if (landmark) {
          stops.push({
            x: landmark.x,
            y: landmark.y,
            name: landmark.name,
            linger: 12,
            satisfaction: 0.2,
            narrate: true,
          });
        }
      }
      return stops;
    }
  }
}

/**
 * Lazily build a visitor's itinerary once (idempotent)
 */
export function ensureItinerary(visitor, state) {
  if (!Array.isArray(visitor.itinerary)) {
    visitor.itinerary = buildItinerary(visitor, state);
    visitor.itineraryIndex = 0;
  }
  return visitor.itinerary;
}

/**
 * The visitor's current pending stop, or null when the itinerary is done
 */
export function currentStop(visitor) {
  const list = visitor.itinerary;
  if (!Array.isArray(list)) return null;
  return list[visitor.itineraryIndex ?? 0] || null;
}

/**
 * Move on to the next stop (resets per-stop counters)
 */
export function advanceStop(visitor) {
  visitor.itineraryIndex = (visitor.itineraryIndex ?? 0) + 1;
  visitor._lingerTicks = 0;
  visitor._stopTicks = 0;
  visitor._stopNarrated = false;
}
