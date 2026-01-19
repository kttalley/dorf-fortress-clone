/**
 * Game Context Compressor
 * Serializes world state into compact format for LLM context
 * Target: ~1000 tokens max
 */

/**
 * Compress world state for LLM context
 * @param {object} world - World state
 * @returns {string} Compact text summary
 */
export function compressGameContext(world) {
  const sections = [];

  // 1. Colony Overview
  sections.push(compressOverview(world));

  // 2. Dwarves
  sections.push(compressDwarves(world.dwarves));

  // 3. Resources
  sections.push(compressResources(world));

  // 4. Relationships (abbreviated)
  sections.push(compressRelationships(world.dwarves));

  // 5. Recent Events
  sections.push(compressRecentEvents(world.log));

  return sections.filter(Boolean).join('\n\n');
}

/**
 * Colony overview stats
 */
function compressOverview(world) {
  const dwarfCount = world.dwarves?.length || 0;
  const foodCount = world.foodSources?.length || 0;
  const totalFood = world.foodSources?.reduce((sum, f) => sum + (f.amount || 0), 0) || 0;
  const tick = world.tick || 0;

  // Calculate averages
  const avgHunger = dwarfCount > 0
    ? Math.round(world.dwarves.reduce((sum, d) => sum + (d.hunger || 0), 0) / dwarfCount)
    : 0;
  const avgMood = dwarfCount > 0
    ? Math.round(world.dwarves.reduce((sum, d) => sum + (d.mood || 50), 0) / dwarfCount)
    : 50;

  return `## OVERVIEW
Tick: ${tick} | Dwarves: ${dwarfCount} | Food sources: ${foodCount} (${totalFood} servings)
Avg hunger: ${avgHunger}/100 | Avg mood: ${avgMood}/100`;
}

/**
 * Compress dwarf data
 */
function compressDwarves(dwarves = []) {
  if (dwarves.length === 0) return '## DWARVES\nNone';

  const lines = ['## DWARVES'];

  for (const d of dwarves) {
    const traits = getTopTraits(d.personality);
    const fulfillment = getFulfillmentSummary(d.fulfillment);
    const state = d.state || 'idle';

    lines.push(
      `- ${d.name} [id:${d.id}]: hunger=${d.hunger || 0}, mood=${d.mood || 50}, state="${state}"` +
      `\n  traits: ${traits} | needs: ${fulfillment}` +
      `\n  pos: (${d.x},${d.y})${d.currentThought ? ` | thinking: "${truncate(d.currentThought, 40)}"` : ''}`
    );
  }

  return lines.join('\n');
}

/**
 * Get top personality traits
 */
function getTopTraits(personality = {}) {
  const sorted = Object.entries(personality)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .filter(([, val]) => val > 0.5)
    .map(([trait]) => trait);

  return sorted.length > 0 ? sorted.join(', ') : 'balanced';
}

/**
 * Summarize fulfillment needs
 */
function getFulfillmentSummary(fulfillment = {}) {
  if (!fulfillment) return 'unknown';

  const low = [];
  if (fulfillment.social < 40) low.push('social');
  if (fulfillment.exploration < 40) low.push('exploration');
  if (fulfillment.creativity < 40) low.push('creativity');
  if (fulfillment.tranquility < 40) low.push('tranquility');

  return low.length > 0 ? `low ${low.join(', ')}` : 'satisfied';
}

/**
 * Compress resource data
 */
function compressResources(world) {
  const foodSources = world.foodSources || [];

  if (foodSources.length === 0) {
    return '## RESOURCES\nNo food sources available.';
  }

  // Group by approximate region
  const total = foodSources.reduce((sum, f) => sum + (f.amount || 0), 0);
  const avgAmount = Math.round(total / foodSources.length);

  // Find richest food area
  let maxFood = { amount: 0 };
  for (const f of foodSources) {
    if (f.amount > maxFood.amount) maxFood = f;
  }

  return `## RESOURCES
Food sources: ${foodSources.length} | Total servings: ${total} | Avg per source: ${avgAmount}
Richest source: (${maxFood.x},${maxFood.y}) with ${maxFood.amount} servings`;
}

/**
 * Compress relationship data
 */
function compressRelationships(dwarves = []) {
  if (dwarves.length < 2) return '';

  const pairs = [];

  for (const d of dwarves) {
    if (!d.relationships) continue;

    for (const [otherId, rel] of Object.entries(d.relationships)) {
      const affinity = rel.affinity || 0;
      if (Math.abs(affinity) > 20) {
        const other = dwarves.find(x => x.id === parseInt(otherId));
        if (other && d.id < other.id) { // Avoid duplicates
          const desc = affinity > 50 ? 'friends' : affinity > 20 ? 'friendly' : affinity < -50 ? 'hostile' : 'tense';
          pairs.push(`${d.name} & ${other.name}: ${desc} (${affinity})`);
        }
      }
    }
  }

  if (pairs.length === 0) return '';

  return `## RELATIONSHIPS\n${pairs.slice(0, 6).join('\n')}`; // Max 6 pairs
}

/**
 * Compress recent events from log
 */
function compressRecentEvents(log = []) {
  if (log.length === 0) return '';

  const recent = log.slice(-5).map(entry => {
    const msg = typeof entry === 'string' ? entry : entry.message;
    return `- ${truncate(msg, 60)}`;
  });

  return `## RECENT EVENTS\n${recent.join('\n')}`;
}

/**
 * Truncate string
 */
function truncate(str, maxLen) {
  if (!str) return '';
  return str.length > maxLen ? str.slice(0, maxLen - 3) + '...' : str;
}

/**
 * Estimate token count (rough approximation)
 * @param {string} text
 * @returns {number}
 */
export function estimateTokens(text) {
  // Rough estimate: ~4 chars per token for English
  return Math.ceil(text.length / 4);
}

/**
 * Compress with token budget
 * @param {object} world
 * @param {number} maxTokens
 * @returns {string}
 */
export function compressWithBudget(world, maxTokens = 1000) {
  let context = compressGameContext(world);
  let tokens = estimateTokens(context);

  // If over budget, progressively trim
  if (tokens > maxTokens) {
    // Remove relationships first
    context = context.replace(/## RELATIONSHIPS[\s\S]*?(?=##|$)/, '');
    tokens = estimateTokens(context);
  }

  if (tokens > maxTokens) {
    // Trim events to 3
    context = context.replace(
      /## RECENT EVENTS\n([\s\S]*?)(?=##|$)/,
      (match, events) => {
        const lines = events.trim().split('\n').slice(0, 3);
        return `## RECENT EVENTS\n${lines.join('\n')}\n`;
      }
    );
  }

  return context;
}
