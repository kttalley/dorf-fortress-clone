/**
 * Event-Driven Dwarf Thoughts System
 * Manages internal thoughts, triggers social interactions
 * Runs asynchronously outside the main tick loop
 * Responds to game events rather than random timers
 */

import { generateEventThought, generateConversationSpeech, checkConnection, getQueueStatus } from './llmClient.js';
import { distance, addMemory, satisfyFulfillment } from '../sim/entities.js';
import { on, emit, EVENTS } from '../events/eventBus.js';

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
  THOUGHT_COOLDOWN: 12000,        // Min ms between thoughts for same dwarf
  MEETING_COOLDOWN: 15000,       // Min ms between meeting thoughts for same pair (reduced for more social)
  INTERACTION_DISTANCE: 4,       // Tiles to be "near" another dwarf (increased for easier meetings)
  CONVERSATION_CHANCE: 0.7,      // Chance meeting triggers conversation (high - dwarves love to chat)
  MAX_CONVERSATION_TURNS: 6,     // Max back-and-forth exchanges (longer conversations)
  BACKGROUND_THOUGHT_INTERVAL: 12000,  // Random observation thoughts
};

// ============================================================
// STATE
// ============================================================

const state = {
  llmAvailable: false,
  worldState: null,
  onThoughtCallback: null,
  onSpeechCallback: null,
  onSidebarUpdate: null,

  activeThoughts: new Map(),      // dwarfId -> { thought, type, timestamp }
  activeConversations: new Map(), // convId -> { participants, messages, turns, startTime }
  thoughtCooldowns: new Map(),    // dwarfId -> timestamp
  meetingCooldowns: new Map(),    // "id1-id2" -> timestamp
  proximityState: new Map(),      // dwarfId -> Set of nearby dwarf ids
  lastTerrainType: new Map(),     // dwarfId -> tile type

  eventUnsubscribers: [],
  backgroundLoopId: null,
};

// ============================================================
// INITIALIZATION
// ============================================================

/**
 * Initialize the event-driven thought system
 * @param {object} worldState - Reference to world state
 * @param {object} callbacks - { onThought, onSpeech, onSidebarUpdate }
 */
export function initThoughtSystem(worldState, callbacks = {}) {
  state.worldState = worldState;
  state.onThoughtCallback = callbacks.onThought || (() => {});
  state.onSpeechCallback = callbacks.onSpeech || (() => {});
  state.onSidebarUpdate = callbacks.onSidebarUpdate || (() => {});

  // Check LLM availability
  checkConnection().then(available => {
    state.llmAvailable = available;
    console.log(`[Thoughts] LLM ${available ? 'connected' : 'offline, using fallbacks'}`);
  });

  // Subscribe to events
  subscribeToEvents();

  // Start background observation loop
  startBackgroundLoop();
}

/**
 * Stop and clean up the thought system
 */
export function stopThoughtSystem() {
  // Unsubscribe from all events
  for (const unsub of state.eventUnsubscribers) {
    unsub();
  }
  state.eventUnsubscribers = [];

  // Clear background loop
  if (state.backgroundLoopId) {
    clearTimeout(state.backgroundLoopId);
    state.backgroundLoopId = null;
  }

  // Clear state
  state.activeThoughts.clear();
  state.activeConversations.clear();
  state.thoughtCooldowns.clear();
  state.meetingCooldowns.clear();
  state.proximityState.clear();
  state.lastTerrainType.clear();
}

/**
 * Subscribe to game events that trigger thoughts
 */
function subscribeToEvents() {
  // World tick - for proximity detection
  state.eventUnsubscribers.push(
    on(EVENTS.TICK, handleTick)
  );

  // Food discovery
  state.eventUnsubscribers.push(
    on(EVENTS.FOOD_FOUND, handleFoodFound)
  );

  // Hunger threshold crossed
  state.eventUnsubscribers.push(
    on(EVENTS.HUNGER_THRESHOLD, handleHungerThreshold)
  );

  // Mood shift
  state.eventUnsubscribers.push(
    on(EVENTS.MOOD_SHIFT, handleMoodShift)
  );

  // New terrain
  state.eventUnsubscribers.push(
    on(EVENTS.NEW_TERRAIN, handleNewTerrain)
  );
}

