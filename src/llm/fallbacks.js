/**
 * Fallback Name & Bio Generation
 * Deterministic local generation when LLM is unavailable
 *
 * Uses seeded randomness based on entity ID for reproducibility
 */

// === NAME POOLS ===
// Traditional dwarven-style names (Nordic/Germanic influenced)

const FIRST_NAMES = [
  // Male-coded
  'Urist', 'Bomrek', 'Fikod', 'Kadol', 'Morul', 'Thikut', 'Zefon',
  'Datan', 'Asob', 'Dodok', 'Rigoth', 'Sibrek', 'Zasit', 'Tholtig',
  'Ingiz', 'Vucar', 'Dumed', 'Kogsak', 'Stinthad', 'Rovod',
  // Female-coded
  'Erith', 'Aban', 'Litast', 'Zulban', 'Udil', 'Ineth', 'Onul',
  'Doren', 'Eral', 'Kumil', 'Risen', 'Athel', 'Ilral', 'Eshtan',
  'Lokum', 'Mebzuth', 'Olon', 'Rimtar', 'Sakzul', 'Tekkud',
];

const EPITHETS = {
  // Trait-based epithets
  curious: ['the Wanderer', 'Far-Seer', 'the Seeker'],
  gregarious: ['the Beloved', 'Friend-Maker', 'the Merry'],
  solitary: ['the Lone', 'Stone-Silent', 'the Recluse'],
  bold: ['the Brave', 'Iron-Heart', 'the Dauntless'],
  cautious: ['the Wary', 'Slow-Step', 'the Prudent'],
  mirthful: ['Laugh-Bringer', 'the Jolly', 'Bright-Eye'],
  dour: ['the Grim', 'Stone-Face', 'the Somber'],
  melancholic: ['the Sorrowful', 'Tear-Touched', 'the Brooding'],
  patient: ['the Steady', 'Long-Wait', 'the Enduring'],
  restless: ['the Restless', 'Never-Still', 'the Driven'],
  inventive: ['the Maker', 'Clever-Hands', 'the Deviser'],
  steadfast: ['the Loyal', 'True-Heart', 'the Unwavering'],
  stubborn: ['the Unyielding', 'Stone-Head', 'the Obstinate'],
  hopeful: ['the Bright', 'Dawn-Watcher', 'the Optimist'],
  cynical: ['the Skeptic', 'Hard-Eye', 'the Doubter'],
};

const DEFAULT_EPITHETS = [
  'the Dwarf', 'Stone-Born', 'of the Depths', 'the Worker',
  'the Steady', 'Deep-Dweller', 'the Stout',
];

// === BIO TEMPLATES ===
// Keyed by dominant trait, with archaic/wry flavor

const BIO_TEMPLATES = {
  curious: [
    'Forever poking about in places best left undisturbed.',
    'Has never met a mystery not worth investigating, nor a warning worth heeding.',
    'Peers into every shadow and questions every certainty.',
  ],
  gregarious: [
    'Knows every dwarf by name and most by their secrets.',
    'Cannot pass another soul without a word, often several.',
    'Finds solitude unbearable and silence suspicious.',
  ],
  solitary: [
    'Prefers stone to company and silence to conversation.',
    'Speaks rarely, and then with deliberate economy.',
    'Has mastered the art of being alone in a crowded hall.',
  ],
  bold: [
    'Rushes toward danger with enthusiasm bordering on foolishness.',
    'Has never backed down from a challenge, to occasional regret.',
    'Fear is a concept understood intellectually but rarely felt.',
  ],
  cautious: [
    'Measures twice, cuts once, then measures again to be certain.',
    'Survives by expecting the worst and planning for worse still.',
    'Wisdom, or cowardice? The line blurs conveniently.',
  ],
  mirthful: [
    'Laughs easily, even at things that warrant tears.',
    'Finds joy in small things and spreads it indiscriminately.',
    'A smile is never far, even when circumstances forbid it.',
  ],
  dour: [
    'Has resting stone-face and sees no reason to change it.',
    'Joy is for those with shorter memories.',
    'Smiles are earned, not given freely.',
  ],
  melancholic: [
    'Carries sorrows like precious gems, polished by attention.',
    'Sees beauty in sadness that others miss entirely.',
    'The weight of existence sits heavy, but familiar.',
  ],
  patient: [
    'Waits with the stillness of deep stone.',
    'Understands that all things come to those who outlast them.',
    'Rushes nothing, regrets less.',
  ],
  restless: [
    'Stillness is an affliction to be cured by movement.',
    'Idle hands invite dark thoughts; best keep them busy.',
    'There is always something to be done, somewhere else to be.',
  ],
  inventive: [
    'Sees possibility where others see only rock.',
    'Hands that cannot help but make, shape, improve.',
    'Every problem is merely a solution waiting to be discovered.',
  ],
  steadfast: [
    'Loyalty runs deeper than the deepest mine.',
    'Once given, trust is never withdrawn without grave cause.',
    'A promise made is a debt owed to the stone itself.',
  ],
  stubborn: [
    'Bends like granite, which is to say: not at all.',
    'Right or wrong, the position once taken is defended eternal.',
    'Changing this mind requires tools not yet invented.',
  ],
  hopeful: [
    'Believes tomorrow will improve upon today, despite evidence.',
    'Sees silver linings in clouds of pure darkness.',
    'Optimism persists like a stubborn fungus.',
  ],
  cynical: [
    'Expects disappointment and is rarely disappointed.',
    'Trust is for those who haven\'t been paying attention.',
    'Hope is a fine thing, for those who can afford delusion.',
  ],
};

