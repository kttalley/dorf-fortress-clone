/**
 * Entity Chat LLM Interface
 * Enables conversational roleplay with individual entities (dwarves, visitors)
 * Each entity maintains its own conversation history
 */

import { queueGeneration, checkConnection } from '../ai/llmClient.js';
import { buildEntitySystemPrompt, buildEntityUserPrompt } from './prompts/entityChat.js';

// Per-entity conversation history storage
// Key: `${entityType}_${entityId}`
const conversationHistories = new Map();
const MAX_HISTORY_PER_ENTITY = 10;

// LLM availability cache
let llmAvailable = null;
let lastCheck = 0;
const CHECK_INTERVAL = 30000;

/**
 * Chat with an entity
 * @param {string} message - Player's message
 * @param {object} entity - The entity to chat with
 * @param {string} entityType - 'dwarf' or 'visitor'
 * @returns {Promise<{response: string, source: 'llm'|'fallback'}>}
 */
export async function chatWithEntity(message, entity, entityType) {
  const historyKey = `${entityType}_${entity.id}`;
  const history = conversationHistories.get(historyKey) || [];

  // Check LLM availability
  const isLLMAvailable = await isLLMReady();

  if (!isLLMAvailable) {
    const fallback = generateFallbackResponse(message, entity, entityType);
    addToEntityHistory(historyKey, 'user', message);
    addToEntityHistory(historyKey, 'assistant', fallback);
    return { response: fallback, source: 'fallback' };
  }

  // Build prompts
  const systemPrompt = buildEntitySystemPrompt(entity, entityType);
  const userPrompt = buildEntityUserPrompt(message, history);
  const fullPrompt = `${systemPrompt}\n\n${userPrompt}`;

  // Query LLM
  const response = await queueGeneration(fullPrompt, {
    maxTokens: 150,
    temperature: 0.85,
    stop: ['\n\nVisitor:', '\nVisitor:', 'Visitor:', '\n\n##'],
  });

  if (response) {
    const cleaned = cleanResponse(response, entity);
    addToEntityHistory(historyKey, 'user', message);
    addToEntityHistory(historyKey, 'assistant', cleaned);
    return { response: cleaned, source: 'llm' };
  }

  // Fallback if LLM fails
  const fallback = generateFallbackResponse(message, entity, entityType);
  addToEntityHistory(historyKey, 'user', message);
  addToEntityHistory(historyKey, 'assistant', fallback);
  return { response: fallback, source: 'fallback' };
}

/**
 * Get conversation history for an entity
 * @param {object} entity
 * @param {string} entityType
 * @returns {Array}
 */
export function getEntityHistory(entity, entityType) {
  const historyKey = `${entityType}_${entity.id}`;
  return [...(conversationHistories.get(historyKey) || [])];
}

/**
 * Clear conversation history for an entity
 * @param {object} entity
 * @param {string} entityType
 */
export function clearEntityHistory(entity, entityType) {
  const historyKey = `${entityType}_${entity.id}`;
  conversationHistories.delete(historyKey);
}

/**
 * Clear all entity conversation histories
 */
export function clearAllEntityHistories() {
  conversationHistories.clear();
}

// === INTERNAL FUNCTIONS ===

async function isLLMReady() {
  const now = Date.now();
  if (llmAvailable !== null && now - lastCheck < CHECK_INTERVAL) {
    return llmAvailable;
  }

  llmAvailable = await checkConnection();
  lastCheck = now;
  return llmAvailable;
}

function addToEntityHistory(key, role, content) {
  if (!conversationHistories.has(key)) {
    conversationHistories.set(key, []);
  }

  const history = conversationHistories.get(key);
  history.push({ role, content });

  // Trim old entries
  while (history.length > MAX_HISTORY_PER_ENTITY) {
    history.shift();
  }
}

function cleanResponse(text, entity) {
  if (!text) return '';

  let cleaned = text.trim();

  // Remove any "Name:" prefix the LLM might add
  const name = entity.generatedName || entity.name || '';
  const prefixPattern = new RegExp(`^${name}:\\s*`, 'i');
  cleaned = cleaned.replace(prefixPattern, '');

  // Remove "You:" prefix
  cleaned = cleaned.replace(/^You:\s*/i, '');

  // Remove *actions* and (parentheticals) that break character
  cleaned = cleaned.replace(/\*[^*]+\*/g, '');
  cleaned = cleaned.replace(/\([^)]*\)/g, '');

  // Clean up whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // Ensure we have something to return
  if (cleaned.length === 0) {
    cleaned = 'Hmm...';
  }

  return cleaned;
}

/**
 * Generate fallback response based on entity personality
 */
function generateFallbackResponse(message, entity, entityType) {
  const msg = message.toLowerCase();

  if (entityType === 'dwarf') {
    return generateDwarfFallback(msg, entity);
  } else if (entityType === 'visitor') {
    return generateVisitorFallback(msg, entity);
  }

  return "...";
}

