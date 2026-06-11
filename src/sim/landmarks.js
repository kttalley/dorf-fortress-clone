/**
 * Landmarks — named notable places extracted at worldgen (audit WALK R8 / §3.4)
 *
 * Scans map.tiles for dense clusters of notable tile types (crystals,
 * mushrooms, berry bushes, river bends...) and gives the best cluster of each
 * type a stable, evocative name. Landmarks serve three jobs:
 *   (a) idle/social destinations so walkers visibly congregate,
 *   (b) target resolution for the intention layer (src/ai/intentions.js),
 *   (c) shared nouns in LLM prompts — threads need places to talk about.
 *
 * Pure and deterministic for a given (map, seed) — no LLM calls.
 */

// Cluster scan: bucket the map into cells and find the densest cell per type
const BUCKET_SIZE = 8;
const MAX_LANDMARKS = 6;

// Notable tile types: minimum cluster size + seeded name pools
const NOTABLE_TYPES = {
  crystal: {
    minCount: 3,
    names: ['the Crystal Hollow', 'the Glimmer Vein', 'the Shining Gallery'],
  },
  mushroom: {
    minCount: 4,
    names: ['the Old Mushroom Grove', 'the Sporefields', 'the Fungal Ring'],
  },
  berry_bush: {
    minCount: 3,
    names: ['the Berry Thickets', 'the Sweetbriar Patch', 'the Red Harvest'],
  },
  river: {
    minCount: 6,
    names: ['the River Bend', 'the Singing Ford', 'the Reedy Crossing'],
  },
  marsh: {
    minCount: 6,
    names: ['the Whispering Marsh', 'the Black Fen', 'the Sunken Meads'],
  },
  mountain_peak: {
    minCount: 2,
    names: ['the Gray Summit', 'the Watcher Peak', 'the Broken Tooth'],
  },
  flower: {
    minCount: 6,
    names: ['the Flowering Meadow', 'the Bright Field', 'the Bee Pastures'],
  },
};

/**
 * Tiny deterministic PRNG (mulberry32) so names are stable per world seed
 */
function seededRandom(seed) {
  let t = (seed | 0) + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Extract up to MAX_LANDMARKS named landmarks from a map.
 * @param {object} map - { width, height, tiles } (tiles have .type)
 * @param {number} [seed] - World seed for deterministic naming
 * @returns {Array<{name: string, x: number, y: number, type: string, count: number}>}
 */
export function extractLandmarks(map, seed = 0) {
  if (!map?.tiles?.length) return [];

  // Per-type buckets: 'type:bx,by' -> { count, sumX, sumY }
  const buckets = new Map();

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const type = map.tiles[y * map.width + x]?.type;
      if (!type || !NOTABLE_TYPES[type]) continue;

      const key = `${type}:${Math.floor(x / BUCKET_SIZE)},${Math.floor(y / BUCKET_SIZE)}`;
      const bucket = buckets.get(key) || { type, count: 0, sumX: 0, sumY: 0 };
      bucket.count++;
      bucket.sumX += x;
      bucket.sumY += y;
      buckets.set(key, bucket);
    }
  }

  // Densest qualifying bucket per type
  const bestPerType = new Map();
  for (const bucket of buckets.values()) {
    const spec = NOTABLE_TYPES[bucket.type];
    if (bucket.count < spec.minCount) continue;
    const current = bestPerType.get(bucket.type);
    if (!current || bucket.count > current.count) {
      bestPerType.set(bucket.type, bucket);
    }
  }

  // Most prominent clusters first (relative to their own threshold)
  const ranked = [...bestPerType.values()]
    .sort((a, b) => (b.count / NOTABLE_TYPES[b.type].minCount) - (a.count / NOTABLE_TYPES[a.type].minCount))
    .slice(0, MAX_LANDMARKS);

  return ranked.map((bucket, index) => {
    const names = NOTABLE_TYPES[bucket.type].names;
    const name = names[Math.floor(seededRandom(seed + index * 7919) * names.length)];
    return {
      name,
      type: bucket.type,
      x: Math.round(bucket.sumX / bucket.count),
      y: Math.round(bucket.sumY / bucket.count),
      count: bucket.count,
    };
  });
}

/**
 * Nearest landmark to a position (or null when the world has none)
 * @param {object} state - World state with landmarks
 * @param {number} x
 * @param {number} y
 * @returns {object|null}
 */
export function findNearestLandmark(state, x, y) {
  let best = null;
  let bestDist = Infinity;
  for (const landmark of state?.landmarks || []) {
    const dist = Math.abs(landmark.x - x) + Math.abs(landmark.y - y);
    if (dist < bestDist) {
      bestDist = dist;
      best = landmark;
    }
  }
  return best;
}

/**
 * Resolve a landmark by (partial, case-insensitive) name — intention targets
 * @param {object} state
 * @param {string} text - Free text that may contain a landmark name
 * @returns {object|null}
 */
export function findLandmarkInText(state, text) {
  if (!text) return null;
  const lower = text.toLowerCase();
  for (const landmark of state?.landmarks || []) {
    // Match on the distinctive part of the name ("crystal hollow", not "the")
    const core = landmark.name.replace(/^the\s+/i, '').toLowerCase();
    if (lower.includes(core)) return landmark;
  }
  return null;
}
