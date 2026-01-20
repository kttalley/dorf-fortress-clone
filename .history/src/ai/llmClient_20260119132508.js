/**
 * Ollama LLM Client
 * Async, non-blocking integration with Ollama API
 * Used for generating dwarf thoughts and speech - NEVER in main tick loop
 */

const OLLAMA_URL = 'https://llm.kristiantalley.com';
// const MODEL = 'incept5/llama3.1-claude:latest';
const MODEL = 'nemotron:latest';
const REQUEST_TIMEOUT = 5000;

// Request queue to prevent overwhelming the server
const requestQueue = [];
let isProcessing = false;
const MAX_CONCURRENT = 10;  // Increased from 2 to handle more concurrent requests
let activeRequests = 0;

/**
 * Generate text completion from Ollama
 * @param {string} prompt - The prompt to send
 * @param {object} options - Generation options
 * @returns {Promise<string>} Generated text
 */
export async function generate(prompt, options = {}) {
  const {
    maxTokens = 100,
    temperature = 0.8,
    topP = 0.9,
    stop = ['\n\n', 'Human:', 'User:'],
  } = options;

  const requestBody = {
    model: MODEL,
    prompt,
    stream: false,
    options: {
      num_predict: maxTokens,
      temperature,
      top_p: topP,
      stop,
    },
  };

  try {
    console.log(`[LLM/fetch] Using model: ${MODEL}, sending ${prompt.length} char prompt`);
    
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[LLM/fetch] Server error ${response.status}:`, errorText);
      throw new Error(`Ollama API error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const result = data.response?.trim() || '';
    console.log(`[LLM/fetch] ✓ Received response (${result.length} chars)`);
    return result;
  } catch (error) {
    console.error('[LLM/fetch] Generation failed:', error.message);
    return null;
  }
}

/**
 * Queue a generation request (rate-limited)
 * @param {string} prompt
 * @param {object} options
 * @returns {Promise<string>}
 */
export function queueGeneration(prompt, options = {}) {
  return new Promise((resolve) => {
    requestQueue.push({ prompt, options, resolve });
    processQueue();
  });
}

/**
 * Process the request queue
 */
async function processQueue() {
  if (activeRequests >= MAX_CONCURRENT || requestQueue.length === 0) {
    return;
  }

  const { prompt, options, resolve } = requestQueue.shift();
  activeRequests++;

  try {
    const result = await generate(prompt, options);
    resolve(result);
  } catch (error) {
    resolve(null);
  } finally {
    activeRequests--;
    processQueue();
  }
}

/**
 * Check if LLM server is available
 * @returns {Promise<boolean>}
 */