function generateDwarfFallback(msg, dwarf) {
  const name = dwarf.generatedName || dwarf.name;
  const p = dwarf.personality || {};
  const mood = dwarf.mood || 50;

  // Greeting
  if (msg.includes('hello') || msg.includes('hi ') || msg.includes('hey') || msg === 'hi') {
    if (p.friendliness > 0.6) {
      return pickRandom([
        "Well met, friend! Always good to see a friendly face.",
        "Greetings! What brings you to speak with me?",
        "Hello there! Come, sit, let's talk.",
      ]);
    } else if (p.friendliness < 0.3) {
      return pickRandom([
        "Hmm? What do you want?",
        "Yes, hello. What is it?",
        "*grunts* Greetings.",
      ]);
    }
    return pickRandom(["Hello.", "Greetings.", "Well met."]);
  }

  // How are you / feeling
  if (msg.includes('how are you') || msg.includes('feeling') || msg.includes('how do you feel')) {
    if (mood > 70) {
      return pickRandom([
        "Can't complain! Life in the colony is good.",
        "Feeling quite well, thank you for asking!",
        "I'm in fine spirits today.",
      ]);
    } else if (mood < 30) {
      return pickRandom([
        "Could be better, to be honest...",
        "Not great. These are trying times.",
        "*sighs* I've had better days.",
      ]);
    }
    return pickRandom([
      "Getting by, as always.",
      "Well enough, I suppose.",
      "Same as ever.",
    ]);
  }

  // About yourself / who are you
  if (msg.includes('yourself') || msg.includes('who are you') || msg.includes('about you')) {
    const traits = [];
    if (p.curiosity > 0.6) traits.push("curious about the world");
    if (p.bravery > 0.6) traits.push("not one to back down from danger");
    if (p.friendliness > 0.6) traits.push("enjoy good company");
    if (p.humor > 0.6) traits.push("like a good laugh");
    if (p.melancholy > 0.6) traits.push("tend to dwell on things");

    if (traits.length > 0) {
      return `I'm ${name}. I'd say I'm ${traits.slice(0, 2).join(' and ')}. ${dwarf.generatedBio || ''}`;
    }
    return `I'm ${name}, just a humble dwarf doing my part. ${dwarf.generatedBio || ''}`;
  }

  // Place / colony
  if (msg.includes('place') || msg.includes('colony') || msg.includes('here')) {
    if (mood > 60) {
      return pickRandom([
        "It's not bad here. We're making it work.",
        "Could be worse! At least we have food and shelter.",
        "This place has potential, I think.",
      ]);
    }
    return pickRandom([
      "We do what we must to survive.",
      "It's a hard life, but it's our life.",
      "One day at a time...",
    ]);
  }

  // Friend / relationship
  if (msg.includes('friend') || msg.includes('like') || msg.includes('relationship')) {
    const relCount = Object.keys(dwarf.relationships || {}).length;
    if (relCount > 0) {
      return pickRandom([
        "I've gotten to know some of the others. We look out for each other.",
        "Some I get along with better than others, as it goes.",
        "We're all in this together, for better or worse.",
      ]);
    }
    return "Still getting to know everyone, to be honest.";
  }

  // Default - personality-influenced
  if (p.friendliness > 0.6) {
    return pickRandom([
      "That's an interesting question. Let me think on it.",
      "Hmm, I appreciate you asking.",
      "Happy to chat about anything, really.",
    ]);
  } else if (p.humor > 0.6) {
    return pickRandom([
      "Ha! Now that's a question.",
      "You've got me there, friend.",
      "Interesting you should ask that...",
    ]);
  } else if (p.melancholy > 0.6) {
    return pickRandom([
      "*thinks quietly* I'm not sure what to say to that.",
      "Hmm... I'll have to ponder that.",
      "That's... a lot to consider.",
    ]);
  }

  return pickRandom([
    "Hmm.",
    "I see.",
    "Interesting.",
    "Is that so?",
    "Aye.",
  ]);
}

function generateVisitorFallback(msg, visitor) {
  const race = visitor.race || 'traveler';
  const role = visitor.role || 'visitor';
  const disposition = visitor.disposition || 0;

  // Greeting
  if (msg.includes('hello') || msg.includes('hi ') || msg.includes('hey') || msg === 'hi') {
    if (race === 'human') {
      return disposition > 0 ? "Greetings, friend! Good to meet you." : "Hello. Let's keep this professional.";
    } else if (race === 'goblin') {
      return disposition > 0 ? "Heh. Hello, little one." : "*snarls* What do you want?";
    } else if (race === 'elf') {
      return disposition > 0 ? "Greetings, dwarf. May the forest's blessing be upon you." : "Hmph. A dwarf. Speak quickly.";
    }
    return "Hello.";
  }

  // What brings you / why here
  if (msg.includes('bring') || msg.includes('why') || msg.includes('purpose') || msg.includes('here')) {
    if (role === 'merchant') {
      return "Trade, of course! I've goods to sell and coin to earn.";
    } else if (role === 'raider') {
      return disposition > 0 ? "Just... passing through." : "Your valuables. Hand them over.";
    } else if (role === 'guard') {
      return "Protecting the caravan. It's honest work.";
    } else if (role === 'diplomat') {
      return "I come with messages from my people. There is much to discuss.";
    }
    return "I have my reasons for being here.";
  }

  // Opinion of dwarves
  if (msg.includes('dwarf') || msg.includes('think of') || msg.includes('opinion')) {
    if (disposition > 30) {
      return "Dwarves are good folk. Hard workers, honest traders.";
    } else if (disposition > 0) {
      return "Dwarves are... acceptable. We can do business.";
    } else if (disposition > -30) {
      return "Dwarves? Stubborn. Smelly. But sometimes useful.";
    }
    return "I have little love for your kind.";
  }

  // Default
  if (race === 'goblin') {
    return pickRandom(["Heh.", "*scratches ear*", "Whatever.", "Bah."]);
  } else if (race === 'elf') {
    return pickRandom(["Indeed.", "I see.", "How... quaint.", "Hmm."]);
  }
  return pickRandom(["Interesting.", "I see.", "Hmm.", "Is that so?"]);
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}
