/**
 * Game Assistant LLM Interface
 * Read-only conversational analysis of colony state
 */

import { queueGeneration, checkConnection } from '../ai/llmClient.js';
import { SYSTEM_PROMPT, buildUserPrompt } from './prompts/gameAssistant.js';
import { compressWithBudget } from '../utils/gameContextCompressor.js';

// Chat history storage
let chatHistory = [];
const MAX_HISTORY = 10;

// LLM availability cache
let llmAvailable = null;
let lastCheck = 0;
const CHECK_INTERVAL = 30000; // 30 seconds

/**
 * Ask a question about the game state
 * @param {string} question - Player's question
 * @param {object} world - Current world state
 * @param {Array} history - Optional external history override
 * @returns {Promise<{response: string, source: 'llm'|'fallback'}>}
 */
export async function askGame(question, world, history = null) {
  // Use provided history or internal
  const activeHistory = history || chatHistory;

  // Check LLM availability (cached)
  const isLLMAvailable = await isLLMReady();

  if (!isLLMAvailable) {
    const fallback = generateFallbackResponse(question, world);
    addToHistory('user', question);
    addToHistory('assistant', fallback);
    return { response: fallback, source: 'fallback' };
  }

  // Compress world state
  const worldSummary = compressWithBudget(world, 1000);

  // Collect world context for the prompt
  const worldContext = {
    biome: world.map?.biome ? {
      name: world.map.biome.name,
      description: world.map.biome.description,
    } : null,
    history: world.history ? {
      events: world.history.events || [],
      raceRelations: world.history.raceRelations || {},
    } : null,
    visitors: world.visitors ? world.visitors.map(v => ({
      race: v.race,
      group: v.group,
      purpose: v.purpose,
    })).slice(0, 5) : [],
  };

  // Build full prompt with context
  const userPrompt = buildUserPrompt(worldSummary, question, activeHistory, worldContext);
  const fullPrompt = `${SYSTEM_PROMPT}\n\n${userPrompt}`;

  // Query LLM
  const response = await queueGeneration(fullPrompt, {
    maxTokens: 200,
    temperature: 0.7,
    stop: ['\n\nPlayer:', '\n\n##', 'Human:'],
  });

  if (response) {
    const cleaned = cleanResponse(response);
    addToHistory('user', question);
    addToHistory('assistant', cleaned);
    return { response: cleaned, source: 'llm' };
  }

  // Fallback if LLM fails
  const fallback = generateFallbackResponse(question, world);
  addToHistory('user', question);
  addToHistory('assistant', fallback);
  return { response: fallback, source: 'fallback' };
}

/**
 * Check if LLM is ready (with caching)
 */
async function isLLMReady() {
  const now = Date.now();
  if (llmAvailable !== null && now - lastCheck < CHECK_INTERVAL) {
    return llmAvailable;
  }

  llmAvailable = await checkConnection();
  lastCheck = now;
  return llmAvailable;
}

/**
 * Add message to chat history
 */
function addToHistory(role, content) {
  chatHistory.push({ role, content });
  if (chatHistory.length > MAX_HISTORY) {
    chatHistory.shift();
  }
}

/**
 * Clear chat history
 */
export function clearHistory() {
  chatHistory = [];
}

/**
 * Get current chat history
 */
export function getHistory() {
  return [...chatHistory];
}

/**
 * Clean LLM response
 */
function cleanResponse(text) {
  if (!text) return '';

  let cleaned = text.trim();

  // Ensure it starts with a valid prefix, add ANALYSIS: if not
  if (!cleaned.match(/^(ANALYSIS|OBSERVATION|SUGGESTION):/i)) {
    cleaned = 'ANALYSIS: ' + cleaned;
  }

  return cleaned;
}

/**
 * Generate fallback response using heuristics
 * @param {string} question
 * @param {object} world
 * @returns {string}
 */
function generateFallbackResponse(question, world) {
  const q = question.toLowerCase();
  const dwarves = world.dwarves || [];
  const food = world.foodSources || [];

  // Hunger-related questions
  if (q.includes('starve') || q.includes('hungry') || q.includes('hunger')) {
    return analyzeFallbackHunger(dwarves, food);
  }

  // Mood-related questions
  if (q.includes('mood') || q.includes('happy') || q.includes('sad') || q.includes('unhappy')) {
    return analyzeFallbackMood(dwarves);
  }

  // Social/lonely questions
  if (q.includes('lonely') || q.includes('social') || q.includes('friend')) {
    return analyzeFallbackSocial(dwarves);
  }

  // Food questions
  if (q.includes('food') || q.includes('resource') || q.includes('eat')) {
    return analyzeFallbackFood(food, dwarves);
  }

  // Relationship questions
  if (q.includes('relationship') || q.includes('get along') || q.includes('like')) {
    return analyzeFallbackRelationships(dwarves);
  }

  // General wellbeing
  if (q.includes('wellbeing') || q.includes('colony') || q.includes('overall')) {
    return analyzeFallbackOverall(dwarves, food);
  }

  // Default
  return `ANALYSIS: The colony has ${dwarves.length} dwarf${dwarves.length !== 1 ? 's' : ''} and ${food.length} food source${food.length !== 1 ? 's' : ''}. Average mood is ${getAverage(dwarves, 'mood')} and average hunger is ${getAverage(dwarves, 'hunger')}.`;
}

// === FALLBACK ANALYZERS ===

