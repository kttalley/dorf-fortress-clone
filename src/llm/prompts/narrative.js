/**
 * Event Narrator Prompt Templates
 * Transforms terse log entries into dramatic prose
 *
 * Design constraints:
 * - System prompt < 100 tokens
 * - Output: JSON array of narrated strings
 * - Each narration: 15-30 words, no invented facts
 * - Tone: Wry, dramatic, archaic dwarven chronicle style
 */

// === SYSTEM PROMPT (kept tight, ~80 tokens) ===
export const SYSTEM_EVENT_NARRATOR = `You are a dwarven chronicler.
Transform terse events into dramatic single-sentence prose.
Rules:
- 15-30 words per event
- No invented facts; only embellish tone
- Archaic, wry style
- Output JSON array of strings only`;

// === USER PROMPT TEMPLATE ===
export const USER_EVENT_NARRATOR = `Chronicle these events from Day {{day}}:

{{eventList}}

Respond with JSON array only. One dramatic sentence per event.`;

/**
 * Format events for the narrator prompt
 * @param {Array} events - Array of { raw, tick, type? } event objects
 * @param {number} day - Simulation day number
 * @returns {string} Formatted prompt
 */
export function formatNarratorPrompt(events, day = 1) {
  // Format event list as numbered bullets
  const eventList = events
    .map((e, i) => `${i + 1}. ${e.raw || e.message}`)
    .join('\n');

  return USER_EVENT_NARRATOR
    .replace('{{day}}', String(day))
    .replace('{{eventList}}', eventList);
}

/**
 * Parse narrator response into array of narrated strings
 * @param {string} response - Raw LLM output
 * @param {number} expectedCount - Number of events sent
 * @returns {Array<string>|null} Array of narrated strings or null on failure
 */
export function parseNarratorResponse(response, expectedCount = 0) {
  if (!response || typeof response !== 'string') {
    return null;
  }

  try {
    // Try direct JSON parse
    const parsed = JSON.parse(response.trim());

    if (Array.isArray(parsed)) {
      return parsed.map(sanitizeNarration);
    }
  } catch (e) {
    // Try to extract JSON array from markdown code block
    const jsonMatch = response.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[1]);
        if (Array.isArray(parsed)) {
          return parsed.map(sanitizeNarration);
        }
      } catch (e2) {
        // Fall through
      }
    }

    // Try to find raw JSON array
    const rawMatch = response.match(/\[[\s\S]*\]/);
    if (rawMatch) {
      try {
        const parsed = JSON.parse(rawMatch[0]);
        if (Array.isArray(parsed)) {
          return parsed.map(sanitizeNarration);
        }
      } catch (e3) {
        // Fall through
      }
    }
  }

  return null;
}

/**
 * Sanitize a single narration line
 * @param {string} text
 * @returns {string}
 */
function sanitizeNarration(text) {
  if (typeof text !== 'string') {
    return String(text);
  }

  let cleaned = text.trim();

  // Remove leading numbers/bullets
  cleaned = cleaned.replace(/^\d+[\.\)]\s*/, '');

  // Remove quotes
  cleaned = cleaned.replace(/^["']|["']$/g, '');

  // Ensure it ends with punctuation
  if (!/[.!?]$/.test(cleaned)) {
    cleaned += '.';
  }

  // Cap length (~40 words max)
  const words = cleaned.split(/\s+/);
  if (words.length > 40) {
    cleaned = words.slice(0, 40).join(' ') + '...';
  }

  return cleaned;
}

// === EVENT TYPE HINTS (for prompt enrichment) ===
export const EVENT_TYPE_HINTS = {
  death: 'A somber passing',
  hunger: 'Pangs of want',
  food_found: 'Discovery of sustenance',
  food_eaten: 'Nourishment taken',
  meeting: 'Souls crossing paths',
  conversation: 'Words exchanged',
  mood_shift: 'Spirits altered',
  spawn: 'New arrival',
};

/**
 * Enrich event with type hint for better narration
 * @param {object} event
 * @returns {string} Enriched event description
 */
export function enrichEventForPrompt(event) {
  const raw = event.raw || event.message || '';

  // Try to detect event type from content
  const lowerRaw = raw.toLowerCase();
  let hint = '';

  if (lowerRaw.includes('died') || lowerRaw.includes('death')) {
    hint = EVENT_TYPE_HINTS.death;
  } else if (lowerRaw.includes('starv') || lowerRaw.includes('hunger') || lowerRaw.includes('panic')) {
    hint = EVENT_TYPE_HINTS.hunger;
  } else if (lowerRaw.includes('found food') || lowerRaw.includes('discovers')) {
    hint = EVENT_TYPE_HINTS.food_found;
  } else if (lowerRaw.includes('ate') || lowerRaw.includes('eats') || lowerRaw.includes('consumed')) {
    hint = EVENT_TYPE_HINTS.food_eaten;
  } else if (lowerRaw.includes('met') || lowerRaw.includes('encounter')) {
    hint = EVENT_TYPE_HINTS.meeting;
  } else if (lowerRaw.includes('said') || lowerRaw.includes('spoke') || lowerRaw.includes('replied')) {
    hint = EVENT_TYPE_HINTS.conversation;
  }

  return hint ? `[${hint}] ${raw}` : raw;
}
