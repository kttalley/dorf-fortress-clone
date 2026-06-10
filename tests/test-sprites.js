// Unit tests for the procedural-hybrid sprite engine.
// Run with: node tests/test-sprites.js

import { getSprite, hasSprite, getIcon, getIconHtml, hasIcon, getAvatarHtml, _internal } from '../src/ui/sprites.js';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('  ✗ FAIL:', msg);
  }
}

// --- Templates are well-formed --------------------------------------------
const { TEMPLATES } = _internal;
for (const [key, rows] of Object.entries(TEMPLATES)) {
  assert(rows.length === 12, `${key}: template has 12 rows (got ${rows.length})`);
  const widths = new Set(rows.map(r => r.length));
  assert(widths.size === 1 && widths.has(12), `${key}: every row is 12 wide`);
}

// --- hasSprite ------------------------------------------------------------
for (const key of ['dwarf', 'human', 'elf', 'goblin', 'deer', 'rabbit', 'wolf', 'boar', 'frog', 'bear']) {
  assert(hasSprite(key) === true, `hasSprite("${key}") is true`);
}
assert(hasSprite('griffon') === false, 'hasSprite("griffon") is false (no template)');

// Human sprites are deterministic and distinct from dwarves
assert(getSprite('human', 'v-1') === getSprite('human', 'v-1'), 'human sprite is deterministic');
assert(getSprite('human', 'v-1') !== getSprite('dwarf', 'v-1'), 'human and dwarf differ for same seed');

// --- Determinism: same seed => identical sprite ---------------------------
const a1 = getSprite('dwarf', 'dwarf-7');
const a2 = getSprite('dwarf', 'dwarf-7');
assert(a1 === a2, 'same seed produces identical sprite URI');

// --- Distinctness: different seeds => different sprites --------------------
const b = getSprite('dwarf', 'dwarf-8');
assert(a1 !== b, 'different seeds produce different sprites');

// Spread check: most seeds in a batch yield distinct sprites
const uris = new Set();
for (let i = 0; i < 50; i++) uris.add(getSprite('dwarf', `dwarf-${i}`));
assert(uris.size >= 40, `>=40/50 seeds are visually distinct (got ${uris.size})`);

// --- State tint changes the sprite but stays deterministic ----------------
const plain = getSprite('dwarf', 'dwarf-7', null);
const wounded = getSprite('dwarf', 'dwarf-7', { color: '#ff3a3a', amount: 0.4 });
assert(plain !== wounded, 'state tint changes the sprite');
assert(
  wounded === getSprite('dwarf', 'dwarf-7', { color: '#ff3a3a', amount: 0.4 }),
  'tinted sprite is deterministic'
);

// --- Unknown key returns null ---------------------------------------------
assert(getSprite('griffon', 'x') === null, 'unknown sprite key returns null');

// --- Output is a usable SVG data URI --------------------------------------
assert(a1.startsWith('data:image/svg+xml,'), 'output is an SVG data URI');
assert(decodeURIComponent(a1).includes('<svg'), 'decoded URI contains <svg>');

// --- Static UI icons --------------------------------------------------------
const { ICON_TEMPLATES } = _internal;
for (const [name, { grid, palette }] of Object.entries(ICON_TEMPLATES)) {
  assert(grid.length === 12, `icon ${name}: grid has 12 rows (got ${grid.length})`);
  const widths = new Set(grid.map(r => r.length));
  assert(widths.size === 1 && widths.has(12), `icon ${name}: every row is 12 wide`);
  // Every non-transparent cell maps to a palette color
  const slots = new Set(grid.join('').replace(/\./g, ''));
  for (const slot of slots) {
    assert(typeof palette[slot] === 'string', `icon ${name}: slot '${slot}' has a palette color`);
  }
  assert(slots.size > 0, `icon ${name}: grid is not empty`);
}

for (const name of ['sound_on', 'sound_off', 'chat', 'thought', 'wave', 'meat',
  'hungry', 'map', 'bot', 'chart', 'globe', 'scroll', 'mask', 'unknown']) {
  assert(hasIcon(name) === true, `hasIcon("${name}") is true`);
  const uri = getIcon(name);
  assert(typeof uri === 'string' && uri.startsWith('data:image/svg+xml,'), `icon ${name} renders to SVG data URI`);
}
assert(hasIcon('nonexistent') === false, 'hasIcon("nonexistent") is false');
assert(getIcon('nonexistent') === null, 'unknown icon returns null');
assert(getIcon('scroll') === getIcon('scroll'), 'icons are cached/deterministic');

const iconHtml = getIconHtml('sound_on', 18);
assert(iconHtml.includes('<img') && iconHtml.includes('image-rendering:pixelated'), 'getIconHtml returns a pixelated <img>');
assert(iconHtml.includes('width:18px'), 'getIconHtml honors size');
assert(getIconHtml('nonexistent') === '', 'getIconHtml for unknown icon returns empty string');

// Avatar fallback for unknown creatures uses the pixel 'unknown' icon, not emoji
const fallbackAvatar = getAvatarHtml('griffon', 'g-1', { size: 24 });
assert(fallbackAvatar.includes('<img'), 'avatar fallback is an <img> icon');
assert(!/[\u{1F300}-\u{1FAFF}]/u.test(fallbackAvatar), 'avatar fallback contains no emoji');

console.log(`\nSprite tests: ${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);