// ============================================================
// EVENT HANDLERS
// ============================================================

/**
 * Handle tick event - detect proximity changes and terrain changes
 */
function handleTick({ worldState }) {
  if (!worldState?.dwarves) return;

  const dwarves = worldState.dwarves;

  for (const dwarf of dwarves) {
    // Track nearby dwarves for meeting detection
    const currentNearby = new Set();

    for (const other of dwarves) {
      if (other.id === dwarf.id) continue;
      if (distance(dwarf, other) <= CONFIG.INTERACTION_DISTANCE) {
        currentNearby.add(other.id);
      }
    }

    // Check for new encounters
    const previousNearby = state.proximityState.get(dwarf.id) || new Set();

    for (const otherId of currentNearby) {
      if (!previousNearby.has(otherId)) {
        // New meeting!
        const other = dwarves.find(d => d.id === otherId);
        if (other && !isOnMeetingCooldown(dwarf.id, otherId)) {
          handleDwarfMeeting({ dwarf, other, worldState });
        }
      }
    }

    state.proximityState.set(dwarf.id, currentNearby);

    // Check for terrain change
    const currentTerrain = getTileType(dwarf.x, dwarf.y, worldState);
    const lastTerrain = state.lastTerrainType.get(dwarf.id);

    if (lastTerrain && currentTerrain !== lastTerrain) {
      emit(EVENTS.NEW_TERRAIN, { dwarf, previousTerrain: lastTerrain, newTerrain: currentTerrain, worldState });
    }

    state.lastTerrainType.set(dwarf.id, currentTerrain);
  }
}

/**
 * Handle dwarf meeting event
 */
async function handleDwarfMeeting({ dwarf, other, worldState }) {
  // Set cooldown for this pair
  setMeetingCooldown(dwarf.id, other.id);

  // Check if on thought cooldown
  if (isOnThoughtCooldown(dwarf.id)) return;

  // Generate thought about meeting
  const context = {
    otherDwarf: other,
    nearbyDwarves: findNearbyDwarves(dwarf, CONFIG.INTERACTION_DISTANCE * 2),
    tileName: getTileDescription(dwarf.x, dwarf.y),
  };

  const thought = await generateEventThought(dwarf, 'meeting', context);

  if (thought) {
    recordThought(dwarf, thought, 'meeting');

    // Maybe start conversation
    if (Math.random() < CONFIG.CONVERSATION_CHANCE) {
      setTimeout(() => startConversation(dwarf, other, thought), 1500 + Math.random() * 1000);
    }
  }
}

/**
 * Handle food found event
 */
async function handleFoodFound({ dwarf, food, worldState }) {
  if (isOnThoughtCooldown(dwarf.id)) return;

  const context = {
    food,
    nearbyDwarves: findNearbyDwarves(dwarf, CONFIG.INTERACTION_DISTANCE * 2),
    tileName: getTileDescription(dwarf.x, dwarf.y),
  };

  const thought = await generateEventThought(dwarf, 'food_found', context);

  if (thought) {
    recordThought(dwarf, thought, 'food_found');
    addMemory(dwarf, 'event', 'Found food', state.worldState?.tick || 0);
  }
}

/**
 * Handle hunger threshold event
 */
async function handleHungerThreshold({ dwarf, previousHunger, newHunger }) {
  if (isOnThoughtCooldown(dwarf.id)) return;

  // Only trigger on significant threshold crossings (40, 60, 80)
  const thresholds = [40, 60, 80];
  const crossedThreshold = thresholds.find(t =>
    previousHunger < t && newHunger >= t
  );

  if (!crossedThreshold) return;

  const context = {
    nearbyDwarves: findNearbyDwarves(dwarf, CONFIG.INTERACTION_DISTANCE * 2),
    hungerLevel: crossedThreshold,
    tileName: getTileDescription(dwarf.x, dwarf.y),
  };

  const thought = await generateEventThought(dwarf, 'hunger', context);

  if (thought) {
    recordThought(dwarf, thought, 'hunger');
  }
}

/**
 * Handle mood shift event
 */
