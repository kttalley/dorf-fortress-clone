/**
 * Dwarf Thoughts System
 * Manages internal thoughts, triggers social interactions
 * Runs asynchronously outside the main tick loop
 */

import { generateThought, generateSpeech, checkConnection, getQueueStatus } from './llmClient.js';
import { distance } from '../sim/entities.js';

// Thought update interval (ms) - stagger to avoid overwhelming LLM
const THOUGHT_INTERVAL = 3000;
const INTERACTION_CHANCE = 0.15;  // Chance of initiating conversation when near another dwarf
const INTERACTION_DISTANCE = 3;   // Tiles

// Active thoughts and conversations
const activeThoughts = new Map();  // dwarfId -> { thought, timestamp }
const activeConversations = new Map();  // conversationId -> { participants, messages, startTick }
const thoughtHistory = new Map();  // dwarfId -> [recent thoughts]

let llmAvailable = false;
let thoughtLoopId = null;
let worldState = null;
let onThoughtCallback = null;
let onSpeechCallback = null;

/**
 * Initialize the thoughts system
 * @param {object} state - World state reference
 * @param {object} callbacks - Event callbacks
 */
export function initThoughtSystem(state, callbacks = {}) {
  worldState = state;
  onThoughtCallback = callbacks.onThought || (() => {});
  onSpeechCallback = callbacks.onSpeech || (() => {});

  // Check LLM availability
  checkConnection().then(available => {
    llmAvailable = available;
    console.log(`[Thoughts] LLM ${available ? 'connected' : 'unavailable, using fallbacks'}`);
  });

  // Start thought loop
  startThoughtLoop();
}

/**
 * Stop the thoughts system
 */
export function stopThoughtSystem() {
  if (thoughtLoopId) {
    clearTimeout(thoughtLoopId);
    thoughtLoopId = null;
  }
}

/**
 * Main thought loop - runs async, outside tick
 */
function startThoughtLoop() {
  async function loop() {
    if (!worldState || !worldState.dwarves) {
      thoughtLoopId = setTimeout(loop, THOUGHT_INTERVAL);
      return;
    }

    const dwarves = worldState.dwarves;
    if (dwarves.length === 0) {
      thoughtLoopId = setTimeout(loop, THOUGHT_INTERVAL);
      return;
    }

    // Pick a random dwarf to update thought
    const dwarf = dwarves[Math.floor(Math.random() * dwarves.length)];

    // Generate new thought
    await updateDwarfThought(dwarf);

    // Check for social interactions
    await checkSocialInteractions(dwarf);

    // Schedule next iteration
    thoughtLoopId = setTimeout(loop, THOUGHT_INTERVAL);
  }

  loop();
}

/**
 * Update a dwarf's internal thought
 * @param {object} dwarf
 */
async function updateDwarfThought(dwarf) {
  const context = buildThoughtContext(dwarf);

  const thought = await generateThought(dwarf, context);

  if (thought) {
    // Store thought
    activeThoughts.set(dwarf.id, {
      thought,
      timestamp: Date.now(),
    });

    // Add to history
    if (!thoughtHistory.has(dwarf.id)) {
      thoughtHistory.set(dwarf.id, []);
    }
    const history = thoughtHistory.get(dwarf.id);
    history.push({ thought, tick: worldState.tick });
    if (history.length > 10) history.shift();

    // Update dwarf's current thought
    dwarf.currentThought = thought;

    // Notify callback
    onThoughtCallback(dwarf, thought);
  }
}

/**
 * Build context for thought generation
 * @param {object} dwarf
 * @returns {object}
 */
function buildThoughtContext(dwarf) {
  const nearbyDwarves = findNearbyDwarves(dwarf, INTERACTION_DISTANCE * 2);
  const currentTile = getTileDescription(dwarf.x, dwarf.y);
  const recentEvents = getRecentEventsFor(dwarf);

  return {
    nearbyDwarves,
    currentTile,
    recentEvents,
  };
}

/**
 * Find dwarves near a given dwarf
 * @param {object} dwarf
 * @param {number} range
 * @returns {Array}
 */
function findNearbyDwarves(dwarf, range) {
  if (!worldState?.dwarves) return [];

  return worldState.dwarves.filter(other => {
    if (other.id === dwarf.id) return false;
    return distance(dwarf, other) <= range;
  });
}

/**
 * Get tile description for context
 * @param {number} x
 * @param {number} y
 * @returns {string}
 */
function getTileDescription(x, y) {
  if (!worldState?.map) return 'unknown area';

  // Simple tile type to description
  const tile = worldState.map.tiles[y * worldState.map.width + x];
  if (!tile) return 'unknown area';

  const descriptions = {
    'grass': 'a grassy meadow',
    'forest_floor': 'a shaded forest',
    'cave_floor': 'a dim cavern',
    'river_bank': 'near a flowing river',
    'mountain_slope': 'a rocky mountainside',
    'marsh': 'a murky marsh',
    'sand': 'sandy ground',
  };

  return descriptions[tile.type] || 'an open area';
}

/**
 * Get recent events relevant to a dwarf
 * @param {object} dwarf
 * @returns {Array<string>}
 */
function getRecentEventsFor(dwarf) {
  if (!worldState?.log) return [];

  return worldState.log
    .filter(entry => entry.message.includes(dwarf.name))
    .slice(-3)
    .map(entry => entry.message);
}

