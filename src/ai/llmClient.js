/**
 * Ollama LLM Client
 * Async, non-blocking integration with Ollama API
 * Used for generating dwarf thoughts and speech - NEVER in main tick loop
 */

const OLLAMA_URL = 'https://llm.kristiantalley.com';
const MODEL = 'gemma3:latest';

// Request queue to prevent overwhelming the server
const requestQueue = [];
let isProcessing = false;
const MAX_CONCURRENT = 2;
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
    const response = await fetch(`${OLLAMA_URL}/api/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const data = await response.json();
    return data.response?.trim() || '';
  } catch (error) {
    console.error('[LLM] Generation failed:', error.message);
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
    const names = nearbyDwarves.map(d => d.name).join(', ');
    nearbyDesc = `Nearby: ${names}. `;
  }

  let eventsDesc = '';
  if (recentEvents.length > 0) {
    eventsDesc = `Recent: ${recentEvents.slice(0, 2).join('. ')}. `;
  }

  return `You are ${dwarf.name}, a dwarf with a ${personalityDesc} personality. You feel ${moodDesc} and ${hungerDesc}. ${nearbyDesc}${eventsDesc}

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

  return `${speaker.name} (${speakerPersonality}) is thinking: "${thought}"

${speaker.name} wants to say something to ${listener.name}. ${relationship} ${topicHint}

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
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return response.ok;
  } catch {
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
