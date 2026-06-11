/**
 * Behavior trace — per-entity position/state ring buffer + movement summarizer
 * (audit entity-walkers R3 / §3.1)
 *
 * sampleBehavior runs in the tick loop (cheap: one push every SAMPLE_INTERVAL
 * ticks); summarizeBehavior turns the buffer into one deterministic phrase for
 * LLM prompts — "lingering in one spot, mostly digging", "ranging north,
 * mostly exploring" — so thoughts can reference what the entity has actually
 * been doing instead of hallucinating it.
 */

const SAMPLE_INTERVAL = 5;  // Ticks between samples
const TRACE_CAPACITY = 12;  // ~60 ticks of history

/**
 * Record a position/state sample on the entity's ring buffer.
 * Call every tick; samples are only taken every SAMPLE_INTERVAL ticks.
 * @param {object} entity - Any walker with x/y/state
 * @param {number} tick - Current simulation tick
 */
export function sampleBehavior(entity, tick) {
  if (tick % SAMPLE_INTERVAL !== 0) return;
  if (!entity._trace) entity._trace = [];
  entity._trace.push({ x: entity.x, y: entity.y, state: entity.state || 'idle' });
  if (entity._trace.length > TRACE_CAPACITY) entity._trace.shift();
}

/**
 * Compass word for a displacement vector ('north', 'southeast', ...).
 * Screen coordinates: y grows downward, so negative dy is north.
 * @param {number} dx
 * @param {number} dy
 * @returns {string}
 */
export function compassDirection(dx, dy) {
  const ns = dy < 0 ? 'north' : dy > 0 ? 'south' : '';
  const ew = dx > 0 ? 'east' : dx < 0 ? 'west' : '';
  // Drop the minor axis when the displacement is strongly one-directional
  if (Math.abs(dx) > Math.abs(dy) * 2) return ew;
  if (Math.abs(dy) > Math.abs(dx) * 2) return ns;
  return ns + ew || 'nowhere';
}

/**
 * Most common state across the samples, prettified ('seeking_food' -> 'seeking food')
 * @param {Array<{state: string}>} samples
 * @returns {string}
 */
function dominantState(samples) {
  const counts = {};
  let best = 'idle';
  let bestCount = 0;
  for (const s of samples) {
    const n = (counts[s.state] = (counts[s.state] || 0) + 1);
    if (n > bestCount) {
      bestCount = n;
      best = s.state;
    }
  }
  return best.replace(/_/g, ' ');
}

/**
 * One deterministic gerund phrase describing recent movement + activity,
 * e.g. "lingering in one spot, mostly digging". Subjectless so callers can
 * render it as "You have been X" or "Urist has been X".
 * @param {object} entity
 * @returns {string} '' when there isn't enough history yet
 */
export function summarizeBehavior(entity) {
  const samples = entity?._trace;
  if (!samples || samples.length < 3) return '';

  let pathLength = 0;
  for (let i = 1; i < samples.length; i++) {
    pathLength += Math.abs(samples[i].x - samples[i - 1].x) + Math.abs(samples[i].y - samples[i - 1].y);
  }
  const first = samples[0];
  const last = samples[samples.length - 1];
  const netDx = last.x - first.x;
  const netDy = last.y - first.y;
  const netDistance = Math.abs(netDx) + Math.abs(netDy);

  const activity = dominantState(samples);

  // Barely moved at all: working/idling in place
  if (pathLength <= samples.length * 0.5) {
    return `lingering in one spot, mostly ${activity}`;
  }
  // Moved a lot but went nowhere: milling around the same area
  if (netDistance < pathLength * 0.4) {
    return `pacing around the same area, mostly ${activity}`;
  }
  // Real displacement: heading somewhere
  return `ranging ${compassDirection(netDx, netDy)}, mostly ${activity}`;
}