/**
 * Check for and initiate social interactions
 * @param {object} dwarf
 */
async function checkSocialInteractions(dwarf) {
  const nearbyDwarves = findNearbyDwarves(dwarf, INTERACTION_DISTANCE);

  if (nearbyDwarves.length === 0) return;

  // Random chance to initiate conversation
  if (Math.random() > INTERACTION_CHANCE) return;

  // Pick someone nearby
  const target = nearbyDwarves[Math.floor(Math.random() * nearbyDwarves.length)];

  // Check if either is already in conversation
  const conversationId = getConversationId(dwarf.id, target.id);
  if (activeConversations.has(conversationId)) return;

  // Start conversation
  await startConversation(dwarf, target);
}

/**
 * Start a conversation between two dwarves
 * @param {object} initiator
 * @param {object} target
 */
async function startConversation(initiator, target) {
  const conversationId = getConversationId(initiator.id, target.id);

  // Get initiator's current thought
  const initiatorThought = activeThoughts.get(initiator.id)?.thought || 'something on my mind';

  // Generate speech based on thought
  const speech = await generateSpeech(initiator, target, initiatorThought, {
    relationshipHistory: getRelationshipHistory(initiator, target),
  });

  if (speech) {
    // Create conversation record
    activeConversations.set(conversationId, {
      participants: [initiator.id, target.id],
      messages: [{
        speaker: initiator.id,
        text: speech,
        tick: worldState.tick,
      }],
      startTick: worldState.tick,
    });

    // Update relationship
    updateRelationship(initiator, target, 'spoke');

    // Notify callback
    onSpeechCallback(initiator, target, speech);

    // Schedule response
    setTimeout(() => respondToConversation(conversationId, target, initiator), 2000 + Math.random() * 2000);
  }
}

/**
 * Generate a response in a conversation
 * @param {string} conversationId
 * @param {object} responder
 * @param {object} originalSpeaker
 */
async function respondToConversation(conversationId, responder, originalSpeaker) {
  const conversation = activeConversations.get(conversationId);
  if (!conversation) return;

  // Get responder's thought
  const responderThought = activeThoughts.get(responder.id)?.thought || 'hmm';

  // Generate response
  const response = await generateSpeech(responder, originalSpeaker, responderThought, {
    relationshipHistory: getRelationshipHistory(responder, originalSpeaker),
    topic: conversation.messages[0]?.text,
  });

  if (response) {
    conversation.messages.push({
      speaker: responder.id,
      text: response,
      tick: worldState.tick,
    });

    // Update relationship
    updateRelationship(responder, originalSpeaker, 'responded');

    // Notify callback
    onSpeechCallback(responder, originalSpeaker, response);
  }

  // End conversation after response
  setTimeout(() => {
    activeConversations.delete(conversationId);
  }, 3000);
}

/**
 * Get unique conversation ID for two dwarves
 */
function getConversationId(id1, id2) {
  return id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
}

/**
 * Get relationship history between two dwarves
 */
function getRelationshipHistory(dwarf1, dwarf2) {
  // Placeholder - would be populated from dwarf.relationships
  return [];
}

/**
 * Update relationship between two dwarves
 * @param {object} dwarf1
 * @param {object} dwarf2
 * @param {string} action
 */
function updateRelationship(dwarf1, dwarf2, action) {
  // Initialize relationships if needed
  if (!dwarf1.relationships) dwarf1.relationships = {};
  if (!dwarf2.relationships) dwarf2.relationships = {};

  // Initialize specific relationship
  if (!dwarf1.relationships[dwarf2.id]) {
    dwarf1.relationships[dwarf2.id] = { affinity: 0, interactions: 0 };
  }
  if (!dwarf2.relationships[dwarf1.id]) {
    dwarf2.relationships[dwarf1.id] = { affinity: 0, interactions: 0 };
  }

  // Update based on action
  const affinityChange = action === 'spoke' ? 2 : action === 'responded' ? 3 : 1;

  dwarf1.relationships[dwarf2.id].affinity += affinityChange;
  dwarf1.relationships[dwarf2.id].interactions++;

  dwarf2.relationships[dwarf1.id].affinity += affinityChange;
  dwarf2.relationships[dwarf1.id].interactions++;

  // Mood boost from social interaction
  dwarf1.mood = Math.min(100, (dwarf1.mood || 50) + 2);
  dwarf2.mood = Math.min(100, (dwarf2.mood || 50) + 2);
}

/**
 * Get a dwarf's current thought
 * @param {number} dwarfId
 * @returns {string|null}
 */
export function getCurrentThought(dwarfId) {
  return activeThoughts.get(dwarfId)?.thought || null;
}

/**
 * Get all active conversations
 * @returns {Array}
 */
export function getActiveConversations() {
  return Array.from(activeConversations.entries()).map(([id, conv]) => ({
    id,
    ...conv,
  }));
}

/**
 * Get thought system status
 */
export function getThoughtStatus() {
  return {
    llmAvailable,
    activeThoughts: activeThoughts.size,
    activeConversations: activeConversations.size,
    queueStatus: getQueueStatus(),
  };
}

/**
 * Force a thought update for a specific dwarf (for debugging)
 */
export async function forceThought(dwarf) {
  await updateDwarfThought(dwarf);
  return getCurrentThought(dwarf.id);
}
