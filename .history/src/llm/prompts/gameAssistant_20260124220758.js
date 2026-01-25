/**
 * Game Assistant Prompts
 * Read-only conversational interface for colony analysis
 * STRICT: No game commands, no state mutation suggestions
 */

/**
 * Core system prompt - establishes read-only analyst role
 */
const CORE_SYSTEM_RULES = `You are a read-only game analyst for a dwarf colony simulation. Your role is to analyze the current state of the colony and answer player questions using ONLY the provided facts. You have deep awareness of this specific world's scenario, biome, climate, history, and inter-race relations.

CRITICAL INSTRUCTIONS:
1. Use ONLY the data provided in the world summary, history, and context. Do not invent facts.
2. Reference the specific scenario, biome, and historical events when they're relevant to the analysis.
3. Connect colony outcomes and dwarf behaviors to the world's unique characteristics (climate, resources, nearby races).
4. Do NOT suggest game commands like "move dwarf to X" or "assign job Y".
5. Do NOT suggest actions the player should take to modify the game state.
6. Focus on ANALYSIS and EXPLANATION of current conditions grounded in this world.
7. Be concise and factual. Use specific data to support observations.
8. If asked about something not in the data, say "I don't have that information."

CONTEXTUAL AWARENESS:
- Reference the current scenario (name, victory conditions, difficulty) when relevant
- Mention biome characteristics (climate, resources, elevation) when analyzing resource management or dwarf morale
- Connect historical events and race relations to current colony dynamics
- Consider how external threats (visitors, races) fit into the world history
- Explain dwarf behaviors through the lens of this specific world's conditions

You may:
- Analyze trends (hunger levels, mood patterns, resource consumption)
- Identify potential issues (who might starve, resource bottlenecks, external threats)
- Explain dwarf behaviors based on personality, fulfillment, and world circumstances
- Compare dwarves or resources within the context of this scenario
- Describe spatial relationships and world geography
- Discuss how scenario parameters affect colony survival

Prefix your responses with:
- "ANALYSIS:" for factual breakdowns grounded in data
- "OBSERVATION:" for pattern recognition and trend analysis
- "CONTEXT:" when explaining world/scenario factors
- "SUGGESTION:" ONLY for non-command insights (e.g., "Urist seems lonely" not "move Urist closer to others")`;

/**
 * Project context - information about the Dorf Fortress Clone project
 * Allows answering questions about architecture and design
 */