export async function checkLLMHealth() {
  try {
    // Use AbortController for proper timeout support
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2000);
    
    try {
      console.log('[LLM] Health check: connecting to', OLLAMA_URL);
      const response = await fetch(`${OLLAMA_URL}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
      });
      clearTimeout(timeoutId);
      console.log('[LLM] Health check: response', response.status, response.ok ? '✓' : '✗');
      return response.ok;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.warn('[LLM] Health check failed:', error.message);
    return false;
  }
}

/**
 * Get current queue size
 * @returns {number}
 */
export function getQueueSize() {
  return requestQueue.length;
}

/**
 * Get active request count
 * @returns {number}
 */
export function getActiveRequests() {
  return activeRequests;
}

// ============================================================
// PROMPT TEMPLATES - Focused on emergent social interactions
// ============================================================

/**
 * Prompt templates for different event-triggered thoughts
 */
export const PROMPT_TEMPLATES = {
  // Meeting another dwarf
  THOUGHT_MEETING: (dwarf, other, relationship) => {
    const traits = formatTraits(dwarf.personality);
    const mood = describeMood(dwarf.mood);
    const rel = describeRelationshipDetailed(dwarf, other, relationship);
    const memory = formatRecentMemory(dwarf);

    return `You are ${dwarf.generatedName}, a dwarf. Traits: ${traits}. Mood: ${mood}.

You just noticed ${other.generatedName} nearby. ${rel}
${memory}

Express a brief internal thought (1-2 sentences, first person) about seeing ${other.generatedName}. Show personality:`;
  },

  // Finding food
  THOUGHT_FOOD_FOUND: (dwarf, context) => {
    const traits = formatTraits(dwarf.personality);
    const hunger = describeHunger(dwarf.hunger);
    const nearby = context.nearbyDwarves?.length > 0
      ? `${context.nearbyDwarves.map(d => d.generatedName).join(', ')} ${context.nearbyDwarves.length === 1 ? 'is' : 'are'} nearby.`
      : 'You are alone.';

    return `You are ${dwarf.generatedName}, a dwarf. Traits: ${traits}. You are ${hunger}.

You just found food. ${nearby}

Brief thought (1-2 sentences, first person) - consider sharing or keeping for yourself:`;
  },

  // Getting hungry
  THOUGHT_HUNGER: (dwarf, context) => {
    const traits = formatTraits(dwarf.personality);
    const hunger = describeHunger(dwarf.hunger);
    const nearby = context.nearbyDwarves?.length > 0
      ? `${context.nearbyDwarves.map(d => d.generatedName).join(' and ')} ${context.nearbyDwarves.length === 1 ? 'is' : 'are'} nearby.`
      : '';

    return `You are ${dwarf.generatedName}. Traits: ${traits}. You are ${hunger}. ${nearby}

Brief thought about your hunger (1-2 sentences, first person):`;
  },

  // General observation
  THOUGHT_OBSERVATION: (dwarf, context) => {
    const traits = formatTraits(dwarf.personality);
    const mood = describeMood(dwarf.mood);
    const location = context.tilegeneratedName || 'somewhere';
    const nearby = context.nearbyDwarves?.length > 0
      ? `You can see: ${context.nearbyDwarves.map(d => `${d.generatedName} (${d.state})`).join(', ')}.`
      : 'You are alone.';
    const memory = formatRecentMemory(dwarf);

    return `You are ${dwarf.generatedName}. Traits: ${traits}. Mood: ${mood}. Location: ${location}.

${nearby}
${memory}

Brief observation or thought (1-2 sentences, first person):`;
  },

  // Starting a conversation
  SPEECH_INITIATE: (speaker, listener, speakerThought, relationship) => {
    const traits = formatTraits(speaker.personality);
    const rel = describeRelationshipDetailed(speaker, listener, relationship);
    const history = formatConversationHistory(relationship);

    return `${speaker.generatedName} (${traits}) is thinking: "${speakerThought}"

${speaker.generatedName} wants to start a conversation with ${listener.generatedName}. ${rel}
${history}

Write what ${speaker.generatedName} says (1 short sentence, casual, no quotes):`;
  },

  // Responding in conversation
  SPEECH_RESPOND: (responder, speaker, lastSaid, responderThought, relationship) => {
    const traits = formatTraits(responder.personality);
    const rel = describeRelationshipDetailed(responder, speaker, relationship);

    return `${speaker.generatedName} just said: "${lastSaid}"

${responder.generatedName} (${traits}) is thinking: "${responderThought}"
${rel}

Write ${responder.generatedName}'s brief reply (1 short sentence, casual, no quotes):`;
  },
};

// ============================================================
// ENHANCED GENERATION FUNCTIONS
// ============================================================

/**
 * Generate thought based on specific event type
 * @param {object} dwarf - Dwarf entity
 * @param {string} eventType - 'meeting' | 'food_found' | 'hunger' | 'observation'
 * @param {object} context - Event-specific context
 * @returns {Promise<string>}
 */
export async function generateEventThought(dwarf, eventType, context = {}) {
  let prompt;

  switch (eventType) {
    case 'meeting':
      prompt = PROMPT_TEMPLATES.THOUGHT_MEETING(
        dwarf,
        context.otherDwarf,
        dwarf.relationships?.[context.otherDwarf?.id]
      );
      break;
    case 'food_found':
      prompt = PROMPT_TEMPLATES.THOUGHT_FOOD_FOUND(dwarf, context);
      break;
    case 'hunger':
      prompt = PROMPT_TEMPLATES.THOUGHT_HUNGER(dwarf, context);
      break;
    case 'observation':
    default:
      prompt = PROMPT_TEMPLATES.THOUGHT_OBSERVATION(dwarf, context);
      break;
  }

  const thought = await queueGeneration(prompt, {
    maxTokens: 80,
    temperature: 0.9,
    stop: ['\n\n', 'Human:', 'User:', 'You are'],
  });

  return cleanResponse(thought) || getContextualFallback(dwarf, eventType);
}

/**
 * Generate conversation speech with context
 * @param {object} speaker
 * @param {object} listener
 * @param {string} speakerThought
 * @param {object} context - { isResponse, lastSaid }
 * @returns {Promise<string>}
 */
export async function generateConversationSpeech(speaker, listener, speakerThought, context = {}) {
  const relationship = speaker.relationships?.[listener.id];

  let prompt;
  if (context.isResponse && context.lastSaid) {
    prompt = PROMPT_TEMPLATES.SPEECH_RESPOND(
      speaker, listener, context.lastSaid, speakerThought, relationship
    );
  } else {
    prompt = PROMPT_TEMPLATES.SPEECH_INITIATE(
      speaker, listener, speakerThought, relationship
    );
  }

  const speech = await queueGeneration(prompt, {
    maxTokens: 50,
    temperature: 0.85,
    stop: ['\n', '"', '*', '(', 'They', 'The dwarf'],
  });

  return cleanResponse(speech) || getPersonalitySpeech(speaker);
}

// ============================================================
// HELPER FUNCTIONS FOR PROMPTS
// ============================================================

function formatTraits(personality = {}) {
  const dominant = [];
  for (const [trait, value] of Object.entries(personality)) {
    if (value > 0.7) dominant.push(trait);
    else if (value < 0.3) dominant.push(`not ${trait}`);
  }
  return dominant.length > 0 ? dominant.slice(0, 3).join(', ') : 'ordinary';
}

function describeHunger(hunger = 0) {
  if (hunger > 80) return 'desperately hungry';
  if (hunger > 60) return 'very hungry';
  if (hunger > 40) return 'getting hungry';
  if (hunger > 20) return 'slightly peckish';
  return 'well-fed';
}

function describeRelationshipDetailed(dwarf, other, relationship = null) {
  if (!relationship || relationship.interactions === 0) {
    return `You don't know ${other.generatedName} well yet.`;
  }

  const affinity = relationship.affinity || 0;
  const interactions = relationship.interactions || 0;

  let desc = '';
  if (affinity > 50) desc = `${other.generatedName} is a good friend.`;
  else if (affinity > 20) desc = `You like ${other.generatedName}.`;
  else if (affinity > -20) desc = `${other.generatedName} is an acquaintance.`;
  else if (affinity > -50) desc = `You find ${other.generatedName} a bit annoying.`;
  else desc = `You dislike ${other.generatedName}.`;

  desc += ` You've talked ${interactions} time${interactions !== 1 ? 's' : ''}.`;

  return desc;
}

function formatRecentMemory(dwarf) {
  const parts = [];

  if (dwarf.memory?.recentThoughts?.length > 0) {
    const last = dwarf.memory.recentThoughts[dwarf.memory.recentThoughts.length - 1];
    if (last?.content) {
      parts.push(`Recent thought: "${last.content}"`);
    }
  }

  if (dwarf.memory?.significantEvents?.length > 0) {
    const events = dwarf.memory.significantEvents.slice(-2).map(e => e.content).filter(Boolean);
    if (events.length > 0) {
      parts.push(`Recent events: ${events.join('; ')}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : '';
}

function formatConversationHistory(relationship) {
  if (!relationship?.conversationLog?.length) {
    return '(First conversation)';
  }

  return 'Previous exchanges:\n' + relationship.conversationLog
    .slice(-3)
    .map(c => `- ${c.speaker}: "${c.text}"`)
    .join('\n');
}

function cleanResponse(text) {
  if (!text) return null;

  let cleaned = text.trim();
  // Remove quotes
  cleaned = cleaned.replace(/^["']|["']$/g, '');
  // Remove "generatedName:" prefix
  cleaned = cleaned.replace(/^\w+:\s*/i, '');
  // Remove *actions*
  cleaned = cleaned.replace(/\*[^*]+\*/g, '');
  // Remove extra whitespace
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  return cleaned.length > 0 ? cleaned : null;
}

// ============================================================
// CONTEXT-AWARE FALLBACKS
// ============================================================

function getContextualFallback(dwarf, eventType) {
  const fallbacks = {
    meeting: [
      'Oh, someone else is here.',
      'I wonder what they want.',
      'Company at last.',
      'Should I say hello?',
      'Interesting timing.',
    ],
    food_found: [
      'Finally, something to eat!',
      'This looks edible.',
      'I should remember this spot.',
      'Food at last.',
    ],
    hunger: [
      'My stomach is growling...',
      'I need to find food soon.',
      'Getting hungry here.',
      'When did I last eat?',
    ],
    observation: [
      'Interesting place.',
      'I wonder what today will bring.',
      'Just another moment.',
      'The air feels different here.',
    ],
  };

  const options = fallbacks[eventType] || fallbacks.observation;
  return options[Math.floor(Math.random() * options.length)];
}

function getPersonalitySpeech(speaker) {
  // Personality-influenced fallback speech
  if (speaker.personality?.friendliness > 0.7) {
    return ['Great to see you!', 'Hello, friend!', 'How are you?'][Math.floor(Math.random() * 3)];
  }
  if (speaker.personality?.humor > 0.7) {
    return ['So, come here often?', 'Nice weather for exploring.', 'Fancy meeting you here.'][Math.floor(Math.random() * 3)];
  }
  if (speaker.personality?.melancholy > 0.7) {
    return ['Oh. Hello.', 'I suppose we meet again.', 'Hmm.'][Math.floor(Math.random() * 3)];
  }

  const generic = ['Hey there.', 'How goes it?', 'Hello.', 'Hmm.', 'What do you think of this place?'];
  return generic[Math.floor(Math.random() * generic.length)];
}

// ============================================================
// LEGACY FUNCTIONS (kept for backwards compatibility)
// ============================================================

/**
 * Generate a dwarf thought based on their state
 * @param {object} dwarf - Dwarf entity
 * @param {object} context - World context
 * @returns {Promise<string>}
 */
export async function generateThought(dwarf, context = {}) {
  const { nearbyDwarves = [], currentTile = '', recentEvents = [] } = context;

  const prompt = buildThoughtPrompt(dwarf, nearbyDwarves, currentTile, recentEvents);

  const thought = await queueGeneration(prompt, {
    maxTokens: 60,
    temperature: 0.9,
  });

  return thought || getDefaultThought(dwarf);
}

/**
 * Generate speech for dwarf-to-dwarf interaction
 * @param {object} speaker - Speaking dwarf
 * @param {object} listener - Listening dwarf
 * @param {string} speakerThought - Speaker's current internal thought
 * @param {object} context - Conversation context
 * @returns {Promise<string>}
 */
export async function generateSpeech(speaker, listener, speakerThought, context = {}) {
  const { relationshipHistory = [], topic = null } = context;

  const prompt = buildSpeechPrompt(speaker, listener, speakerThought, relationshipHistory, topic);

  const speech = await queueGeneration(prompt, {
    maxTokens: 40,
    temperature: 0.85,
    stop: ['\n', '"', '*'],
  });

  return speech || getDefaultSpeech(speaker);
}

/**
 * Build prompt for thought generation
 */
function buildThoughtPrompt(dwarf, nearbyDwarves, currentTile, recentEvents) {
  const personalityDesc = describePersonality(dwarf.personality);
  const moodDesc = describeMood(dwarf.mood);
  const hungerDesc = dwarf.hunger > 70 ? 'very hungry' : dwarf.hunger > 40 ? 'somewhat hungry' : 'satisfied';

  let nearbyDesc = '';
  if (nearbyDwarves.length > 0) {
    const generatedNames = nearbyDwarves.map(d => d.generatedName).join(', ');
    nearbyDesc = `Nearby: ${generatedNames}. `;
  }

  let eventsDesc = '';
  if (recentEvents.length > 0) {
    eventsDesc = `Recent: ${recentEvents.slice(0, 2).join('. ')}. `;
  }

  return `You are ${dwarf.generatedName}, a dwarf with a ${personalityDesc} personality. You feel ${moodDesc} and ${hungerDesc}. ${nearbyDesc}${eventsDesc}

Express a brief internal thought (1-2 sentences, first person). Be creative and show personality:`;
}

/**
 * Build prompt for speech generation
 */
function buildSpeechPrompt(speaker, listener, thought, history, topic) {
  const speakerPersonality = describePersonality(speaker.personality);
  const relationship = describeRelationship(speaker, listener, history);

  let topicHint = '';
  if (topic) {
    topicHint = `The conversation is about: ${topic}. `;
  }

  return `${speaker.generatedName} (${speakerPersonality}) is thinking: "${thought}"

${speaker.generatedName} wants to say something to ${listener.generatedName}. ${relationship} ${topicHint}

Write a brief, natural line of dialogue (1 sentence, no quotes):`;
}

/**
 * Describe personality traits
 */
function describePersonality(personality = {}) {
  const traits = [];
  if (personality.curiosity > 0.7) traits.push('curious');
  if (personality.curiosity < 0.3) traits.push('uninterested');
  if (personality.friendliness > 0.7) traits.push('friendly');
  if (personality.friendliness < 0.3) traits.push('grumpy');
  if (personality.bravery > 0.7) traits.push('brave');
  if (personality.bravery < 0.3) traits.push('cautious');
  if (personality.humor > 0.7) traits.push('witty');
  if (personality.melancholy > 0.7) traits.push('melancholic');

  return traits.length > 0 ? traits.join(', ') : 'average';
}

/**
 * Describe current mood
 */
function describeMood(mood = 50) {
  if (mood > 80) return 'happy and content';
  if (mood > 60) return 'relatively good';
  if (mood > 40) return 'neutral';
  if (mood > 20) return 'a bit down';
  return 'miserable';
}

/**
 * Describe relationship between two dwarves
 */
function describeRelationship(speaker, listener, history = []) {
  const relationship = speaker.relationships?.[listener.id];

  if (!relationship) {
    return `They don't know each other well.`;
  }

  const affinity = relationship.affinity || 0;
  if (affinity > 50) return `They are good friends.`;
  if (affinity > 20) return `They get along well.`;
  if (affinity < -20) return `They have some tension.`;
  if (affinity < -50) return `They don't like each other.`;
  return `They are acquaintances.`;
}

/**
 * Default thoughts when LLM is unavailable
 */
function getDefaultThought(dwarf) {
  const thoughts = [
    'I wonder what today will bring...',
    'This place feels different somehow.',
    'I should find something to eat soon.',
    'The others seem busy today.',
    'What was that noise?',
    'I feel like exploring.',
    'Maybe I should rest.',
  ];

  if (dwarf.hunger > 70) {
    return 'I really need to find food...';
  }
  if (dwarf.mood < 30) {
    return 'Nothing ever goes right...';
  }

  return thoughts[Math.floor(Math.random() * thoughts.length)];
}

/**
 * Default speech when LLM is unavailable
 */
function getDefaultSpeech(speaker) {
  const greetings = [
    'Hey there.',
    'How are things?',
    'Nice day, isn\'t it?',
    'Have you seen any food around?',
    'I was just thinking...',
    'Hmm.',
  ];

  return greetings[Math.floor(Math.random() * greetings.length)];
}

/**
 * Check if LLM server is available
 * @returns {Promise<boolean>}
 */
export async function checkConnection() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    
    try {
      console.log('[LLM] Connection check: connecting to', OLLAMA_URL);
      const response = await fetch(`${OLLAMA_URL}/api/tags`, {
        method: 'GET',
        signal: controller.signal,
        mode: 'cors',
        credentials: 'omit',
      });
      clearTimeout(timeoutId);
      console.log('[LLM] Connection check: response', response.status, response.ok ? '✓' : '✗');
      return response.ok;
    } finally {
      clearTimeout(timeoutId);
    }
  } catch (error) {
    console.warn('[LLM] Connection check failed:', error.message);
    return false;
  }
}

/**
 * Get current queue status
 */
export function getQueueStatus() {
  return {
    queued: requestQueue.length,
    active: activeRequests,
  };
}
