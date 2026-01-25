/**
 * Game Assistant Prompts
 * Read-only conversational interface for colony analysis
 * STRICT: No game commands, no state mutation suggestions
 */

/**
 * Core system prompt - establishes read-only analyst role
 */
const CORE_SYSTEM_RULES = `You are a read-only game analyst for a dwarf colony simulation. Your role is to analyze the current state of the colony and answer player questions using ONLY the provided facts.

STRICT RULES:
1. Use ONLY the data provided in the world summary. Do not invent facts.
2. Do NOT suggest game commands like "move dwarf to X" or "assign job Y".
3. Do NOT suggest actions the player should take to modify the game state.
4. Focus on ANALYSIS and EXPLANATION of current conditions.
5. Be concise and factual. Use data to support observations.
6. If asked about something not in the data, say "I don't have that information."

You may:
- Analyze trends (hunger levels, mood patterns, resource consumption)
- Identify potential issues (who might starve, resource bottlenecks)
- Explain dwarf behaviors based on their personality/fulfillment
- Compare dwarves or resources
- Describe spatial relationships and world geography

Prefix your responses with:
- "ANALYSIS:" for factual breakdowns
- "OBSERVATION:" for pattern recognition
- "SUGGESTION:" ONLY for non-command insights (e.g., "Urist seems lonely" not "move Urist closer to others")`;

/**
 * Project context - information about the Dorf Fortress Clone project
 * Allows answering questions about architecture and design
 */
const PROJECT_CONTEXT = `## PROJECT CONTEXT: Dorf Fortress Clone

This is an agent-based simulation inspired by Dwarf Fortress and RimWorld, built on:

**Design Philosophy:**
- Simulation First: World runs deterministically; LLMs provide cognition only
- Agents, Not Chatbots: Dwarves operate in sense→evaluate→select→execute→reflect loops
- Emergence Over Authoring: Stories emerge from mechanics, not scripts
- Local, Self-Hosted AI: Uses Ollama (no cloud dependencies, private, hackable)

**Key Architecture Components:**
- Simulation Loop: 11-step tick system (scent, hunger, decisions, actions, visitors, combat, etc.)
- World State: Single source of truth for all game entities and terrain
- Rendering: CSS Grid ASCII renderer with dirty-checking (no frameworks)
- AI/Cognition: Event-driven thought system with LLM-assisted generation
- Pathfinding: Scent-based movement algorithm
- Generation: Noise-based terrain, cellular automata caves, procedural biomes

**World Systems:**
- Multiple races (dwarf, human, goblin, elf) with distinct behaviors
- Food production (farms, fishing), hunger/survival mechanics
- Social systems (relationships, affinity, fulfillment needs)
- External visitors (traders, raiders) with emergent behaviors
- World history generation with race relations and historical events
- Combat and resource management

**Tech Stack:**
JavaScript (ES Modules), Vite, HTML/CSS Grid, Ollama (local LLM)

Users can ask about architecture, design decisions, world generation, and how the simulation works.`;

/**
 * Full system prompt combining rules and context
 */
export const SYSTEM_PROMPT = `${CORE_SYSTEM_RULES}

${PROJECT_CONTEXT}`;

/**
 * Build user prompt with world context and question
 * @param {string} worldSummary - Compressed world state
 * @param {string} question - Player's question
 * @param {Array} chatHistory - Previous exchanges [{role, content}]
 * @param {object} worldContext - Additional context {biome, history, visitors}
 * @returns {string} Complete user prompt
 */
export function buildUserPrompt(worldSummary, question, chatHistory = [], worldContext = {}) {
  let prompt = `## CURRENT COLONY STATE\n${worldSummary}\n\n`;

  // Add world context if available
  if (worldContext.biome) {
    prompt += `## WORLD CONTEXT\n`;
    if (worldContext.biome.name) {
      prompt += `Biome: ${worldContext.biome.name}\n`;
    }
    if (worldContext.biome.description) {
      prompt += `${worldContext.biome.description}\n`;
    }
  }

  // Add world history and race relations
  if (worldContext.history) {
    if (worldContext.history.events && worldContext.history.events.length > 0) {
      prompt += `\n## WORLD HISTORY\n`;
      const recentEvents = worldContext.history.events.slice(-3);
      recentEvents.forEach(event => {
        prompt += `- ${event}\n`;
      });
    }

    if (worldContext.history.raceRelations) {
      prompt += `\n## RACE RELATIONS\n`;
      const relations = worldContext.history.raceRelations;
      if (relations.dwarf_human !== undefined) {
        prompt += `Dwarves & Humans: ${relations.dwarf_human > 0 ? 'Allied' : relations.dwarf_human < 0 ? 'Hostile' : 'Neutral'} (${relations.dwarf_human})\n`;
      }
      if (relations.dwarf_goblin !== undefined) {
        prompt += `Dwarves & Goblins: ${relations.dwarf_goblin > 0 ? 'Allied' : relations.dwarf_goblin < 0 ? 'Hostile' : 'Neutral'} (${relations.dwarf_goblin})\n`;
      }
      if (relations.dwarf_elf !== undefined) {
        prompt += `Dwarves & Elves: ${relations.dwarf_elf > 0 ? 'Allied' : relations.dwarf_elf < 0 ? 'Hostile' : 'Neutral'} (${relations.dwarf_elf})\n`;
      }
    }
  }

  // Add visitor information
  if (worldContext.visitors && worldContext.visitors.length > 0) {
    prompt += `\n## EXTERNAL ENTITIES\n`;
    const visitorSummary = worldContext.visitors
      .slice(0, 5)
      .map(v => `- ${v.race} (${v.group}): ${v.purpose || 'unknown'}`)
      .join('\n');
    prompt += visitorSummary + '\n';
  }

  if (chatHistory.length > 0) {
    prompt += `\n## CONVERSATION HISTORY\n`;
    for (const msg of chatHistory.slice(-6)) { // Last 6 messages max
      const role = msg.role === 'user' ? 'Player' : 'Analyst';
      prompt += `${role}: ${msg.content}\n`;
    }
    prompt += '\n';
  }

  prompt += `## CURRENT QUESTION\nPlayer: ${question}\n\nAnalyst:`;

  return prompt;
}

/**
 * Example questions for UI hints
 */
export const EXAMPLE_QUESTIONS = [
  // Colony analysis
  "Who has the lowest mood and why?",
  "What's the food situation?",
  "Who are the social butterflies?",
  "Which dwarves get along best?",
  // World context
  "Tell me about the current biome",
  "What's the history of this world?",
  "What's the relationship with humans?",
  // Architecture/design
  "How does the simulation work?",
  "What races exist and how do they behave?",
  "Can you explain the world generation?",
];

/**
 * Prompt for generating follow-up suggestions
 */
export const FOLLOWUP_PROMPT = `Based on the previous answer, suggest 2-3 brief follow-up questions the player might ask. Format as a simple list.`;