const DEFAULT_BIOS = [
  'A dwarf of no particular distinction, which suits them fine.',
  'Gets on with the work, as dwarves do.',
  'Neither remarkable nor unremarkable. Simply present.',
  'Exists. Works. Persists. The dwarven way.',
  'One of many, content to be counted among the steadfast.',
];

// === SEEDED RANDOM ===

/**
 * Simple seeded random for deterministic selection
 * @param {number} seed
 * @returns {function} Random function returning 0-1
 */
function seededRandom(seed) {
  let state = seed;
  return function() {
    state = (state * 1103515245 + 12345) & 0x7fffffff;
    return state / 0x7fffffff;
  };
}

/**
 * Pick from array using seeded random
 */
function pick(array, random) {
  return array[Math.floor(random() * array.length)];
}

// === MAIN EXPORT ===

/**
 * Generate name and bio locally (deterministic fallback)
 * @param {object} entity - Dwarf entity with id, personality
 * @returns {object} { name, bio }
 */
export function generateNameBioLocal(entity) {
  // Seed based on entity ID for reproducibility
  const seed = entity.id || Date.now();
  const random = seededRandom(seed);

  // Generate name
  const firstName = pick(FIRST_NAMES, random);
  const dominantTrait = getDominantTrait(entity);
  const epithet = getEpithet(dominantTrait, random);
  const name = random() > 0.4 ? `${firstName} ${epithet}` : firstName;

  // Generate bio
  const bio = getBio(dominantTrait, random);

  return { name, bio };
}

/**
 * Get the most prominent personality trait
 * @param {object} entity
 * @returns {string|null}
 */
function getDominantTrait(entity) {
  if (!entity.personality) return null;

  const p = entity.personality;
  const traits = [];

  // Check each trait against thresholds
  if (p.curiosity > 0.7) traits.push({ trait: 'curious', value: p.curiosity });
  if (p.friendliness > 0.7) traits.push({ trait: 'gregarious', value: p.friendliness });
  if (p.friendliness < 0.3) traits.push({ trait: 'solitary', value: 1 - p.friendliness });
  if (p.bravery > 0.7) traits.push({ trait: 'bold', value: p.bravery });
  if (p.bravery < 0.3) traits.push({ trait: 'cautious', value: 1 - p.bravery });
  if (p.humor > 0.7) traits.push({ trait: 'mirthful', value: p.humor });
  if (p.humor < 0.3) traits.push({ trait: 'dour', value: 1 - p.humor });
  if (p.melancholy > 0.7) traits.push({ trait: 'melancholic', value: p.melancholy });
  if (p.patience > 0.7) traits.push({ trait: 'patient', value: p.patience });
  if (p.patience < 0.3) traits.push({ trait: 'restless', value: 1 - p.patience });
  if (p.creativity > 0.7) traits.push({ trait: 'inventive', value: p.creativity });
  if (p.loyalty > 0.7) traits.push({ trait: 'steadfast', value: p.loyalty });
  if (p.stubbornness > 0.7) traits.push({ trait: 'stubborn', value: p.stubbornness });
  if (p.optimism > 0.7) traits.push({ trait: 'hopeful', value: p.optimism });
  if (p.optimism < 0.3) traits.push({ trait: 'cynical', value: 1 - p.optimism });

  if (traits.length === 0) return null;

  // Return highest value trait
  traits.sort((a, b) => b.value - a.value);
  return traits[0].trait;
}

/**
 * Get an epithet based on trait
 */
function getEpithet(trait, random) {
  if (trait && EPITHETS[trait]) {
    return pick(EPITHETS[trait], random);
  }
  return pick(DEFAULT_EPITHETS, random);
}

/**
 * Get a bio based on trait
 */
function getBio(trait, random) {
  if (trait && BIO_TEMPLATES[trait]) {
    return pick(BIO_TEMPLATES[trait], random);
  }
  return pick(DEFAULT_BIOS, random);
}

// === EXPORTS FOR TESTING ===

export const _internal = {
  FIRST_NAMES,
  EPITHETS,
  BIO_TEMPLATES,
  getDominantTrait,
  seededRandom,
};