function analyzeFallbackHunger(dwarves, food) {
  if (dwarves.length === 0) {
    return 'ANALYSIS: No dwarves in the colony.';
  }

  // Sort by hunger (highest first)
  const sorted = [...dwarves].sort((a, b) => (b.hunger || 0) - (a.hunger || 0));
  const hungriest = sorted[0];
  const totalFood = food.reduce((sum, f) => sum + (f.amount || 0), 0);

  let response = `ANALYSIS: `;

  if (hungriest.hunger > 80) {
    response += `${hungriest.name} is critically hungry (${hungriest.hunger}/100) and at risk of starvation. `;
  } else if (hungriest.hunger > 60) {
    response += `${hungriest.name} is the hungriest (${hungriest.hunger}/100) but not critical. `;
  } else {
    response += `No dwarves are in danger. ${hungriest.name} has the highest hunger at ${hungriest.hunger}/100. `;
  }

  response += `Colony has ${totalFood} food servings available.`;

  return response;
}

function analyzeFallbackMood(dwarves) {
  if (dwarves.length === 0) {
    return 'ANALYSIS: No dwarves in the colony.';
  }

  const sorted = [...dwarves].sort((a, b) => (a.mood || 50) - (b.mood || 50));
  const saddest = sorted[0];
  const happiest = sorted[sorted.length - 1];
  const avgMood = getAverage(dwarves, 'mood');

  let response = `ANALYSIS: Average colony mood is ${avgMood}/100. `;

  if (saddest.mood < 30) {
    response += `${saddest.name} has the lowest mood (${saddest.mood}) and may need attention. `;
  } else {
    response += `${saddest.name} has the lowest mood at ${saddest.mood}. `;
  }

  response += `${happiest.name} is the happiest (${happiest.mood}).`;

  return response;
}

function analyzeFallbackSocial(dwarves) {
  if (dwarves.length === 0) {
    return 'ANALYSIS: No dwarves in the colony.';
  }

  const lonely = dwarves.filter(d => d.fulfillment?.social < 30);
  const socializers = dwarves.filter(d => d.state === 'socializing' || d.state === 'seeking_social');

  let response = `ANALYSIS: `;

  if (lonely.length > 0) {
    response += `${lonely.map(d => d.name).join(', ')} ${lonely.length === 1 ? 'seems' : 'seem'} lonely (low social fulfillment). `;
  } else {
    response += `No dwarves are critically lonely. `;
  }

  if (socializers.length > 0) {
    response += `Currently socializing: ${socializers.map(d => d.name).join(', ')}.`;
  }

  return response;
}

function analyzeFallbackFood(food, dwarves) {
  const totalFood = food.reduce((sum, f) => sum + (f.amount || 0), 0);
  const dwarfCount = dwarves.length;
  const servingsPerDwarf = dwarfCount > 0 ? Math.round(totalFood / dwarfCount) : totalFood;

  let response = `ANALYSIS: Colony has ${food.length} food source${food.length !== 1 ? 's' : ''} with ${totalFood} total servings. `;

  if (dwarfCount > 0) {
    response += `That's about ${servingsPerDwarf} servings per dwarf. `;

    if (servingsPerDwarf < 5) {
      response += `Food is scarce.`;
    } else if (servingsPerDwarf < 15) {
      response += `Food supply is adequate.`;
    } else {
      response += `Food supply is plentiful.`;
    }
  }

  return response;
}

function analyzeFallbackRelationships(dwarves) {
  const pairs = [];

  for (const d of dwarves) {
    if (!d.relationships) continue;
    for (const [otherId, rel] of Object.entries(d.relationships)) {
      const other = dwarves.find(x => x.id === parseInt(otherId));
      if (other && d.id < other.id && Math.abs(rel.affinity || 0) > 20) {
        pairs.push({ a: d.name, b: other.name, affinity: rel.affinity });
      }
    }
  }

  if (pairs.length === 0) {
    return 'ANALYSIS: No significant relationships have formed yet. Dwarves are still getting to know each other.';
  }

  pairs.sort((a, b) => Math.abs(b.affinity) - Math.abs(a.affinity));

  const best = pairs.find(p => p.affinity > 0);
  const worst = pairs.find(p => p.affinity < 0);

  let response = 'ANALYSIS: ';

  if (best) {
    response += `${best.a} and ${best.b} get along well (affinity: ${best.affinity}). `;
  }
  if (worst) {
    response += `${worst.a} and ${worst.b} have tension (affinity: ${worst.affinity}).`;
  }

  return response;
}

function analyzeFallbackOverall(dwarves, food) {
  const avgMood = getAverage(dwarves, 'mood');
  const avgHunger = getAverage(dwarves, 'hunger');
  const totalFood = food.reduce((sum, f) => sum + (f.amount || 0), 0);

  let status = 'stable';
  if (avgMood > 70 && avgHunger < 30) status = 'thriving';
  else if (avgMood < 40 || avgHunger > 60) status = 'struggling';
  else if (avgMood < 25 || avgHunger > 80) status = 'critical';

  return `ANALYSIS: Colony status: ${status}. ${dwarves.length} dwarves with average mood ${avgMood}/100 and hunger ${avgHunger}/100. ${totalFood} food servings available.`;
}

function getAverage(dwarves, prop) {
  if (dwarves.length === 0) return 0;
  return Math.round(dwarves.reduce((sum, d) => sum + (d[prop] || 0), 0) / dwarves.length);
}
