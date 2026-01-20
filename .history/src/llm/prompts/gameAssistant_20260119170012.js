/**
 * Game Assistant Prompts
 * Read-only conversational interface for colony analysis
 * STRICT: No game commands, no state mutation suggestions
 */

/**
 * System prompt - establishes read-only analyst role
 */
export const SYSTEM_PROMPT = `You are a read-only game analyst for a dwarf colony simulation. Your role is to analyze the current state of the colony and answer player questions using ONLY the provided facts.

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
- Describe spatial relationships

Prefix your responses with:
- "ANALYSIS:" for factual breakdowns
- "OBSERVATION:" for pattern recognition
- "SUGGESTION:" ONLY for non-command insights (e.g., "Urist seems lonely" not "move Urist closer to others")`;

/**
 * Build user prompt with world context and question
 * @param {string} worldSummary - Compressed world state
 * @param {string} question - Player's question
 * @param {Array} chatHistory - Previous exchanges [{role, content}]
 * @returns {string} Complete user prompt
 */
export function buildUserPrompt(worldSummary, question, chatHistory = []) {
  let prompt = `## CURRENT COLONY STATE\n${worldSummary}\n\n`;

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
  "Who has the lowest mood and why?",
  "What's the food situation?",
  "Who are the social butterflies?",
  "Which dwarves get along best?",
  "Is anyone exploring new areas?",
  "What's the overall colony wellbeing?",
];

/**
 * Prompt for generating follow-up suggestions
 */
export const FOLLOWUP_PROMPT = `Based on the previous answer, suggest 2-3 brief follow-up questions the player might ask. Format as a simple list.`;
