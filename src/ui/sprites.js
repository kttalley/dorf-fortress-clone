/**
 * Procedural-hybrid entity sprites.
 *
 * Each creature type has a fixed representational *silhouette* (a pixel grid
 * whose cells reference palette *slots*, not literal colors), painted with a
 * per-individual *palette* deterministically derived from the entity's stable
 * seed (its id). Same seed => same sprite, always. This gives category
 * readability (you can tell a dwarf from a wolf) AND individual identity
 * (every dwarf has a unique beard/skin/clothing combo).
 *
 * Sprites are rendered to inline SVG and returned as `data:` URIs, cached by
 * (spriteKey | seed | tint) so each unique appearance is generated once.
 *
 * First slice: dwarf only. Other entity types fall back to their emoji glyph
 * (renderer skips sprite mode when `hasSprite(key)` is false).
 */

// --- Hashing -----------------------------------------------------------------

/** FNV-1a 32-bit hash of a string/number, returns unsigned int. */
function hashSeed(seed) {
  const str = String(seed);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * Deterministic small PRNG seeded from a hash. Returns a function producing
 * floats in [0, 1). Lets us pull several independent picks from one seed.
 */
function makeRng(seed) {
  let s = hashSeed(seed) || 1;
  return function next() {
    // xorshift32
    s ^= s << 13; s >>>= 0;
    s ^= s >> 17;
    s ^= s << 5; s >>>= 0;
    return s / 0xffffffff;
  };
}

/** Pick an element from an array using an rng draw. */
function pick(rng, arr) {
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

// --- Color helpers -----------------------------------------------------------

function hexToRgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function rgbToHex([r, g, b]) {
  return '#' + ((r << 16) | (g << 8) | b).toString(16).padStart(6, '0');
}

/** Linear interpolate two hex colors by ratio (0..1). */
function lerpColor(c1, c2, ratio) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  return rgbToHex([
    Math.round(a[0] + (b[0] - a[0]) * ratio),
    Math.round(a[1] + (b[1] - a[1]) * ratio),
    Math.round(a[2] + (b[2] - a[2]) * ratio),
  ]);
}

// --- Palette ramps (theme-appropriate color choices per slot) ----------------

const RAMPS = {
  // Humanoids
  skin: ['#e8b890', '#d99a6c', '#c98a5a', '#b87a4a', '#a86b3e', '#8d5a34'],
  beard: ['#6b4a2a', '#8a5a2a', '#a9783a', '#5a3a1a', '#3a2a1a', '#b0b0b0', '#d8d8d8', '#a83a2a'],
  hair: ['#2a1a0e', '#4a3018', '#6b4a2a', '#8a5a2a', '#c8a45a', '#1a1a1a', '#d8d8d8', '#a83a2a'],
  cloth: ['#5a6e4a', '#4a5a6e', '#6e4a4a', '#4a6e6a', '#6e5a3a', '#5a4a6e', '#7a6a4a', '#3a4a5a'],
  metal: ['#9aa0a8', '#8a7a5a', '#b0894a', '#a8a4b0'], // iron, bronze, brass, steel-ish
  boots: ['#4a3320', '#5a4028', '#3a281a'],
  // Elves — paler skin, fair/cool hair, woodland robes
  elfSkin: ['#e8d8c0', '#f0e0c8', '#dcc8a8', '#e8d0b0'],
  elfHair: ['#e8e0c0', '#d8c060', '#c0a040', '#a8c8d8', '#e8c8a0', '#f0e8d0'],
  elfCloth: ['#3a6a4a', '#4a7a8a', '#6a8a5a', '#8a9a6a', '#5a7a9a', '#6a5a8a'],
  // Goblins — green skin, dark hair, scrappy clothing
  goblinSkin: ['#6a8a3a', '#7a9a4a', '#5a7a2a', '#8a9a4a', '#6a8a5a'],
  goblinHair: ['#2a2a1a', '#3a2a1a', '#1a1a1a', '#3a3a2a'],
  goblinCloth: ['#5a3a2a', '#4a3a2a', '#6a4a3a', '#3a3a3a', '#5a4a4a'],
  // Animals
  deerFur: ['#b07840', '#c08850', '#a06838', '#bb8048'],
  deerBelly: ['#e8d0a8', '#f0dcb8', '#dcc098'],
  antler: ['#d8c8a0', '#c8b890', '#e0d0a8'],
  rabbitFur: ['#b0a890', '#c8c0a8', '#9a9080', '#d8d0c0', '#8a8478'],
  rabbitBelly: ['#f0ece0', '#e8e0d0'],
  wolfFur: ['#7a7a7a', '#8a8a8a', '#6a6a6a', '#5a5a5a', '#9a9a90', '#4a4a4a'],
  wolfBelly: ['#c0c0b8', '#d0d0c8', '#a8a8a0'],
  boarFur: ['#5a4636', '#6a5240', '#4a3a2c', '#3a2e22'],
  boarBelly: ['#8a6a55', '#9a7a60', '#7a5a48'],
  tusk: ['#e8e0c8', '#dcd4ba'],
  frogSkin: ['#4a9a3a', '#5aaa44', '#3a8a4a', '#6aaa3a', '#4a9a6a'],
  frogBelly: ['#cad88a', '#d8e89a', '#bcc878'],
  bearFur: ['#5a4030', '#6a4a38', '#4a3528', '#3a2820', '#7a5a44'],
  bearBelly: ['#8a6a50', '#9a7a5a'],
};

const OUTLINE = '#171008';
const EYE = '#120c06';
const TEETH = '#ece6d6';  // 'w' — teeth / tusks highlight / grin
const NOSE = '#15110e';   // 'n' — dark nose / muzzle tip / mouth line

/**
 * Per-creature palette spec: which slot draws from which ramp.
 * Shared constant slots (o/e/w/n) are added in buildPalette.
 * 'b' (belt) is derived from cloth when a template uses clothing.
 */
const PALETTE_SPEC = {
  dwarf:  { s: 'skin', h: 'beard', m: 'metal', k: 'boots' },
  human:  { s: 'skin', h: 'beard', c: 'cloth', m: 'metal', k: 'boots' },
  elf:    { s: 'elfSkin', h: 'elfHair', c: 'elfCloth' },
  goblin: { s: 'goblinSkin', h: 'goblinHair', c: 'goblinCloth', k: 'boots' },
  deer:   { f: 'deerFur', g: 'deerBelly', a: 'antler' },
  rabbit: { f: 'rabbitFur', g: 'rabbitBelly' },
  wolf:   { f: 'wolfFur', g: 'wolfBelly' },
  boar:   { f: 'boarFur', g: 'boarBelly', a: 'tusk' },
  frog:   { f: 'frogSkin', g: 'frogBelly' },
  bear:   { f: 'bearFur', g: 'bearBelly' },
};

/**
 * Build a per-individual palette for a creature type from a seed.
 * Returns a record of slotChar -> hex color.
 */
function buildPalette(spriteKey, seed) {
  const spec = PALETTE_SPEC[spriteKey] || PALETTE_SPEC.dwarf;
  // Namespace the rng by type so a dwarf and a wolf with the same id differ.
  const rng = makeRng(`${spriteKey}:${seed}`);
  const pal = { o: OUTLINE, e: EYE, w: TEETH, n: NOSE };
  for (const [slot, ramp] of Object.entries(spec)) {
    pal[slot] = pick(rng, RAMPS[ramp]);
  }
  // Belt: a darkened clothing accent for cohesion (humanoids with cloth).
  if (pal.c) pal.b = lerpColor(pal.c, '#000000', 0.45);
  return pal;
}

// --- Silhouette templates ----------------------------------------------------
// Each row is a string; each char is a palette slot. '.' = transparent.
// Slots: o=outline e=eye s=skin h=beard/hair c=cloth m=helmet metal b=belt k=boots

const TEMPLATES = {
  // Stocky, helmeted, with a wide floor-length beard — unmistakably a dwarf.
  dwarf: [
    '....oooo....',
    '...ommmmo...',
    '..ommmmmmo..',
    '.ommmmmmmmo.',
    '..osssssso..',
    '..osesseso..',
    '.ohhhhhhhho.',
    'ohhhhhhhhhho',
    'ohhhhhhhhhho',
    '.ohhhhhhhho.',
    '..ohhhhhho..',
    '.okk....kko.',
  ],
  // Generic humanoid: cap/helm, clear face, tunic, belt, boots.
  human: [
    '............',
    '...oooooo...',
    '..ommmmmmo..',
    '..ommmmmmo..',
    '..osssssso..',
    '..osesseso..',
    '..ohhhhhho..',
    '..ohhhhhho..',
    '.occcccccco.',
    '.obbbbbbbbo.',
    '..occ..cco..',
    '..okk..kko..',
  ],
  // Elf: tall, slim, long fair hair, pointed ears, floor-length robe.
  elf: [
    '....hhhh....',
    '...hhhhhh...',
    '.shhhhhhhhs.',
    '.shsssssshs.',
    '..hseesseh..',
    '..hssssssh..',
    '...occcco...',
    '..occcccco..',
    '..occcccco..',
    '..occcccco..',
    '..occcccco..',
    '..occcccco..',
  ],
  // Goblin: short, hunched, big pointed ears, toothy grin.
  goblin: [
    '............',
    '.s........s.',
    '.ss.hhhh.ss.',
    '.sshhhhhhss.',
    '..ssseesss..',
    '..swwwwwws..',
    '..occcccco..',
    '.occcccccco.',
    '.occcccccco.',
    '..occ..cco..',
    '..okk..kko..',
    '............',
  ],
  // --- Animals: front-facing "portrait" silhouettes ---
  deer: [
    '.a.a..a.a...',
    '.aaa..aaa...',
    '..a....a....',
    '..ffffffff..',
    '.feffffffef.',
    '.ffffffffff.',
    '..ffffffff..',
    '..fggggggf..',
    '...gggggg...',
    '...gnnng....',
    '....gggg....',
    '............',
  ],
  rabbit: [
    '...ff..ff...',
    '...ff..ff...',
    '...ff..ff...',
    '..ffffffff..',
    '.ffffffffff.',
    '.feffffffef.',
    '.ffffffffff.',
    '.ffffggffff.',
    '.ffffwwffff.',
    '..ffffffff..',
    '...ffffff...',
    '............',
  ],
  wolf: [
    '.ff....ff...',
    '.ffffffffff.',
    'ffffffffffff',
    'feffffffffef',
    'ffffffffffff',
    '.ffffffffff.',
    '..ffggggff..',
    '..fggggggf..',
    '...gggggg...',
    '....gnng....',
    '.....nn.....',
    '............',
  ],
  boar: [
    '............',
    '..f......f..',
    '.ffffffffff.',
    'ffffffffffff',
    'feffffffffef',
    '.ffffffffff.',
    '..ffggggff..',
    '..fggggggf..',
    'aa.gnnng..aa',
    'aa.gggggg.aa',
    '...gggggg...',
    '............',
  ],
  frog: [
    '.ff....ff...',
    '.fef..fef...',
    '.ffffffffff.',
    'ffffffffffff',
    'ffffffffffff',
    '.ffffffffff.',
    '.nnnnnnnnnn.',
    '.gggggggggg.',
    '.gggggggggg.',
    '..gggggggg..',
    '...gggggg...',
    '............',
  ],
  bear: [
    '.ff....ff...',
    '.ffffffffff.',
    'ffffffffffff',
    'feffffffffef',
    'ffffffffffff',
    '.ffffffffff.',
    '..ffggggff..',
    '..fggggggf..',
    '..fggnnggf..',
    '...gggggg...',
    '...gggggg...',
    '............',
  ],
};

const GRID_SIZE = 12;

// --- SVG / data-URI generation ----------------------------------------------

/**
 * Apply an optional state tint to a palette (lerp every visible color toward
 * the tint). Outline/eye are tinted less so the sprite keeps definition.
 */
function applyTint(palette, tint) {
  if (!tint || !tint.amount) return palette;
  const out = {};
  for (const [slot, color] of Object.entries(palette)) {
    const amt = (slot === 'o' || slot === 'e') ? tint.amount * 0.4 : tint.amount;
    out[slot] = lerpColor(color, tint.color, amt);
  }
  return out;
}

/** Serialize a template + palette into a compact SVG string. */
function renderSvg(template, palette) {
  // Crop the viewBox to the visible pixels so the figure fills the cell
  // edge-to-edge instead of floating inside transparent padding.
  let minX = GRID_SIZE, minY = GRID_SIZE, maxX = -1, maxY = -1;
  let rects = '';
  for (let y = 0; y < template.length; y++) {
    const row = template[y];
    for (let x = 0; x < row.length; x++) {
      const slot = row[x];
      if (slot === '.') continue;
      const color = palette[slot];
      if (!color) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${color}"/>`;
    }
  }
  if (maxX < 0) { minX = minY = 0; maxX = maxY = GRID_SIZE - 1; }
  const vbW = maxX - minX + 1;
  const vbH = maxY - minY + 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${vbW}" height="${vbH}" viewBox="${minX} ${minY} ${vbW} ${vbH}" shape-rendering="crispEdges">${rects}</svg>`;
}

// --- Public API --------------------------------------------------------------

const cache = new Map();

/** Whether a sprite template exists for the given key. */
export function hasSprite(spriteKey) {
  return Object.prototype.hasOwnProperty.call(TEMPLATES, spriteKey);
}

/**
 * Get a cached `data:` URI for an entity sprite.
 * @param {string} spriteKey - template key (e.g. 'dwarf')
 * @param {string|number} seed - stable per-entity seed (entity id)
 * @param {{color:string, amount:number}|null} tint - optional state tint
 * @returns {string|null} data URI, or null if no template for this key
 */
export function getSprite(spriteKey, seed, tint = null) {
  if (!hasSprite(spriteKey)) return null;
  const tintKey = tint && tint.amount ? `${tint.color}:${tint.amount}` : '';
  const cacheKey = `${spriteKey}|${seed}|${tintKey}`;
  const hit = cache.get(cacheKey);
  if (hit) return hit;

  const palette = applyTint(buildPalette(spriteKey, seed), tint);
  const svg = renderSvg(TEMPLATES[spriteKey], palette);
  const uri = 'data:image/svg+xml,' + encodeURIComponent(svg);
  cache.set(cacheKey, uri);
  return uri;
}

/**
 * Build an `<img>` (or emoji fallback) HTML string for an entity avatar,
 * suitable for stat panels and chat. Pixelated, on a dark rounded chip.
 * @param {string} spriteKey
 * @param {string|number} seed
 * @param {{size?:number, tint?:object, fallbackEmoji?:string, bg?:string}} [opts]
 * @returns {string} HTML string
 */
export function getAvatarHtml(spriteKey, seed, opts = {}) {
  const size = opts.size || 40;
  const uri = getSprite(spriteKey, seed, opts.tint || null);
  if (!uri) {
    if (!opts.fallbackEmoji) return '';
    return `<span style="font-size:${Math.round(size * 0.72)}px;line-height:${size}px;display:inline-flex;align-items:center;justify-content:center;width:${size}px;height:${size}px;">${opts.fallbackEmoji}</span>`;
  }
  const bg = opts.bg || 'rgba(20,18,14,0.55)';
  return `<img src="${uri}" alt="" width="${size}" height="${size}" style="`
    + `width:${size}px;height:${size}px;image-rendering:pixelated;object-fit:contain;`
    + `background:${bg};border:1px solid rgba(120,110,90,0.4);border-radius:6px;`
    + `padding:2px;box-sizing:border-box;flex:0 0 auto;" />`;
}

/** Exposed for tests/debugging. */
export const _internal = { hashSeed, buildPalette, TEMPLATES, RAMPS, PALETTE_SPEC };