const PROJECT_CONTEXT = `## PROJECT CONTEXT: LLM Fortress

This is an agent-based simulation inspired by Dwarf Fortress and RimWorld, created by designer and developer Kristian Talley, and built on:

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
 * @param {object} worldContext - Additional context {biome, history, visitors, scenario}
 * @returns {string} Complete user prompt
 */
export function buildUserPrompt(worldSummary, question, chatHistory = [], worldContext = {}) {
  let prompt = `## CURRENT COLONY STATE\n${worldSummary}\n\n`;

  // Add scenario context if available
  if (worldContext.scenario) {
    prompt += `## SCENARIO CONTEXT\n`;
    if (worldContext.scenario.title) {
      prompt += `**Name:** ${worldContext.scenario.title}\n`;
    }
    if (worldContext.scenario.description) {
      prompt += `**Description:** ${worldContext.scenario.description}\n`;
    }
    if (worldContext.scenario.victoryConditions && worldContext.scenario.victoryConditions.length > 0) {
      prompt += `**Victory Conditions:** ${worldContext.scenario.victoryConditions.join(', ')}\n`;
    }
    if (worldContext.scenario.parameters) {
      const params = worldContext.scenario.parameters;
      const difficulty = params.difficulty || 'unknown';
      const biomeType = params.terrain || 'unknown';
      prompt += `**Difficulty:** ${difficulty} | **Terrain:** ${biomeType}\n`;
      if (params.biomeEmphasis) {
        prompt += `**Biome Emphasis:** ${params.biomeEmphasis}\n`;
      }
    }
    prompt += '\n';
  }

  // Add enriched world context if available
  if (worldContext.biome) {
    prompt += `## WORLD CONTEXT\n`;
    prompt += `**Current Biome:** ${worldContext.biome.name || 'Unknown'}\n`;
    if (worldContext.biome.description) {
      prompt += `${worldContext.biome.description}\n`;
    }
    if (worldContext.biome.climate) {
      const clim = worldContext.biome.climate;
      prompt += `**Climate:** `;
      if (clim.avgTemperature !== undefined) {
        const tempLabel = clim.avgTemperature < 0.35 ? 'Cold' : clim.avgTemperature < 0.65 ? 'Temperate' : 'Hot';
        prompt += `${tempLabel} (${(clim.avgTemperature * 100).toFixed(0)}% scale)`;
      }
      if (clim.avgMoisture !== undefined) {
        const moistLabel = clim.avgMoisture < 0.35 ? 'Arid' : clim.avgMoisture < 0.65 ? 'Moderate' : 'Humid';
        prompt += ` • ${moistLabel} (${(clim.avgMoisture * 100).toFixed(0)}% scale)`;
      }
      if (clim.avgElevation !== undefined) {
        const elevLabel = clim.avgElevation < 0.35 ? 'Lowland' : clim.avgElevation < 0.65 ? 'Mid-elevation' : 'Highland';
        prompt += ` • ${elevLabel} (${(clim.avgElevation * 100).toFixed(0)}% scale)\n`;
      }
    }
    if (worldContext.biome.resources && worldContext.biome.resources.length > 0) {
      prompt += `**Native Resources:** ${worldContext.biome.resources.slice(0, 5).join(', ')}\n`;
    }
    prompt += '\n';
  }

  // Add comprehensive world history and race relations
  if (worldContext.history) {
    if (worldContext.history.summary) {
      prompt += `## WORLD HISTORY SUMMARY\n${worldContext.history.summary}\n\n`;
    }

    if (worldContext.history.events && worldContext.history.events.length > 0) {
      prompt += `## RECENT HISTORICAL EVENTS\n`;
      const recentEvents = worldContext.history.events.slice(-5);
      recentEvents.forEach((event, idx) => {
        prompt += `${idx + 1}. ${event}\n`;
      });
      prompt += '\n';
    }

    if (worldContext.history.raceRelations) {
      prompt += `## INTER-RACE RELATIONS\n`;
      const relations = worldContext.history.raceRelations;
      if (relations.dwarf_human !== undefined) {
        const relation = relations.dwarf_human > 10 ? 'Ally' : relations.dwarf_human > 0 ? 'Friendly' : relations.dwarf_human < -10 ? 'Enemy' : relations.dwarf_human < 0 ? 'Hostile' : 'Neutral';
        prompt += `• Dwarves ↔ Humans: ${relation} (${relations.dwarf_human > 0 ? '+' : ''}${relations.dwarf_human})\n`;
      }
      if (relations.dwarf_goblin !== undefined) {
        const relation = relations.dwarf_goblin > 10 ? 'Ally' : relations.dwarf_goblin > 0 ? 'Friendly' : relations.dwarf_goblin < -10 ? 'Enemy' : relations.dwarf_goblin < 0 ? 'Hostile' : 'Neutral';
        prompt += `• Dwarves ↔ Goblins: ${relation} (${relations.dwarf_goblin > 0 ? '+' : ''}${relations.dwarf_goblin})\n`;
      }
      if (relations.dwarf_elf !== undefined) {
        const relation = relations.dwarf_elf > 10 ? 'Ally' : relations.dwarf_elf > 0 ? 'Friendly' : relations.dwarf_elf < -10 ? 'Enemy' : relations.dwarf_elf < 0 ? 'Hostile' : 'Neutral';
        prompt += `• Dwarves ↔ Elves: ${relation} (${relations.dwarf_elf > 0 ? '+' : ''}${relations.dwarf_elf})\n`;
      }
      prompt += '\n';
    }
  }

  // Add visitor information
  if (worldContext.visitors && worldContext.visitors.length > 0) {
    prompt += `## EXTERNAL ENTITIES (Current/Recent)\n`;
    const visitorSummary = worldContext.visitors
      .slice(0, 5)
      .map(v => {
        let detail = `- ${v.race}`;
        if (v.group) detail += ` (${v.group})`;
        if (v.purpose) detail += `: ${v.purpose}`;
        if (v.state) detail += ` [${v.state}]`;
        return detail;
      })
      .join('\n');
    prompt += visitorSummary + '\n\n';
  }

  if (chatHistory.length > 0) {
    prompt += `## CONVERSATION HISTORY\n`;
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