async function handleMoodShift({ dwarf, previousMood, newMood, reason }) {
  if (isOnThoughtCooldown(dwarf.id)) return;

  const moodDelta = newMood - previousMood;
  if (Math.abs(moodDelta) < 15) return; // Only significant shifts

  const context = {
    nearbyDwarves: findNearbyDwarves(dwarf, CONFIG.INTERACTION_DISTANCE * 2),
    tileName: getTileDescription(dwarf.x, dwarf.y),
    moodImproving: moodDelta > 0,
  };

  const thought = await generateEventThought(dwarf, 'observation', context);

  if (thought) {
    recordThought(dwarf, thought, 'mood');
  }
}

/**
 * Handle new terrain event
 */
async function handleNewTerrain({ dwarf, previousTerrain, newTerrain, worldState }) {
  // Only generate thought occasionally for terrain changes
  if (Math.random() > 0.15) return;
  if (isOnThoughtCooldown(dwarf.id)) return;

  const context = {
    nearbyDwarves: findNearbyDwarves(dwarf, CONFIG.INTERACTION_DISTANCE * 2),
    tileName: getTileDescription(dwarf.x, dwarf.y),
    previousTerrain,
  };

  const thought = await generateEventThought(dwarf, 'observation', context);

  if (thought) {
    recordThought(dwarf, thought, 'terrain');
  }
}

// ============================================================
// CONVERSATION SYSTEM
// ============================================================

/**
 * Start a conversation between two dwarves
 */
async function startConversation(initiator, target, initiatorThought) {
  const convId = getConversationId(initiator.id, target.id);

  // Don't start if already in conversation
  if (state.activeConversations.has(convId)) return;

  // Check if they're still close enough
  if (distance(initiator, target) > CONFIG.INTERACTION_DISTANCE + 2) return;

  // Generate opening speech
  const speech = await generateConversationSpeech(initiator, target, initiatorThought, {
    isResponse: false,
  });

  if (!speech) return;

  // Create conversation record
  const conversation = {
    id: convId,
    participants: [initiator.id, target.id],
    messages: [{
      speakerId: initiator.id,
      speakerName: initiator.name,
      text: speech,
      timestamp: Date.now(),
    }],
    turns: 1,
    startTime: Date.now(),
  };

  state.activeConversations.set(convId, conversation);

  // Update relationships
  updateRelationship(initiator, target, 'spoke', speech);

  // Notify callbacks
  state.onSpeechCallback(initiator, target, speech);

  // Add to conversation log
  addToConversationLog(initiator, target, initiator.name, speech);

  // Schedule response
  const responseDelay = 2000 + Math.random() * 2000;
  setTimeout(() => continueConversation(convId, target, initiator), responseDelay);
}

/**
 * Continue an existing conversation
 */
async function continueConversation(convId, responder, previousSpeaker) {
  const conversation = state.activeConversations.get(convId);
  if (!conversation) return;

  // Check if conversation should end
  if (conversation.turns >= CONFIG.MAX_CONVERSATION_TURNS) {
    endConversation(convId);
    return;
  }

  // Check if dwarves are still close enough
  if (distance(responder, previousSpeaker) > CONFIG.INTERACTION_DISTANCE + 2) {
    endConversation(convId);
    return;
  }

  const lastMessage = conversation.messages[conversation.messages.length - 1];
  const responderThought = state.activeThoughts.get(responder.id)?.thought || 'hmm';

  const response = await generateConversationSpeech(responder, previousSpeaker, responderThought, {
    isResponse: true,
    lastSaid: lastMessage.text,
  });

  if (!response) {
    endConversation(convId);
    return;
  }

  // Add to conversation
  conversation.messages.push({
    speakerId: responder.id,
    speakerName: responder.name,
    text: response,
    timestamp: Date.now(),
  });
  conversation.turns++;

  // Update relationships
  updateRelationship(responder, previousSpeaker, 'responded', response);

  // Notify callbacks
  state.onSpeechCallback(responder, previousSpeaker, response);

  // Add to conversation log
  addToConversationLog(responder, previousSpeaker, responder.name, response);

  // Maybe continue (50% chance for another exchange)
  if (Math.random() < 0.5 && conversation.turns < CONFIG.MAX_CONVERSATION_TURNS) {
    const delay = 2000 + Math.random() * 2000;
    setTimeout(() => continueConversation(convId, previousSpeaker, responder), delay);
  } else {
    setTimeout(() => endConversation(convId), 3000);
  }
}

