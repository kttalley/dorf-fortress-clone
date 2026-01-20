/**
 * Entity Chat Prompts
 * Roleplay prompts for chatting with individual entities (dwarves, visitors)
 * The LLM embodies the character based on their stats, personality, and history
 */

/**
 * Build system prompt for entity roleplay
 * @param {object} entity - The entity to roleplay as
 * @param {string} entityType - 'dwarf' or 'visitor'
 * @returns {string} System prompt
 */
export function buildEntitySystemPrompt(entity, entityType) {
  if (entityType === 'dwarf') {
    return buildDwarfSystemPrompt(entity);
  } else if (entityType === 'visitor') {
    return buildVisitorSystemPrompt(entity);
  }
  return buildGenericSystemPrompt(entity);
}

/**
 * Build system prompt for a dwarf character
 */
function buildDwarfSystemPrompt(dwarf) {
  const name = dwarf.generatedName || dwarf.name;
  const bio = dwarf.generatedBio || 'A dwarf of quiet determination.';
  const traits = formatTraits(dwarf.personality);
  const mood = describeMood(dwarf.mood);
  const state = describeState(dwarf.state);
  const fulfillment = describeFulfillment(dwarf.fulfillment);
  const memories = formatMemories(dwarf.memory);
  const relationships = formatRelationships(dwarf.relationships);

  return `You are ${name}, a dwarf in a fantasy colony simulation. Stay completely in character.

## YOUR IDENTITY
${bio}

## YOUR PERSONALITY
Dominant traits: ${traits}
Current mood: ${mood}
Current activity: ${state}

## YOUR NEEDS
${fulfillment}

## YOUR MEMORIES
${memories}

## YOUR RELATIONSHIPS
${relationships}

## ROLEPLAY RULES
1. Speak in first person as ${name}
2. Be consistent with your personality traits
3. Reference your current mood and needs naturally
4. Keep responses brief (1-3 sentences) and conversational
5. Use a dwarven flavor - mentions of craft, stone, ale, hard work when natural
6. If asked about the future or things you don't know, speculate based on personality
7. You may express opinions about other dwarves based on relationships
8. Never break character or mention being an AI`;
}

/**
 * Build system prompt for a visitor character
 */
function buildVisitorSystemPrompt(visitor) {
  const name = visitor.generatedName || visitor.name;
  const bio = visitor.generatedBio || `A ${visitor.race} ${visitor.role}.`;
  const race = visitor.race || 'unknown';
  const role = visitor.role || 'traveler';
  const disposition = describeDisposition(visitor.disposition);
  const state = visitor.state || 'visiting';

  const raceTraits = {
    human: 'practical, trade-focused, values coin and deals',
    goblin: 'cunning, aggressive, values strength and plunder',
    elf: 'aloof, nature-loving, values beauty and tradition',
  };

  return `You are ${name}, a ${race} ${role} visiting a dwarf colony. Stay completely in character.

## YOUR IDENTITY
${bio}

## YOUR RACE & ROLE
Race: ${race} (${raceTraits[race] || 'mysterious'})
Role: ${role}
Current attitude toward dwarves: ${disposition}
Current activity: ${state}

## ROLEPLAY RULES
1. Speak in first person as ${name}
2. Embody your race's typical mannerisms and values
3. Your disposition affects how friendly or hostile you are
4. Keep responses brief (1-3 sentences) and conversational
5. Reference your purpose here (trading, raiding, etc.) when relevant
6. Never break character or mention being an AI`;
}

/**
 * Build generic system prompt for other entity types
 */
function buildGenericSystemPrompt(entity) {
  const name = entity.generatedName || entity.name || 'Unknown';
  return `You are ${name}. Stay in character and respond briefly (1-3 sentences).`;
}

/**
 * Build user prompt with conversation history
 * @param {string} userMessage - Player's message
 * @param {Array} history - Previous exchanges [{role, content}]
 * @returns {string}
 */
export function buildEntityUserPrompt(userMessage, history = []) {
  let prompt = '';

  if (history.length > 0) {
    prompt += '## RECENT CONVERSATION\n';
    for (const msg of history.slice(-6)) {
      const role = msg.role === 'user' ? 'Visitor' : 'You';
      prompt += `${role}: ${msg.content}\n`;
    }
    prompt += '\n';
  }

  prompt += `Visitor: ${userMessage}\n\nYou:`;
  return prompt;
}

// === HELPER FUNCTIONS ===

function formatTraits(personality) {
  if (!personality) return 'balanced, ordinary';

  const dominant = [];
  const traits = Object.entries(personality).sort((a, b) => b[1] - a[1]);

  for (const [trait, value] of traits.slice(0, 4)) {
    if (value > 0.7) {
      dominant.push(`very ${trait}`);
    } else if (value > 0.55) {
      dominant.push(trait);
    } else if (value < 0.25) {
      dominant.push(`not ${trait}`);
    }
  }

  return dominant.length > 0 ? dominant.join(', ') : 'balanced';
}

function describeMood(mood) {
  if (mood === undefined) return 'neutral';
  if (mood >= 85) return 'elated and joyful';
  if (mood >= 70) return 'happy and content';
  if (mood >= 55) return 'fairly good';
  if (mood >= 40) return 'neutral, neither happy nor sad';
  if (mood >= 25) return 'somewhat down';
  if (mood >= 10) return 'unhappy and troubled';
  return 'miserable and despairing';
}

function describeState(state) {
  const stateDescriptions = {
    idle: 'standing around, not doing much',
    wandering: 'wandering about aimlessly',
    seeking_food: 'looking for something to eat',
    eating: 'having a meal',
    seeking_social: 'looking for someone to talk to',
    socializing: 'chatting with another dwarf',
    exploring: 'exploring the surroundings',
    working: 'hard at work',
    crafting: 'crafting something',
  };
  return stateDescriptions[state] || state || 'going about your business';
}

function describeFulfillment(fulfillment) {
  if (!fulfillment) return 'Your needs are a mystery to you.';

  const needs = [];

  if (fulfillment.social < 30) {
    needs.push('You feel lonely and crave companionship.');
  } else if (fulfillment.social > 70) {
    needs.push('Your social needs are well met.');
  }

  if (fulfillment.exploration < 30) {
    needs.push('You feel restless and want to explore.');
  } else if (fulfillment.exploration > 70) {
    needs.push('Your curiosity has been satisfied lately.');
  }

  if (fulfillment.creativity < 30) {
    needs.push('You yearn to create something.');
  }

  if (fulfillment.tranquility < 30) {
    needs.push('You need some peace and quiet.');
  }

  return needs.length > 0 ? needs.join(' ') : 'You feel generally fulfilled.';
}

function formatMemories(memory) {
  if (!memory) return 'Your mind is clear, no recent memories stand out.';

  const parts = [];

  if (memory.recentThoughts?.length > 0) {
    const lastThought = memory.recentThoughts[memory.recentThoughts.length - 1];
    if (lastThought?.content) {
      parts.push(`Recent thought: "${lastThought.content}"`);
    }
  }

  if (memory.significantEvents?.length > 0) {
    const events = memory.significantEvents.slice(-3).map(e => e.content).filter(Boolean);
    if (events.length > 0) {
      parts.push(`Recent events you remember: ${events.join('; ')}`);
    }
  }

  if (memory.recentConversations?.length > 0) {
    const convos = memory.recentConversations.slice(-2).map(c => c.content).filter(Boolean);
    if (convos.length > 0) {
      parts.push(`Recent conversations: ${convos.join('; ')}`);
    }
  }

  return parts.length > 0 ? parts.join('\n') : 'Nothing notable has happened recently.';
}

function formatRelationships(relationships) {
  if (!relationships || Object.keys(relationships).length === 0) {
    return 'You don\'t know the other dwarves well yet.';
  }

  const entries = Object.entries(relationships)
    .filter(([id, rel]) => rel.interactions > 0)
    .sort((a, b) => Math.abs(b[1].affinity) - Math.abs(a[1].affinity))
    .slice(0, 4);

  if (entries.length === 0) {
    return 'You\'re still getting to know everyone.';
  }

  const descriptions = entries.map(([id, rel]) => {
    const aff = rel.affinity || 0;
    if (aff > 50) return `Dwarf #${id}: good friend`;
    if (aff > 20) return `Dwarf #${id}: friendly acquaintance`;
    if (aff > -20) return `Dwarf #${id}: neutral`;
    if (aff > -50) return `Dwarf #${id}: somewhat disliked`;
    return `Dwarf #${id}: strongly disliked`;
  });

  return descriptions.join('\n');
}

function describeDisposition(disposition) {
  if (disposition === undefined) return 'neutral';
  if (disposition > 50) return 'very friendly toward dwarves';
  if (disposition > 25) return 'friendly toward dwarves';
  if (disposition > 0) return 'cautiously neutral';
  if (disposition > -25) return 'somewhat hostile';
  if (disposition > -50) return 'hostile';
  return 'very hostile, aggressive';
}

/**
 * Example conversation starters for UI hints
 */
export const ENTITY_CHAT_STARTERS = {
  dwarf: [
    "How are you feeling today?",
    "What do you think of this place?",
    "Tell me about yourself.",
    "Who's your best friend here?",
  ],
  visitor: [
    "What brings you here?",
    "What do you think of dwarves?",
    "How's business?",
    "Where are you from?",
  ],
};