/**
 * End a conversation
 */
function endConversation(convId) {
  const conversation = state.activeConversations.get(convId);
  if (!conversation) return;

  // Record significant conversation as memory
  if (conversation.turns >= 2) {
    const dwarves = state.worldState?.dwarves || [];
    for (const participantId of conversation.participants) {
      const dwarf = dwarves.find(d => d.id === participantId);
      if (dwarf) {
        const otherName = conversation.messages.find(m => m.speakerId !== participantId)?.speakerName || 'someone';
        addMemory(dwarf, 'conversation', `Talked with ${otherName}`, state.worldState?.tick || 0);
      }
    }
  }

  state.activeConversations.delete(convId);
}

// ============================================================
// BACKGROUND THOUGHT LOOP
// ============================================================

/**
 * Background loop for occasional observation thoughts
 */
function startBackgroundLoop() {
  async function loop() {
    if (!state.worldState?.dwarves?.length) {
      state.backgroundLoopId = setTimeout(loop, CONFIG.BACKGROUND_THOUGHT_INTERVAL);
      return;
    }

    // Pick a random dwarf who isn't on cooldown
    const candidates = state.worldState.dwarves.filter(d => !isOnThoughtCooldown(d.id));

    if (candidates.length > 0 && Math.random() < 0.4) {
      const dwarf = candidates[Math.floor(Math.random() * candidates.length)];

      const context = {
        nearbyDwarves: findNearbyDwarves(dwarf, CONFIG.INTERACTION_DISTANCE * 2),
        tileName: getTileDescription(dwarf.x, dwarf.y),
      };

      const thought = await generateEventThought(dwarf, 'observation', context);

      if (thought) {
        recordThought(dwarf, thought, 'observation');
      }
    }

    state.backgroundLoopId = setTimeout(loop, CONFIG.BACKGROUND_THOUGHT_INTERVAL);
  }

  loop();
}

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function recordThought(dwarf, thought, type) {
  state.activeThoughts.set(dwarf.id, {
    thought,
    type,
    timestamp: Date.now(),
  });

  state.thoughtCooldowns.set(dwarf.id, Date.now());

  // Update dwarf's current thought
  dwarf.currentThought = thought;
  dwarf.lastThoughtTick = state.worldState?.tick || 0;

  // Add to memory
  addMemory(dwarf, 'thought', thought, state.worldState?.tick || 0);

  // Notify callbacks
  state.onThoughtCallback(dwarf, thought);
  state.onSidebarUpdate(getAllThoughts());
}

function isOnThoughtCooldown(dwarfId) {
  const lastThought = state.thoughtCooldowns.get(dwarfId);
  if (!lastThought) return false;
  return Date.now() - lastThought < CONFIG.THOUGHT_COOLDOWN;
}

function isOnMeetingCooldown(id1, id2) {
  const key = id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
  const lastMeeting = state.meetingCooldowns.get(key);
  if (!lastMeeting) return false;
  return Date.now() - lastMeeting < CONFIG.MEETING_COOLDOWN;
}

function setMeetingCooldown(id1, id2) {
  const key = id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
  state.meetingCooldowns.set(key, Date.now());
}

function getConversationId(id1, id2) {
  return id1 < id2 ? `${id1}-${id2}` : `${id2}-${id1}`;
}

function findNearbyDwarves(dwarf, range) {
  if (!state.worldState?.dwarves) return [];
  return state.worldState.dwarves.filter(other =>
    other.id !== dwarf.id && distance(dwarf, other) <= range
  );
}

function getTileType(x, y, worldState = state.worldState) {
  if (!worldState?.map) return null;
  const tile = worldState.map.tiles[y * worldState.map.width + x];
  return tile?.type || null;
}

function getTileDescription(x, y) {
  const type = getTileType(x, y);
  if (!type) return 'an unknown area';

  const descriptions = {
    'grass': 'a grassy meadow',
    'tall_grass': 'tall grass',
    'forest_floor': 'the forest floor',
    'tree_conifer': 'among pine trees',
    'tree_deciduous': 'under leafy trees',
    'cave_floor': 'a dim cavern',
    'cave_wall': 'near cave walls',
    'river_bank': 'by the river',
    'river': 'at the water\'s edge',
    'mountain_slope': 'a rocky slope',
    'mountain_peak': 'high ground',
    'marsh': 'marshy ground',
    'sand': 'sandy terrain',
    'mushroom': 'a mushroom patch',
    'moss': 'mossy stone',
    'crystal': 'near glowing crystals',
    'berry_bush': 'near berry bushes',
  };

  return descriptions[type] || 'an open area';
}

function updateRelationship(dwarf1, dwarf2, action, text = '') {
  if (!dwarf1.relationships) dwarf1.relationships = {};
  if (!dwarf2.relationships) dwarf2.relationships = {};

  // Initialize if needed
  for (const [a, b] of [[dwarf1, dwarf2], [dwarf2, dwarf1]]) {
    if (!a.relationships[b.id]) {
      a.relationships[b.id] = {
        affinity: 0,
        interactions: 0,
        lastInteraction: 0,
        conversationLog: [],
      };
    }
  }

  // Calculate affinity change
  let affinityChange = action === 'spoke' ? 2 : action === 'responded' ? 3 : 1;

  // Personality modifiers
  if (dwarf1.personality?.friendliness > 0.7) affinityChange += 1;
  if (dwarf2.personality?.friendliness > 0.7) affinityChange += 1;

  // Update both relationships
  dwarf1.relationships[dwarf2.id].affinity += affinityChange;
  dwarf1.relationships[dwarf2.id].interactions++;
  dwarf1.relationships[dwarf2.id].lastInteraction = state.worldState?.tick || 0;

  dwarf2.relationships[dwarf1.id].affinity += affinityChange;
  dwarf2.relationships[dwarf1.id].interactions++;
  dwarf2.relationships[dwarf1.id].lastInteraction = state.worldState?.tick || 0;

  // Mood boost from social interaction
  dwarf1.mood = Math.min(100, (dwarf1.mood || 50) + 2);
  dwarf2.mood = Math.min(100, (dwarf2.mood || 50) + 2);
}

function addToConversationLog(speaker, listener, speakerName, text) {
  const entry = { speaker: speakerName, text, tick: state.worldState?.tick || 0 };

  if (speaker.relationships?.[listener.id]) {
    const log = speaker.relationships[listener.id].conversationLog || [];
    log.push(entry);
    if (log.length > 10) log.shift();
    speaker.relationships[listener.id].conversationLog = log;
  }

  if (listener.relationships?.[speaker.id]) {
    const log = listener.relationships[speaker.id].conversationLog || [];
    log.push(entry);
    if (log.length > 10) log.shift();
    listener.relationships[speaker.id].conversationLog = log;
  }
}

// ============================================================
// EXPORTS
// ============================================================

export function getCurrentThought(dwarfId) {
  return state.activeThoughts.get(dwarfId)?.thought || null;
}

export function getAllThoughts() {
  const thoughts = [];
  for (const [dwarfId, data] of state.activeThoughts) {
    const dwarf = state.worldState?.dwarves?.find(d => d.id === dwarfId);
    if (dwarf) {
      thoughts.push({
        dwarfId,
        dwarfName: dwarf.name,
        thought: data.thought,
        type: data.type,
        age: Date.now() - data.timestamp,
      });
    }
  }
  return thoughts.sort((a, b) => a.age - b.age);
}

export function getActiveConversations() {
  return Array.from(state.activeConversations.values());
}

export function getThoughtStatus() {
  return {
    llmAvailable: state.llmAvailable,
    activeThoughts: state.activeThoughts.size,
    activeConversations: state.activeConversations.size,
    queueStatus: getQueueStatus(),
  };
}

export async function forceThought(dwarf) {
  const context = {
    nearbyDwarves: findNearbyDwarves(dwarf, CONFIG.INTERACTION_DISTANCE * 2),
    tileName: getTileDescription(dwarf.x, dwarf.y),
  };

  const thought = await generateEventThought(dwarf, 'observation', context);
  if (thought) {
    recordThought(dwarf, thought, 'forced');
  }
  return thought;
}
